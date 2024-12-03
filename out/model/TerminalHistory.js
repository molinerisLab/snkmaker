"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BashCommand = exports.TerminalHistory = void 0;
const Queries_1 = require("./Queries");
class TerminalHistory {
    history;
    archive;
    llm;
    queries;
    index;
    constructor(llm) {
        this.history = [];
        this.archive = [];
        this.llm = llm;
        this.queries = new Queries_1.Queries(this.llm);
        this.index = 0;
    }
    async addCommand(value, confidence, isTrusted) {
        const index_existing = this.isCommandInHistory(value);
        if (index_existing !== -1) {
            const command = this.history[index_existing];
            this.history.splice(index_existing, 1);
            this.history.push(command);
            return;
        }
        const tempCommand = new BashCommand(value, 0, "", "", false, this.index, true);
        this.history.push(tempCommand);
        const important = this.queries.guess_if_important(value);
        const files = this.queries.guess_input_output(value);
        //Wait for both promises to resolve
        await Promise.all([important, files]).then((values) => {
            const important = values[0];
            const files = values[1];
            //remove the temporary command
            this.history.splice(this.history.indexOf(tempCommand), 1);
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
    isCommandInHistory(command) {
        for (var i = 0; i < this.history.length; i++) {
            if (this.history[i].command === command) {
                return i;
            }
        }
        return -1;
    }
    archiveCommand(command) {
        const index = this.history.indexOf(command);
        if (index > -1 && command.temporary === false) {
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
        const index_existing = this.isCommandInHistory(command.command);
        if (index > -1) {
            this.archive.splice(index, 1);
            if (index_existing === -1) {
                this.history.push(command);
            }
            else {
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
    setCommandImportance(command, importance) {
        command.important = importance;
    }
    async getRule(command) {
        if (command.temporary === true) {
            return "";
        }
        command.temporary = true;
        const r = await this.queries.get_snakemake_rule(command.command, command.inputs, command.output);
        command.temporary = false;
        return r;
    }
    async getAllRules() {
        const important = this.history.filter(command => command.important && command.temporary === false);
        important.forEach(command => command.temporary = true);
        if (important.length === 0) {
            return null;
        }
        const r = await this.queries.get_all_rules(important);
        important.forEach(command => command.temporary = false);
        return r;
    }
    modifyCommandDetail(command, modifier, detail) {
        if (modifier === "Inputs") {
            command.inputs = detail;
        }
        else {
            command.output = detail;
        }
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
    temporary;
    constructor(command, exitStatus, input, output, important, index, temporary = false) {
        this.command = command;
        this.exitStatus = exitStatus;
        this.inputs = input;
        this.output = output;
        this.important = important;
        this.index = index;
        this.temporary = temporary;
    }
}
exports.BashCommand = BashCommand;
//# sourceMappingURL=TerminalHistory.js.map