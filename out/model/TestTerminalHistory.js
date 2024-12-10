"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestTerminalHistory = void 0;
const Queries_1 = require("./Queries");
const TerminalHistory_1 = require("./TerminalHistory");
class TestTerminalHistory extends TerminalHistory_1.TerminalHistory {
    history;
    archive;
    llm;
    queries;
    index;
    constructor(llm) {
        super(llm);
        this.history = [
            new TerminalHistory_1.BashCommand("command_1", 0, "", "", true, 0, false),
            new TerminalHistory_1.BashCommand("command_2", 0, "", "", true, 1, false),
            new TerminalHistory_1.BashCommand("command_3", 0, "", "", true, 2, false),
            TerminalHistory_1.BashCommand.fromCommands([
                new TerminalHistory_1.BashCommand("command_4", 0, "", "", true, 4, false),
                new TerminalHistory_1.BashCommand("command_5", 0, "", "", true, 5, false),
            ], 3),
        ];
        this.archive = [];
        this.llm = llm;
        this.queries = new Queries_1.Queries(this.llm);
        this.index = 0;
    }
    async addCommand(value, confidence, isTrusted) {
        return;
    }
    getHistory() {
        return this.history;
    }
    getArchive() {
        return this.archive;
    }
    archiveCommand(command) {
        return;
    }
    deleteCommand(command) {
        return;
    }
    deleteAllCommands() {
        return;
    }
    restoreCommand(command) {
        return;
    }
    archiveAllCommands() {
        return;
    }
    async getRule(command) {
        return "DEBUG RULE";
    }
    async getAllRules() {
        return "DEBUG RULE";
    }
    modifyCommandDetail(command, modifier, detail) {
        return;
    }
}
exports.TestTerminalHistory = TestTerminalHistory;
//# sourceMappingURL=TestTerminalHistory.js.map