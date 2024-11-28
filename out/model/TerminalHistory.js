"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BashCommand = exports.TerminalHistory = void 0;
const ModelComms_1 = require("./ModelComms");
const Queries_1 = require("./Queries");
class TerminalHistory {
    history;
    queries;
    constructor() {
        this.history = [];
        this.queries = new Queries_1.Queries(new ModelComms_1.NVIDIA_ModelComms());
    }
    async addCommand(value, confidence, isTrusted) {
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
exports.TerminalHistory = TerminalHistory;
class BashCommand {
    command;
    exitStatus;
    output;
    inputs;
    important;
    constructor(command, exitStatus, input, output, important) {
        this.command = command;
        this.exitStatus = exitStatus;
        this.inputs = [input];
        this.output = output;
        this.important = important;
    }
}
exports.BashCommand = BashCommand;
//# sourceMappingURL=TerminalHistory.js.map