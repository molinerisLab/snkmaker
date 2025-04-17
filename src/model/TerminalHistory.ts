import { TerminalShellExecutionCommandLineConfidence } from "vscode";
import { LLM } from "./ModelComms";
import { Queries } from "./Queries";
import { SnkmakerLogger } from "../utils/SnkmakerLogger";
import * as vscode from 'vscode';
import { TestRules } from "../utils/TestRules";
import { ExtensionSettings } from "../utils/ExtensionSettings";
import { UndoRedoStack } from './UndoRedoStack';
import { SnakefileContext } from "../utils/OpenendSnakefileContent";
const tmp = require("tmp");
const fs = require('fs');

export class ExecutionEnvironment{
    content: string;
    name: string;
    filename: string|null;
    stored: boolean = false;
    constructor(content: string, name: string, stored: boolean = false){
        this.stored = stored;
        this.content = content;
        this.name = name;
        this.filename = this.name + ".yaml";
    }
}

export class TerminalHistory {
    history: BashCommandContainer[];
    archive: BashCommandContainer[];
    queries: Queries;
    index: number;
    testRules: TestRules = new TestRules();
    undoRedoStack: UndoRedoStack;
    tmp_path: string | null = null;
    terminalEnvMap: Map<string, ExecutionEnvironment[]> = new Map<string, ExecutionEnvironment[]>();
    namedEnvMap: Map<string, ExecutionEnvironment> = new Map<string, ExecutionEnvironment>();
    updatingEnv: boolean = false;
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

    async completeExportEnv(terminal: vscode.Terminal){
        const path = this.tmp_path;
        this.tmp_path = null;
        try {
            const pid = await terminal.processId;
            if (pid){
                const terminalId = terminal.name + pid;
                const content = fs.readFileSync(path, 'utf8');
                const match = content.match(/^\s*name:\s*(\S+)/m);
                const name = match ? match[1] : "unnamed_"+this.terminalEnvMap.entries.length;
                if (this.updatingEnv){
                    const env = this.namedEnvMap.get(name);
                    if (env){
                        env.content = content;
                        env.stored = false;
                    }
                }
                const executionEnvironment = this.namedEnvMap.get(name) || new ExecutionEnvironment(content, name)
                const currentList = this.terminalEnvMap.get(terminalId)||[];
                currentList.push(executionEnvironment);
                this.terminalEnvMap.set(terminalId, currentList);
                this.namedEnvMap.set(name, executionEnvironment);
                fs.unlinkSync(path);
            }
        } catch (error) {}
    }

    startExportEnv(terminal: vscode.Terminal, update: boolean = false){
        if (!ExtensionSettings.instance.getAddCondaDirective()){
            return;
        }
        this.updatingEnv = update
        const tmp_file = tmp.fileSync();
        this.tmp_path = tmp_file.name;
        terminal.sendText("conda env export --from-history >" + tmp_file.name + " 2> /dev/null", true);
    }

    async addCommand(value: string, confidence: TerminalShellExecutionCommandLineConfidence, isTrusted: boolean, terminal: vscode.Terminal|null) {
        let terminalId: string|null = null;
        let terminalEnvIndex: number = -1;
        const indexExisting = this.isCommandInHistory(value);
        if (indexExisting !== -1) {
            const command = this.history[indexExisting];
            this.history.splice(indexExisting, 1);
            this.history.push(command);
            SnkmakerLogger.instance()?.addCommandExisting(command, value);
            return;
        }

        if (terminal){
            const pid = await terminal.processId;
            if (pid){
                terminalId = terminal.name + pid;
            }
            if (terminalId){
                if (!this.terminalEnvMap.has(terminalId)){
                    this.startExportEnv(terminal);
                    terminalEnvIndex = 0;
                } else {
                    terminalEnvIndex  = this.terminalEnvMap.get(terminalId)?.length || 0;
                    terminalEnvIndex--;
                }
            }
        }

        const singleTempCommand = new SingleBashCommand(value, 0, "", "", false, this.index, true, undefined, terminalId, terminalEnvIndex);
        const tempCommand = new BashCommandContainer(singleTempCommand, this.index+1);
        this.index+=2;
        this.history.push(tempCommand);
        SnkmakerLogger.instance()?.addCommand(tempCommand);
        
        //Get positive and negative examples
        let positiveExamples = this.history.filter(command => command.getImportant() === true && command.getTemporary()===false && command.is_manually_changed()).map(command => command.getCommand());
        positiveExamples = positiveExamples.concat(this.history.filter(command => command.getImportant() === true && command.getTemporary()===false && !command.is_manually_changed()).map(command => command.getCommand()));
        let negativeExamples = this.history.filter(command => command.getImportant() === false && command.getTemporary()===false && command.is_manually_changed()).map(command => command.getCommand());
        negativeExamples = negativeExamples.concat(this.history.filter(command => command.getImportant() === false && command.getTemporary()===false && !command.is_manually_changed()).map(command => command.getCommand()));
        //Don't send more than 15 examples each
        positiveExamples = positiveExamples.slice(0, 15);
        negativeExamples = negativeExamples.slice(0, 15);
        try{
            const commandInfo = await this.queries.inferCommandInfo(value, positiveExamples, negativeExamples);
            const important = commandInfo['is_rule'];
            const guesses = [
                commandInfo['input'],
                commandInfo['output'],
                commandInfo['rule_name']
            ]
            singleTempCommand.setInput(guesses[0]);
            singleTempCommand.setOutput(guesses[1]);
            singleTempCommand.setRuleName(guesses[2]);
            singleTempCommand.setImportance(important);
            tempCommand.setTemporary(false);
            this.saveState();
            SnkmakerLogger.instance()?.commandDetails(tempCommand);
        } catch(e) {
            this.history.splice(this.history.indexOf(tempCommand), 1);
            throw e;
        };
    }

    //Returns index of the command in the history, -1 if not found
    //if it's subcommand returns input of parent
    //TODO: can be optimized w.t some hashmap
    public isCommandInHistory(command: string) {
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
        command.setImportance(importance, true);
        this.saveState();
        SnkmakerLogger.instance()?.setCommandImportance(command, importance);
    }

    private async validateAndCorrectRules(rules: SnakefileContext): Promise<SnakefileContext>{
        //Only if it is in Snakemake format and the user has not disabled the setting
        if (! (ExtensionSettings.instance.getRulesOutputFormat()==="Snakemake" && ExtensionSettings.instance.getValidateSnakemakeRules())){
            return rules;
        }
        if (!rules["rule"] || rules["rule"].length < 5){
            return rules;
        }
        //Check that the snakemake bin is working as expected - otherwise it gets in a loop of failures
        const valid = await this.testRules.testSnakemakePath();
        if (!valid){
            return rules;
        }

        const n_tries = ExtensionSettings.instance.getIterativeValidationAndFix();
        const n_tries_activate_step_back = ExtensionSettings.instance.getIterativeValidationAndFixActivateStepBack();
        for (let i = 0; i < n_tries; i++){
            const valid: { success: boolean; message?: string;} = await this.testRules.validateRules(rules);
            if (valid.success){
                return rules;
            }
            console.log("Error, " + i + " - " + valid.message + "s.b.: "+ (i>=n_tries_activate_step_back));
            SnkmakerLogger.instance()?.log(`Generated rule not valid: try ${i} - s.b.: ${n_tries_activate_step_back}`);
            const response = await this.queries.autoCorrectRulesFromError(rules, valid.message||"",i>=n_tries_activate_step_back);
            if (response.can_correct){
                rules = response.rules;
            } else {
                break;
            }
        }
        console.log("Finish")
        return rules;
    }

    async getRule(command: BashCommand): Promise<any>{
        if (command.getTemporary()===true){
            throw new Error("Command is being processed - please wait before exporting the rule.");
        }
        command.setTemporary(true);
        try {
            const envs = (this.terminalEnvMap.get(command.get_terminal_id()||"")||[]);
            let env = null;
            if (command.get_terminal_env_index() < envs.length && command.get_terminal_env_index()!== -1){
                env = envs[command.get_terminal_env_index()];
            }
            
            let rule = await this.queries.getRuleFromCommand(command, env?.filename||null);
            await this.validateAndCorrectRules(rule);
            
            if (env){
                rule.envs_to_export.push(env);
            }

            return rule;
        } catch (e){
            throw e;
        } finally {
            command.setTemporary(false);
        }
    }

    async processRulesFromChat(rules: string){
        const rule = await this.queries.processRulesFromChat(rules);
        await this.validateAndCorrectRules(rule);
        return rule;
    }

    async getAllRules(): Promise<any | null>{
        const important = this.history.filter(command=>command.getImportant()===true && command.getTemporary()===false);
        if (important.length === 0){
            return null;
        }
        important.forEach(command => command.setTemporary(true));
        try{
            const envs = important.map(
                (command) => {
                    if (ExtensionSettings.instance.getAddCondaDirective()){
                        const envs = this.terminalEnvMap.get(command.get_terminal_id()||"")||[];
                        const index = command.get_terminal_env_index();
                        if (index === -1 || index>=envs.length){
                            return null;
                        }
                        return envs[index];
                    }
                    return null;
                }
            )
            var rules = await this.queries.getAllRulesFromCommands(important, envs);
            await this.validateAndCorrectRules(rules);
            rules.envs_to_export = envs.filter(env => env !== null);
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
        const children: SingleBashCommand[] = sourceBashCommands.map((c: any) => c[0].popChildren(c[1]));
        sourceBashCommands.forEach((c: any) => {
            if (c[0].isDead()) {
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
            c.setTemporary(true);
            try{
                const newName = await this.queries.guessOnlyName(c);
                c.setRuleName(newName);
            } finally {
                c.setTemporary(false);
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
            index: this.index,
            namedEnvMap: Object.fromEntries(
                Array.from(this.namedEnvMap.entries()).map(([key, value]) => [
                    key,
                    {
                        content: value.content,
                        name: value.name,
                        filename: value.filename,
                        stored: value.stored,
                    },
                ])),
            terminalEnvMap: Object.fromEntries(
                Array.from(this.terminalEnvMap.entries()).map(([key, value]) => [
                    key,
                    value.map((env: ExecutionEnvironment) => env.name),
                ])
            ),
        });
    }

    loadJsonString(data: string, resetEnvExport: boolean = false){
        const parsed = JSON.parse(data);
        this.history = parsed.history.map((cmd: any) => {
            const singleCommands = cmd.commands.map((sc: any) => new SingleBashCommand(sc.command, sc.exitStatus, sc.inputs, sc.output, sc.important, sc.index, sc.temporary, sc.rule_name, sc.terminalId||null, sc.terminalEnvIndex??-1));
            const container = new BashCommandContainer(singleCommands[0], cmd.index);
            for (let i = 1; i < singleCommands.length; i++) {
                container.addChild(singleCommands[i]);
            }
            return container;
        });
        this.archive = parsed.archive.map((cmd: any) => {
            const singleCommands = cmd.commands.map((sc: any) => new SingleBashCommand(sc.command, sc.exitStatus, sc.inputs, sc.output, sc.important, sc.index, sc.temporary, sc.rule_name, sc.terminalId||null, sc.terminalEnvIndex??-1));
            const container = new BashCommandContainer(singleCommands[0], cmd.index);
            for (let i = 1; i < singleCommands.length; i++) {
                container.addChild(singleCommands[i]);
            }
            return container;
        });
        this.index = parsed.index;
        this.terminalEnvMap = new Map<string, ExecutionEnvironment[]>();
        if (parsed.namedEnvMap){
            this.namedEnvMap = new Map<string, ExecutionEnvironment>(
                Object.entries(parsed.namedEnvMap).map(([key, value]: [string, any]) => [
                    key,
                    new ExecutionEnvironment(
                        value.content, value.name, resetEnvExport ? false : value.stored
                    ),
                ])
            );
        } else {
            this.namedEnvMap = new Map<string, ExecutionEnvironment>();
        }
        if (parsed.terminalEnvMap){
            Object.entries(parsed.terminalEnvMap).forEach(([key, value]: [string, any]) => {
                const terminalId = key;
                const values = value.map((v:any) => this.namedEnvMap.get(v)||null).filter((v:any) => v !== null);
                if (values.length>0){
                    this.terminalEnvMap.set(terminalId, values);
                }
            });
        }
    }

    importFromJsonString(data: string, resetEnvExport: boolean = false){
        this.loadJsonString(data, resetEnvExport);
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
            this.saveState();
            SnkmakerLogger.instance()?.importedFromChat(this.history);
        } catch (e){
            this.loadJsonString(backup);
            throw e;
        }
    }

    writeDocumentation(documentationContext: string){
        return this.queries.writeDocumentationFromContext(documentationContext);
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
    setImportance(important: boolean, manually_changed: boolean): void;
    setTemporary(temporary: boolean): void;
    setInput(input: string): void;
    setOutput(output: string): void;
    setRuleName(rule_name: string): void;
    is_manually_changed(): boolean
    get_terminal_id(): string | null;
    get_terminal_env_index(): number;
}
export class BashCommandContainer implements BashCommand{
    commands: SingleBashCommand[];
    index: number;
    private rule_name = "";
    private manually_changed: boolean = false;
    constructor(command: SingleBashCommand, index: number){
        this.commands = [command];
        this.index = index;
    }
    get_terminal_id(): string | null {
        return this.commands[0]?.get_terminal_id() || null;
    }
    get_terminal_env_index(): number {
        if (this.commands.length === -1){
            return -1;
        }
        return this.commands[0]?.get_terminal_env_index();
    }
    is_manually_changed(): boolean {
        return this.manually_changed;
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
    setImportance(important: boolean, manually_changed: boolean = false): void {
        this.commands.forEach((c) => c.important = important);
        this.manually_changed ||= manually_changed;
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
    public rule_name: string;
    private manually_changed: boolean = false;
    constructor(command: string, exitStatus: number, input: string, output: string, important: boolean, 
        index: number, temporary: boolean = false, ruleName?: string, private terminalId: string|null = null,
        private terminalEnvIndex: number = -1){ 
        this.command = command;
        if (ruleName){
            this.rule_name = ruleName;
        } else {
            this.rule_name = command;
        }
        this.exitStatus = exitStatus;
        this.inputs = input;
        this.output = output;
        this.important = important;
        this.index = index;
        this.temporary = temporary;
    }
    get_terminal_id(): string | null {
        return this.terminalId;
    }
    get_terminal_env_index(): number {
        return this.terminalEnvIndex;
    }
    is_manually_changed(): boolean {
        return this.manually_changed;
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
        return this.rule_name;
    }
    getIndex(): number {
        return this.index;
    }
    setImportance(important: boolean, manually_changed: boolean = false): void {
        this.important = important;
        this.manually_changed ||= manually_changed;
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
        this.rule_name = ruleName;
    }
}