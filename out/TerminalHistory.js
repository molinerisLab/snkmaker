"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalHistory = void 0;
class TerminalHistory {
    history;
    constructor() {
        this.history = [];
    }
    addCommand(value, confidence, isTrusted) {
        this.history.push(value);
        //TODO: for now we are ignoring confidence and isTrusted
    }
    getHistory() {
        return this.history;
    }
}
exports.TerminalHistory = TerminalHistory;
//# sourceMappingURL=TerminalHistory.js.map