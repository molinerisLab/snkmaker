import { BashCommand, TerminalHistory } from "../model/TerminalHistory";


export class BashCommandViewModel{
    terminalHistory: TerminalHistory;
    observableCommands = new Observable<BashCommand[]>();
    
    constructor(terminalHistory: TerminalHistory){
        this.terminalHistory = terminalHistory;
    }

    bashCommandsSubscribe(observer: Observer<BashCommand[]>){
        return this.observableCommands.subscribe(observer);
    }

    addCommand(value: string, confidence: number, isTrusted: boolean){
        this.terminalHistory.addCommand(value, confidence, isTrusted).then(() => {
            this.observableCommands.next(this.terminalHistory.getHistory());
        });
    }

}

export type Observer<T> = (value: T) => void;
class Observable<T> {
  private observers: Observer<T>[] = [];
  subscribe(observer: Observer<T>): () => void {
    this.observers.push(observer);
    // Return an unsubscribe function
    return () => {
      this.observers = this.observers.filter((obs) => obs !== observer);
    };
  }
  next(value: T): void {
    this.observers.forEach((observer) => observer(value));
  }
}
