"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandInference = void 0;
class CommandInference {
    terminal;
    constructor(terminal) {
        this.terminal = terminal;
    }
    async infer(command) {
        //Check if command executable: [[ -x src ]], read return code,  - if 1, executable
    }
}
exports.CommandInference = CommandInference;
//# sourceMappingURL=CommandInference.js.map