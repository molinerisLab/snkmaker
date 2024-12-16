"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HiddenTerminal = void 0;
const vscode = __importStar(require("vscode"));
class HiddenTerminal {
    terminal;
    constructor() {
        this.terminal = vscode.window.createTerminal({
            name: "Hidden Terminal",
            shellPath: "/usr//bin/bash",
            shellArgs: [],
            hideFromUser: true,
            env: {},
            iconPath: undefined,
            strictEnv: false
        });
    }
    async run_command(command) {
        const shellExecution = this.terminal.shellIntegration?.executeCommand("echo SNKMKR_BR && " + command);
        const stream = shellExecution?.read();
        if (!stream) {
            return;
        }
        var output = "";
        for await (const data of stream) {
            output += data;
        }
        //Remove the SNKMKR_BR prefix
        const split = output.split("SNKMKR_BR");
        const cleaned_up = split[split.length - 1].substring(1);
        console.log("Running command: " + command + "  Raw Output: " + output + "Cleaned up: " + cleaned_up);
        return cleaned_up;
    }
}
exports.HiddenTerminal = HiddenTerminal;
//# sourceMappingURL=HiddenTerminal.js.map