"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BashCommandViewModel = void 0;
class BashCommandViewModel {
    terminalHistory;
    observableCommands = new Observable();
    constructor(terminalHistory) {
        this.terminalHistory = terminalHistory;
    }
    bashCommandsSubscribe(observer) {
        return this.observableCommands.subscribe(observer);
    }
    addCommand(value, confidence, isTrusted) {
        this.terminalHistory.addCommand(value, confidence, isTrusted).then(() => {
            this.observableCommands.next(this.terminalHistory.getHistory());
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