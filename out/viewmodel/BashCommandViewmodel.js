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
const ModelComms_1 = require("../model/ModelComms");
const TerminalHistory_1 = require("../model/TerminalHistory");
const WriteToFiles_1 = require("../model/WriteToFiles");
const vscode = __importStar(require("vscode"));
class BashCommandViewModel {
    memento;
    llm;
    terminalHistory;
    observableCommands = new Observable();
    observableArchive = new Observable();
    observableModel = new Observable();
    writeToFiles;
    isListening = false;
    isChangingModel = false;
    constructor(memento) {
        this.memento = memento;
        this.llm = new ModelComms_1.LLM(memento);
        this.terminalHistory = new TerminalHistory_1.TerminalHistory(this.llm);
        this.writeToFiles = new WriteToFiles_1.WriteToFiles();
    }
    startListening() {
        this.isListening = true;
    }
    stopListening() {
        this.isListening = false;
    }
    bashCommandsSubscribe(observer) {
        return this.observableCommands.subscribe(observer);
    }
    bashCommandsArchiveSubscribe(observer) {
        return this.observableArchive.subscribe(observer);
    }
    getModels() {
        return this.llm;
    }
    modelsSubscribe(observer) {
        return this.observableModel.subscribe(observer);
    }
    addCommand(value, confidence, isTrusted) {
        if (!this.isListening) {
            return;
        }
        this.terminalHistory.addCommand(value, confidence, isTrusted).then(() => {
            this.observableCommands.next(this.terminalHistory.getHistory());
        });
        this.observableCommands.next(this.terminalHistory.getHistory());
    }
    addCommandGoneWrong(value, confidence, isTrusted, returnCode) {
        if (!this.isListening) {
            return;
        }
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
        const value = modifier === "Inputs" ? command.get_input() : command.get_output();
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
        this.observableCommands.next(this.terminalHistory.getHistory());
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
        this.observableCommands.next(this.terminalHistory.getHistory());
    }
    async useModel(modelIndex) {
        if (this.isChangingModel) {
            return;
        }
        this.isChangingModel = true;
        this.llm.useModel(modelIndex).then((hi) => {
            this.isChangingModel = false;
            this.observableModel.next(this.llm);
            vscode.window.showInformationMessage('Model activated. The model says hi: "' + hi + '"');
        }).catch((e) => {
            this.isChangingModel = false;
            vscode.window.showInformationMessage('Error activating model: ' + e.message);
        });
    }
    isCopilotActive() {
        return this.llm.isCopilotActive();
    }
    async activateCopilot() {
        var models = [];
        for (var i = 0; i < 20; i++) {
            models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (models.length > 0) {
                break;
            }
        }
        if (models.length === 0) {
            vscode.window.showInformationMessage('Copilot not available');
            return;
        }
        const index = this.llm.activateCopilot(models);
        if (index !== -1) {
            await this.useModel(index);
        }
        this.observableModel.next(this.llm);
    }
    moveCommands(sourceBashCommands, targetBashCommand) {
        this.terminalHistory.moveCommands(sourceBashCommands, targetBashCommand);
        this.observableCommands.next(this.terminalHistory.getHistory());
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