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
exports.BashCommandViewModel = void 0;
const WriteToFiles_1 = require("../model/WriteToFiles");
const vscode = __importStar(require("vscode"));
class BashCommandViewModel {
    terminalHistory;
    observableCommands = new Observable();
    observableArchive = new Observable();
    writeToFiles;
    constructor(terminalHistory) {
        this.terminalHistory = terminalHistory;
        this.writeToFiles = new WriteToFiles_1.WriteToFiles();
    }
    bashCommandsSubscribe(observer) {
        return this.observableCommands.subscribe(observer);
    }
    bashCommandsArchiveSubscribe(observer) {
        return this.observableArchive.subscribe(observer);
    }
    addCommand(value, confidence, isTrusted) {
        this.terminalHistory.addCommand(value, confidence, isTrusted).then(() => {
            this.observableCommands.next(this.terminalHistory.getHistory());
        });
    }
    addCommandGoneWrong(value, confidence, isTrusted, returnCode) {
        //TODO: if we want to do something with commands that returned != 0
    }
    archiveCommands(commands) {
        if (commands.length === 0) {
            this.terminalHistory.archiveAllCommands();
        }
        commands.forEach(command => {
            this.terminalHistory.archiveCommand(command);
        });
        this.observableCommands.next(this.terminalHistory.getHistory());
        this.observableArchive.next(this.terminalHistory.getArchive());
    }
    restoreCommands(commands) {
        commands.forEach(command => {
            this.terminalHistory.restoreCommand(command);
        });
        this.observableCommands.next(this.terminalHistory.getHistory());
        this.observableArchive.next(this.terminalHistory.getArchive());
    }
    deleteCommand(command) {
        this.terminalHistory.deleteCommand(command);
        this.observableCommands.next(this.terminalHistory.getHistory());
    }
    deleteAllCommmands() {
        this.terminalHistory.deleteAllCommands();
        this.observableCommands.next(this.terminalHistory.getHistory());
    }
    setCommandImportance(command, importance) {
        this.terminalHistory.setCommandImportance(command, importance);
        this.observableCommands.next(this.terminalHistory.getHistory());
    }
    modifyCommandDetail(command, modifier) {
        if (!modifier) {
            return;
        }
        const value = modifier === "Inputs" ? command.inputs : command.output;
        vscode.window.showInputBox({ prompt: 'Enter new detail for command', value: value }).then((detail) => {
            if (detail) {
                console.log(detail);
                this.terminalHistory.modifyCommandDetail(command, modifier, detail);
                this.observableCommands.next(this.terminalHistory.getHistory());
            }
        });
    }
    printRule(command) {
        this.terminalHistory.getRule(command).then((rule) => {
            if (rule) {
                console.log(rule);
                this.writeToFiles.writeToCurrentFile(rule).then((success) => {
                    if (success) {
                        this.archiveCommands([command]);
                    }
                });
            }
        });
    }
    printAllRules() {
        this.terminalHistory.getAllRules().then((rules) => {
            console.log(rules);
            if (!rules) {
                vscode.window.showInformationMessage('No rules to print');
                return;
            }
            this.writeToFiles.writeToCurrentFile(rules).then((success) => {
                if (success) {
                    this.archiveCommands([]);
                }
            });
        });
    }
}
exports.BashCommandViewModel = BashCommandViewModel;
class Observable {
    observers = [];
    subscribe(observer) {
        this.observers.push(observer);
        // Return an unsubscribe function
        return () => {
            this.observers = this.observers.filter((obs) => obs !== observer);
        };
    }
    next(value) {
        this.observers.forEach((observer) => observer(value));
    }
}
//# sourceMappingURL=BashCommandViewmodel.js.map