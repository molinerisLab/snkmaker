"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BashCommand = exports.TerminalHistory = void 0;
const ModelComms_1 = require("./ModelComms");
const Queries_1 = require("./Queries");
class TerminalHistory {
    history;
    archive;
    queries;
    index;
    constructor() {
        this.history = [];
        this.archive = [];
        this.queries = new Queries_1.Queries(new ModelComms_1.NVIDIA_ModelComms());
        this.index = 0;
    }
    async addCommand(value, confidence, isTrusted) {
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
    archiveCommand(command) {
        const index = this.history.indexOf(command);
        if (index > -1) {
            this.history.splice(index, 1);
            this.archive.push(command);
        }
    }
    deleteCommand(command) {
        const index = this.history.indexOf(command);
        if (index > -1) {
            this.history.splice(index, 1);
        }
    }
    deleteAllCommands() {
        this.history = [];
    }
    restoreCommand(command) {
        const index = this.archive.indexOf(command);
        if (index > -1) {
            this.archive.splice(index, 1);
            this.history.push(command);
        }
    }
    archiveAllCommands() {
        this.archive = this.archive.concat(this.history);
        this.history = [];
    }
    setCommandImportance(command, importance) {
        command.important = importance;
    }
    async getRule(command) {
        return this.queries.get_snakemake_rule(command.command, command.inputs, command.output);
    }
    async getAllRules() {
        const commands = this.history.filter(command => command.important).map(command => command.command).join("\n\n");
        return this.queries.get_all_rules("\n" + commands + "\n");
    }
}
exports.TerminalHistory = TerminalHistory;
class BashCommand {
    command;
    exitStatus;
    output;
    inputs;
    important;
    index;
    constructor(command, exitStatus, input, output, important, index) {
        this.command = command;
        this.exitStatus = exitStatus;
        this.inputs = [input];
        this.output = output;
        this.important = important;
        this.index = index;
    }
}
exports.BashCommand = BashCommand;
//# sourceMappingURL=TerminalHistory.js.map