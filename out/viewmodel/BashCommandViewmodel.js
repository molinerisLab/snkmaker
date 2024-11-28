"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BashCommandViewModel = void 0;
const WriteToFiles_1 = require("../model/WriteToFiles");
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
    printRule(command) {
        this.terminalHistory.getRule(command).then((rule) => {
            if (rule) {
                console.log(rule);
                this.writeToFiles.writeToCurrentFile(rule);
                this.archiveCommands([command]);
            }
        });
    }
    printAllRules() {
        this.terminalHistory.getAllRules().then((rules) => {
            console.log(rules);
            this.writeToFiles.writeToCurrentFile(rules);
            this.archiveCommands([]);
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