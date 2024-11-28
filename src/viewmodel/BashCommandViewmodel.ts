import { BashCommand, TerminalHistory } from "../model/TerminalHistory";
import { WriteToFiles } from "../model/WriteToFiles";


export class BashCommandViewModel{
    terminalHistory: TerminalHistory;
    observableCommands = new Observable<BashCommand[]>();
    observableArchive = new Observable<BashCommand[]>();
    writeToFiles: WriteToFiles;
    
    constructor(terminalHistory: TerminalHistory){
        this.terminalHistory = terminalHistory;
        this.writeToFiles = new WriteToFiles();
    }

    bashCommandsSubscribe(observer: Observer<BashCommand[]>){
        return this.observableCommands.subscribe(observer);
    }
    bashCommandsArchiveSubscribe(observer: Observer<BashCommand[]>){
      return this.observableArchive.subscribe(observer);
    }

    addCommand(value: string, confidence: number, isTrusted: boolean){
        this.terminalHistory.addCommand(value, confidence, isTrusted).then(() => {
            this.observableCommands.next(this.terminalHistory.getHistory());
        });
    }

    archiveCommands(commands: BashCommand[]){
        if (commands.length === 0){
            this.terminalHistory.archiveAllCommands();
        }
        commands.forEach(command => {
            this.terminalHistory.archiveCommand(command);
        });
        this.observableCommands.next(this.terminalHistory.getHistory());
        this.observableArchive.next(this.terminalHistory.getArchive());
    }
    restoreCommands(commands: BashCommand[]){
      commands.forEach(command => {
          this.terminalHistory.restoreCommand(command);
      });
      this.observableCommands.next(this.terminalHistory.getHistory());
      this.observableArchive.next(this.terminalHistory.getArchive());
  }

    printRule(command: BashCommand){
      this.terminalHistory.getRule(command).then((rule) => {
        if (rule){
            console.log(rule);
            this.writeToFiles.writeToCurrentFile(rule);
            this.archiveCommands([command]);
        }
      });
    }
    printAllRules(){
      this.terminalHistory.getAllRules().then((rules) => {
        console.log(rules);
        this.writeToFiles.writeToCurrentFile(rules);
        this.archiveCommands([]);
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
