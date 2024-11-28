import { TerminalShellExecutionCommandLineConfidence } from "vscode";
import { ModelComms, NVIDIA_ModelComms } from "./ModelComms";
import { Queries } from "./Queries";

export class TerminalHistory {
    history: BashCommand[];
    queries: Queries;
    constructor() {
        this.history = [];
        this.queries = new Queries(new NVIDIA_ModelComms());
    }
    async addCommand(value: string, confidence: TerminalShellExecutionCommandLineConfidence, isTrusted: boolean) {
        const important = this.queries.guess_if_important(value);
        const files = this.queries.guess_input_output(value);
        //Wait for both promises to resolve
        await Promise.all([important, files]).then((values) => {
            const important = values[0];
            const files = values[1];
            this.history.push(new BashCommand(value, 0, files[0], files[1], important));
        });
    }
    getHistory() {
        return this.history;
    }
}

export class BashCommand{
    public command: string;
    public exitStatus: number;
    public output: string;
    public inputs: string[];
    public important: boolean;
    constructor(command: string, exitStatus: number, input: string, output: string, important: boolean) {
        this.command = command;
        this.exitStatus = exitStatus;
        this.inputs = [input];
        this.output = output;
        this.important = important;
        

    }   
}