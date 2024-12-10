import { TerminalShellExecutionCommandLineConfidence } from "vscode";
import { LLM } from "./ModelComms";
import { Queries } from "./Queries";
import { assert } from "console";

export class TerminalHistory {
    history: BashCommandContainer[];
    archive: BashCommandContainer[];
    llm: LLM;
    queries: Queries;
    index: number;
    constructor(llm: LLM) {
        this.history = [];
        this.archive = [];
        this.llm = llm;
        this.queries = new Queries(this.llm);
        this.index = 0;
    }
    async addCommand(value: string, confidence: TerminalShellExecutionCommandLineConfidence, isTrusted: boolean) {
        const index_existing = this.isCommandInHistory(value);
        if (index_existing !== -1) {
            const command = this.history[index_existing];
            this.history.splice(index_existing, 1);
            this.history.push(command);
            return;
        }
        const singleTempCommand = new SingleBashCommand(value, 0, "", "", false, this.index, true);
        const tempCommand = new BashCommandContainer(singleTempCommand, this.index+1);
        this.index+=2;
        this.history.push(tempCommand);
        const important = this.queries.guess_if_important(value);
        const files = this.queries.guess_input_output(value);
        //Wait for both promises to resolve
        await Promise.all([important, files]).then((values) => {
            const important = values[0];
            const files = values[1];
            singleTempCommand.set_input(files[0]);
            singleTempCommand.set_output(files[1]);
            singleTempCommand.set_importance(important);
            tempCommand.set_temporary(false);
        });
    }
    getHistory() {
        return this.history;
    }
    getArchive() {
        return this.archive;
    }
    //TODO: optimize using a hashmap
    //Returns index of the command in the history, -1 if not found
    //if it's subcommand returns input of parent
    private isCommandInHistory(command: string) {
        for (var i = 0; i < this.history.length; i++) {
            const c = this.history[i];
            if (c.get_num_children() === 0 && c.get_command() === command) {
                return i;
            }
            for (var j = 0; j < c.get_num_children(); j++) {
                if (c.get_children(j)?.get_command() === command) {
                    return i;
                }
            }
        }
        return -1;
    }

    archiveCommand(command: BashCommandContainer) {
        const index = this.history.indexOf(command);
        if (index > -1 && command.get_temporary()===false) {
            this.history.splice(index, 1);
            this.archive.push(command);
        }
    }
    deleteCommand(command: BashCommandContainer) {
        const index = this.history.indexOf(command);
        if (index > -1) {
            this.history.splice(index, 1);
        }
    }
    deleteAllCommands() {
        this.history = [];
    }
    restoreCommand(command: BashCommandContainer) {
        const index = this.archive.indexOf(command);
        const index_existing = this.isCommandInHistory(command.get_command());
        if (index > -1) {
            this.archive.splice(index, 1);
            if (index_existing === -1) {
                this.history.push(command);
            } else {
                //Move the command to the end of the history
                this.history.splice(index_existing, 1);
                this.history.push(command);
            }
        }
    }
    archiveAllCommands() {
        this.archive = this.archive.concat(this.history);
        this.history = [];
    }
    setCommandImportance(command: BashCommand, importance: boolean) {
        command.set_importance(importance);
    }

    async getRule(command: BashCommand): Promise<string>{
        if (command.get_temporary()===true){
            return "";
        }
        command.set_temporary(true);
        //TODO
        const r = await this.queries.get_snakemake_rule(command);
        command.set_temporary(false);
        return r;
    }

    async getAllRules(): Promise<string | null>{
        const important = this.history.filter(command=>command.get_important()===true && command.get_temporary()===false);
        if (important.length === 0){
            return null;
        }
        important.forEach(command => command.set_temporary(true));
        const r = await this.queries.get_all_rules(important);
        important.forEach(command => command.set_temporary(false));
        return r;
    }
    modifyCommandDetail(command: BashCommand, modifier: string, detail: string){
        if (modifier === "Inputs"){
            command.set_input(detail);
        } else {
            command.set_output(detail);
        }
    }

    moveCommands(sourceBashCommands: any, targetBashCommand: BashCommandContainer|null){
        const children: SingleBashCommand[] = sourceBashCommands.map((c: any) => c[0].pop_children(c[1]));
        sourceBashCommands.forEach((c: any) => {
            if (c[0].is_dead()){
                this.history.splice(this.history.indexOf(c[0]), 1);
            }
        });
        if (targetBashCommand){
            children.forEach((c) => {
                targetBashCommand.add_child(c);
            });
        } else {
            children.forEach((c) => {
                this.history.push(
                    new BashCommandContainer(c, this.index++)
                );
            });
        }
    }

    export(){
        return JSON.stringify({
            history: this.history,
            archive: this.archive,
            index: this.index
        });
    }
    import(data: string){
        const parsed = JSON.parse(data);
        this.history = parsed.history.map((cmd: any) => {
            const singleCommands = cmd.commands.map((sc: any) => new SingleBashCommand(sc.command, sc.exitStatus, sc.inputs, sc.output, sc.important, sc.index, sc.temporary));
            const container = new BashCommandContainer(singleCommands[0], cmd.index);
            for (let i = 1; i < singleCommands.length; i++) {
                container.add_child(singleCommands[i]);
            }
            return container;
        });
        this.archive = parsed.archive.map((cmd: any) => {
            const singleCommands = cmd.commands.map((sc: any) => new SingleBashCommand(sc.command, sc.exitStatus, sc.inputs, sc.output, sc.important, sc.index, sc.temporary));
            const container = new BashCommandContainer(singleCommands[0], cmd.index);
            for (let i = 1; i < singleCommands.length; i++) {
                container.add_child(singleCommands[i]);
            }
            return container;
        });
        this.index = parsed.index;
    }
}

export interface BashCommand{
    get_command(): string;
    get_input(): string;
    get_output(): string;
    get_important(): boolean;
    get_temporary(): boolean;
    get_num_children(): number;
    get_children(index: number): BashCommand | null;
    get_index(): number;
    set_importance(important: boolean): void;
    set_temporary(temporary: boolean): void;
    set_input(input: string): void;
    set_output(output: string): void;
}
export class BashCommandContainer implements BashCommand{
    commands: SingleBashCommand[];
    index: number;
    constructor(command: SingleBashCommand, index: number){
        this.commands = [command];
        this.index = index;
    }
    get_command(): string {
        return this.commands.map( (c) => c.get_command()).join(" && ");
    }
    get_input(): string {
        if (this.commands.length === 1){
            return this.commands[0].get_input();
        }
        //Return all inputs but removing duplicates
        var inputs = new Set<string>();
        var outputs = new Set<string>();
        this.commands.forEach((c) => {
            inputs.add(c.get_input());
            outputs.add(c.get_output());
        });
        //Delete all elements in outputs from inputs 
        outputs.forEach((o) => inputs.delete(o));
        return Array.from(inputs).join(" && ");
    }
    is_dead(): boolean{
        return this.commands.length === 0;
    }
    add_child(command: SingleBashCommand){
        this.commands.push(command);
    }
    get_output(): string {
        return this.commands[this.commands.length-1].get_output();
    }
    get_important(): boolean {
        return this.commands.some((c) => c.get_important());
    }
    get_temporary(): boolean {
        return this.commands.some((c) => c.get_temporary());
    }
    get_num_children(): number {
        if (this.commands.length === 1){
            return 0;
        }
        return this.commands.length;
    }
    get_children(index: number): BashCommand | null {
        if (index < this.commands.length){
            return this.commands[index];
        }
        return null;
    }
    pop_children(index: number): SingleBashCommand | undefined {
        if (index < this.commands.length){
            return this.commands.splice(index, 1)[0];
        }
    }
    get_index(): number {
        return this.index;
    }
    set_importance(important: boolean){
        this.commands.forEach((c) => c.important = important);
    }
    set_temporary(temporary: boolean): void {
        this.commands.forEach((c) => c.temporary = temporary);
    }
    set_input(input: string): void {
        if (this.commands.length === 1){
            this.commands[0].inputs = input;
            return;
        }
        throw new Error("Cannot set input for a container command");
    }
    set_output(output: string): void {
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
    constructor(command: string, exitStatus: number, input: string, output: string, important: boolean, index: number, temporary: boolean = false, subCommands: BashCommand[] = []){ 
        this.command = command;
        this.exitStatus = exitStatus;
        this.inputs = input;
        this.output = output;
        this.important = important;
        this.index = index;
        this.temporary = temporary;
    }
    get_command(): string {
        return this.command;
    }
    get_input(): string {
        return this.inputs;
    }
    get_output(): string {
        return this.output;
    }
    get_important(): boolean {
        return this.important;
    }
    get_temporary(): boolean {
        return this.temporary;
    }
    get_num_children(): number {
        return 0;
    }
    get_children(index: number): BashCommand | null {
        return null;
    }
    get_index(): number {
        return this.index;
    }
    set_importance(important: boolean){
        this.important = important;
    }
    set_temporary(temporary: boolean): void {
        this.temporary = temporary;
    }
    set_input(input: string): void {
        this.inputs = input;
    }
    set_output(output: string): void {
        this.output = output;
    }
}