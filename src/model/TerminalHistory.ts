import { TerminalShellExecutionCommandLineConfidence } from "vscode";
import { LLM } from "./ModelComms";
import { Queries } from "./Queries";

export class TerminalHistory {
    history: BashCommand[];
    archive: BashCommand[];
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
        const important = this.queries.guess_if_important(value);
        const files = this.queries.guess_input_output(value);
        //Wait for both promises to resolve
        await Promise.all([important, files]).then((values) => {
            const important = values[0];
            const files = values[1];
            this.history.push(new BashCommand(value, 0, files[0], files[1], important, this.index));
        });
        this.index++;
    }
    getHistory() {
        return this.history;
    }
    getArchive() {
        return this.archive;
    }
    //TODO: optimize using a hashmap
    private isCommandInHistory(command: string) {
        for (var i = 0; i < this.history.length; i++) {
            if (this.history[i].command === command) {
                return i;
            }
        }
        return -1;
    }

    archiveCommand(command: BashCommand) {
        const index = this.history.indexOf(command);
        if (index > -1) {
            this.history.splice(index, 1);
            this.archive.push(command);
        }
    }
    deleteCommand(command: BashCommand) {
        const index = this.history.indexOf(command);
        if (index > -1) {
            this.history.splice(index, 1);
        }
    }
    deleteAllCommands() {
        this.history = [];
    }
    restoreCommand(command: BashCommand) {
        const index = this.archive.indexOf(command);
        const index_existing = this.isCommandInHistory(command.command);
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
        command.important = importance;
    }

    async getRule(command: BashCommand): Promise<string>{
        return this.queries.get_snakemake_rule(command.command, command.inputs, command.output);
    }

    async getAllRules(): Promise<string | null>{
        const important = this.history.filter(command=>command.important);
        if (important.length === 0){
            return null;
        }
        return this.queries.get_all_rules(important);
    }
    modifyCommandDetail(command: BashCommand, modifier: string, detail: string){
        if (modifier === "Inputs"){
            command.inputs = detail;
        } else {
            command.output = detail;
        }
    }
}

export class BashCommand{
    public command: string;
    public exitStatus: number;
    public output: string;
    public inputs: string;
    public important: boolean;
    public index: number;
    constructor(command: string, exitStatus: number, input: string, output: string, important: boolean, index: number){ 
        this.command = command;
        this.exitStatus = exitStatus;
        this.inputs = input;
        this.output = output;
        this.important = important;
        this.index = index;
    }   
}