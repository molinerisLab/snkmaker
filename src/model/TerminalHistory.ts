import { TerminalShellExecutionCommandLineConfidence } from "vscode";
import { LLM } from "./ModelComms";
import { Queries } from "./Queries";
import { assert } from "console";
import { SnkmakerLogger } from "../utils/SnkmakerLogger";
import * as vscode from 'vscode';
import { TestRules } from "../utils/TestRules";
import { ExtensionSettings } from "../utils/ExtensionSettings";

//Undo/Redo stack for the terminal history
const STACK_SIZE = 4;
class UndoRedoStack{
    stack: (string | null)[] = [];
    index: number = -1;
    undoCount = -1;
    redoCount = 0;
    constructor(){
        for (let i = 0; i < STACK_SIZE; i++){
            this.stack.push(null);
        }
    }

    push(state: string){
        this.index = (this.index + 1) % STACK_SIZE;
        this.stack[this.index] = state;
        this.undoCount ++;
        this.redoCount = 0;
    }

    undo(): string | null{
        if (this.undoCount === 0){
            return null;
        }
        this.index = (this.index - 1 + STACK_SIZE) % STACK_SIZE;
        this.undoCount --;
        this.redoCount ++;
        return this.stack[this.index];
    }
    redo(): string | null{
        if (this.redoCount === 0){
            return null;
        }
        this.index = (this.index + 1) % STACK_SIZE;
        this.undoCount ++;
        this.redoCount --;
        return this.stack[this.index];
    }
}

export class TerminalHistory {
    history: BashCommandContainer[];
    archive: BashCommandContainer[];
    queries: Queries;
    index: number;
    testRules: TestRules = new TestRules();
    undoRedoStack: UndoRedoStack;
    constructor(private llm: LLM, private memento: vscode.Memento) {
        this.history = [];
        this.archive = [];
        this.queries = new Queries(this.llm);
        this.index = 0;
        this.undoRedoStack = new UndoRedoStack();
        this.saveState(true);
    }

    getHistory() {
        return this.history;
    }

    getArchive() {
        return this.archive;
    }

    async addCommand(value: string, confidence: TerminalShellExecutionCommandLineConfidence, isTrusted: boolean) {
        const indexExisting = this.isCommandInHistory(value);
        if (indexExisting !== -1) {
            const command = this.history[indexExisting];
            this.history.splice(indexExisting, 1);
            this.history.push(command);
            SnkmakerLogger.instance()?.addCommandExisting(command, value);
            return;
        }
        const singleTempCommand = new SingleBashCommand(value, 0, "", "", false, this.index, true);
        const tempCommand = new BashCommandContainer(singleTempCommand, this.index+1);
        this.index+=2;
        this.history.push(tempCommand);
        SnkmakerLogger.instance()?.addCommand(tempCommand);
        
        //Get positive and negative examples
        let positiveExamples = this.history.filter(command => command.getImportant() === true && command.getTemporary()===false).map(command => command.getCommand());
        let negativeExamples = this.history.filter(command => command.getImportant() === false && command.getTemporary()===false).map(command => command.getCommand());
        //Don't send more than 35 examples each
        positiveExamples = positiveExamples.slice(0, 35);
        negativeExamples = negativeExamples.slice(0, 35);

        const important = this.queries.guessIfCommandImportant(value, positiveExamples, negativeExamples);
        const guesses = this.queries.guessRuleDetails(value);
        //Wait for both promises to resolve
        await Promise.all([important, guesses]).then((values) => {
            const important = values[0];
            const guesses = values[1];
            singleTempCommand.setInput(guesses[0]);
            singleTempCommand.setOutput(guesses[1]);
            singleTempCommand.setRuleName(guesses[2]);
            singleTempCommand.setImportance(important);
            tempCommand.setTemporary(false);
            this.saveState();
            SnkmakerLogger.instance()?.commandDetails(tempCommand);
        }).catch((e) => {;
            this.history.splice(this.history.indexOf(tempCommand), 1);
            throw e;
        });
    }

    //Returns index of the command in the history, -1 if not found
    //if it's subcommand returns input of parent
    //TODO: can be optimized w.t some hashmap
    private isCommandInHistory(command: string) {
        for (var i = 0; i < this.history.length; i++) {
            const c = this.history[i];
            if (c.getNumChildren() === 0 && c.getCommand() === command) {
                return i;
            }
            for (var j = 0; j < c.getNumChildren(); j++) {
                if (c.getChildren(j)?.getCommand() === command) {
                    return i;
                }
            }
        }
        return -1;
    }

    archiveCommand(command: BashCommandContainer) {
        const index = this.history.indexOf(command);
        if (index > -1 && command.getTemporary()===false) {
            this.history.splice(index, 1);
            this.archive.push(command);
        }
        this.saveState();
    }
    
    deleteCommand(command: BashCommandContainer): boolean {
        let index = this.history.indexOf(command);
        if (index > -1) {
            this.history.splice(index, 1);
            this.saveState();
            return true;
        } 
        index = this.archive.indexOf(command);
        if (index > -1) {
            this.archive.splice(index, 1);
            this.saveState();
            return false;
        }
        throw new Error("Command does not exist");
    }

    deleteAllCommands() {
        this.history = [];
        this.saveState();
    }

    deleteAllArchivedCommands() {
        this.archive = [];
        this.saveState();
    }

    restoreCommand(command: BashCommandContainer) {
        const index = this.archive.indexOf(command);
        const indexExisting = this.isCommandInHistory(command.getCommand());
        if (index > -1) {
            this.archive.splice(index, 1);
            if (indexExisting === -1) {
                this.history.push(command);
            } else {
                //Move the command to the end of the history
                this.history.splice(indexExisting, 1);
                this.history.push(command);
            }
        }
        this.saveState();
    }
    archiveAllCommands() {
        this.archive = this.archive.concat(this.history);
        this.history = [];
        this.saveState();
    }

    setCommandImportance(command: BashCommand, importance: boolean) {
        command.setImportance(importance);
        this.saveState();
        SnkmakerLogger.instance()?.setCommandImportance(command, importance);
    }

    private async validateAndCorrectRules(rules: string){
        //Only if it is in Snakemake format and the user has not disabled the setting
        if (! (ExtensionSettings.instance.getRulesOutputFormat()==="Snakemake" && ExtensionSettings.instance.getValidateSnakemakeRules())){
            return rules;
        }
        //TODO: max tries should be a setting or a configuration
        for (let i = 0; i < 3; i++){
            const valid: { success: boolean; message?: string;} = await this.testRules.validateRules(rules);
            if (valid.success){
                return rules;
            }
            SnkmakerLogger.instance()?.log(`Generated rule not valid: ${valid.message}`);
            rules = await this.queries.autoCorrectRulesFromError(rules, valid.message||"");
            SnkmakerLogger.instance()?.log(`Corrected rule: ${rules}`);
        }
        return rules;
    }

    async getRule(command: BashCommand): Promise<string>{
        if (command.getTemporary()===true){
            throw new Error("Command is being processed - please wait before exporting the rule.");
        }
        command.setTemporary(true);
        try {
            let rule = await this.queries.getRuleFromCommand(command);
            rule = await this.validateAndCorrectRules(rule);
            return rule;
        } catch (e){
            throw e;
        } finally {
            command.setTemporary(false);
        }
    }

    async getAllRules(): Promise<string | null>{
        const important = this.history.filter(command=>command.getImportant()===true && command.getTemporary()===false);
        if (important.length === 0){
            return null;
        }
        important.forEach(command => command.setTemporary(true));
        try{
            var rules = await this.queries.getAllRulesFromCommands(important);
            rules = await this.validateAndCorrectRules(rules);
            return rules;
        } catch (e){
            throw e;
        } finally {
            important.forEach(command => command.setTemporary(false));
        }
    }

    modifyCommandDetail(command: BashCommand, modifier: string, detail: string){
        if (modifier === "Inputs"){
            command.setInput(detail);
            this.saveState();
        } else if (modifier === "Output"){ 
            command.setOutput(detail);
            this.saveState();
        } else if (modifier === "RuleName"){
            command.setRuleName(detail);
            this.saveState();
        }
        SnkmakerLogger.instance()?.commandDetails(command, true);
    }

    async moveCommands(sourceBashCommands: any, targetBashCommand: BashCommandContainer|null) {
        SnkmakerLogger.instance()?.moveCommands(this.history, false);
        var remakeNames = [];
        const children: SingleBashCommand[] = sourceBashCommands.map((c: any) => c[0].pop_children(c[1]));
        sourceBashCommands.forEach((c: any) => {
            if (c[0].is_dead()) {
                this.history.splice(this.history.indexOf(c[0]), 1);
            } else {
                remakeNames.push(c[0]);
            }
        });
        if (targetBashCommand) {
            remakeNames.push(targetBashCommand);
            children.forEach((c) => {
                targetBashCommand.addChild(c);
            });
        } else {
            children.forEach((c) => {
                this.history.push(
                    new BashCommandContainer(c, this.index++)
                );
            });
        }
        await Promise.all(remakeNames.map(async (c: any) => {
            c.set_temporary(true);
            try{
                const newName = await this.queries.guessOnlyName(c);
                c.set_rule_name(newName);
            } finally {
                c.set_temporary(false);
            }
        }));
        this.saveState();
        SnkmakerLogger.instance()?.moveCommands(this.history, true);
        return remakeNames.length !== 0;
    }

    getHistoryFormattedForChat(){
        return this.history.length===0 ? "History is Empty" : JSON.stringify(this.history);
    }

    exportAsJsonString(){
        return JSON.stringify({
            history: this.history,
            archive: this.archive,
            index: this.index
        });
    }

    loadJsonString(data: string){
        const parsed = JSON.parse(data);
        this.history = parsed.history.map((cmd: any) => {
            const singleCommands = cmd.commands.map((sc: any) => new SingleBashCommand(sc.command, sc.exitStatus, sc.inputs, sc.output, sc.important, sc.index, sc.temporary, sc.rule_name));
            const container = new BashCommandContainer(singleCommands[0], cmd.index);
            for (let i = 1; i < singleCommands.length; i++) {
                container.addChild(singleCommands[i]);
            }
            return container;
        });
        this.archive = parsed.archive.map((cmd: any) => {
            const singleCommands = cmd.commands.map((sc: any) => new SingleBashCommand(sc.command, sc.exitStatus, sc.inputs, sc.output, sc.important, sc.index, sc.temporary, sc.rule_name));
            const container = new BashCommandContainer(singleCommands[0], cmd.index);
            for (let i = 1; i < singleCommands.length; i++) {
                container.addChild(singleCommands[i]);
            }
            return container;
        });
        this.index = parsed.index;
    }

    importFromJsonString(data: string){
        this.loadJsonString(data);
        this.undoRedoStack = new UndoRedoStack();
        this.undoRedoStack.push(data);
        SnkmakerLogger.instance()?.imported(this.history);
    }

    private saveState(skipStash: boolean = false){
        const exported = this.exportAsJsonString();
        this.undoRedoStack.push(exported);
        if (!skipStash && ExtensionSettings.instance.getKeepHistoryBetweenSessions()){
            this.memento.update("stashed_state", exported);
        }
    }

    undo(){
        const data = this.undoRedoStack.undo();
        if (data){
            this.loadJsonString(data);
        }
    }

    canUndo(){
        return this.undoRedoStack.undoCount > 0;
    }

    redo(){
        const data = this.undoRedoStack.redo();
        if (data){
            this.loadJsonString(data);
            return true;
        }
        return false;
    }

    canRedo(){
        return this.undoRedoStack.redoCount > 0;
    }

    setHistoryFromChat(history: any){
        const backup = this.exportAsJsonString();
        try{
            this.history = history.map((cmd: any) => {
                const singleCommands = cmd.commands.map((sc: any) => new SingleBashCommand(sc.command, sc.exitStatus||0, sc.inputs, sc.output, sc.important||true, ++this.index, false, sc.rule_name));
                const container = new BashCommandContainer(singleCommands[0], ++this.index);
                for (let i = 1; i < singleCommands.length; i++) {
                    container.addChild(singleCommands[i]);
                }
                return container;
            });
            SnkmakerLogger.instance()?.importedFromChat(this.history);
        } catch (e){
            this.loadJsonString(backup);
            throw e;
        }
    }
}

export interface BashCommand{
    getCommand(): string;
    getCommandForModel(): string;
    getRuleName(): string;
    getInput(): string;
    getOutput(): string;
    getImportant(): boolean;
    getTemporary(): boolean;
    getNumChildren(): number;
    getChildren(index: number): BashCommand | null;
    getIndex(): number;
    setImportance(important: boolean): void;
    setTemporary(temporary: boolean): void;
    setInput(input: string): void;
    setOutput(output: string): void;
    setRuleName(rule_name: string): void;
}
export class BashCommandContainer implements BashCommand{
    commands: SingleBashCommand[];
    index: number;
    private rule_name = "";
    constructor(command: SingleBashCommand, index: number){
        this.commands = [command];
        this.index = index;
    }
    getRuleName(): string {
        if (this.commands.length === 1){
            return this.commands[0].getRuleName();
        }
        return this.rule_name;
    }
    setRuleName(rule_name: string): void {
        if (this.commands.length === 1){
            this.commands[0].setRuleName(rule_name);
        }
        this.rule_name = rule_name;
    }
    getCommand(): string {
        return this.commands.map( (c) => c.getCommand()).join(" && ");
    }
    getCommandForModel(): string {
        return this.commands.map( (c) => c.getCommand()).join("\n");
    }
    getInput(): string {
        if (this.commands.length === 1){
            return this.commands[0].getInput();
        }
        //Return all inputs but removing duplicates
        var inputs = new Set<string>();
        var outputs = new Set<string>();
        this.commands.forEach((c) => {
            inputs.add(c.getInput());
            outputs.add(c.getOutput());
        });
        //Delete all elements in outputs from inputs 
        outputs.forEach((o) => inputs.delete(o));
        return Array.from(inputs).join(" && ");
    }
    isDead(): boolean{
        return this.commands.length === 0;
    }
    addChild(command: SingleBashCommand){
        this.commands.push(command);
    }
    getOutput(): string {
        return this.commands[this.commands.length-1].getOutput();
    }
    getImportant(): boolean {
        return this.commands.some((c) => c.getImportant());
    }
    getTemporary(): boolean {
        return this.commands.some((c) => c.getTemporary());
    }
    getNumChildren(): number {
        if (this.commands.length === 1){
            return 0;
        }
        return this.commands.length;
    }
    getChildren(index: number): BashCommand | null {
        if (index < this.commands.length){
            return this.commands[index];
        }
        return null;
    }
    popChildren(index: number): SingleBashCommand | undefined {
        if (index < this.commands.length){
            return this.commands.splice(index, 1)[0];
        }
    }
    getIndex(): number {
        return this.index;
    }
    setImportance(important: boolean){
        this.commands.forEach((c) => c.important = important);
    }
    setTemporary(temporary: boolean): void {
        this.commands.forEach((c) => c.temporary = temporary);
    }
    setInput(input: string): void {
        if (this.commands.length === 1){
            this.commands[0].inputs = input;
            return;
        }
        throw new Error("Cannot set input for a container command");
    }
    setOutput(output: string): void {
        if (this.commands.length === 1){
            this.commands[0].output = output;
            return;
        }
        throw new Error("Cannot set output for a container command");
    }
}

class SingleBashCommand implements BashCommand{
    public command: string;
    public exitStatus: number;
    public output: string;
    public inputs: string;
    public important: boolean;
    public index: number;
    public temporary: boolean;
    public ruleName: string;
    constructor(command: string, exitStatus: number, input: string, output: string, important: boolean, index: number, temporary: boolean = false, ruleName?: string){ 
        this.command = command;
        if (ruleName){
            this.ruleName = ruleName;
        } else {
            this.ruleName = command;
        }
        this.exitStatus = exitStatus;
        this.inputs = input;
        this.output = output;
        this.important = important;
        this.index = index;
        this.temporary = temporary;
    }
    getCommand(): string {
        return this.command;
    }
    getCommandForModel(): string {
        return this.command;
    }
    getInput(): string {
        return this.inputs;
    }
    getOutput(): string {
        return this.output;
    }
    getImportant(): boolean {
        return this.important;
    }
    getTemporary(): boolean {
        return this.temporary;
    }
    getNumChildren(): number {
        return 0;
    }
    getChildren(index: number): BashCommand | null {
        return null;
    }
    getRuleName(): string {
        return this.ruleName;
    }
    getIndex(): number {
        return this.index;
    }
    setImportance(important: boolean){
        this.important = important;
    }
    setTemporary(temporary: boolean): void {
        this.temporary = temporary;
    }
    setInput(input: string): void {
        this.inputs = input;
    }
    setOutput(output: string): void {
        this.output = output;
    }
    setRuleName(ruleName: string): void {
        this.ruleName = ruleName;
    }
}