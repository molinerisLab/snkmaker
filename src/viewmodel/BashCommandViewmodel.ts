import { LLM, ModelComms } from "../model/ModelComms";
import { BashCommand, TerminalHistory } from "../model/TerminalHistory";
import { WriteToFiles } from "../model/WriteToFiles";
import * as vscode from 'vscode';

export class BashCommandViewModel{
    llm: LLM;
    terminalHistory: TerminalHistory;
    observableCommands = new Observable<BashCommand[]>();
    observableArchive = new Observable<BashCommand[]>();
    observableModel = new Observable<LLM>();
    writeToFiles: WriteToFiles;
    isListening = false;
    
    constructor(){
        this.llm = new LLM();
        this.terminalHistory = new TerminalHistory(this.llm);
        this.writeToFiles = new WriteToFiles();
    }

    startListening(){
      this.isListening = true;
    }

    stopListening(){
      this.isListening = false;
    }

    bashCommandsSubscribe(observer: Observer<BashCommand[]>){
        return this.observableCommands.subscribe(observer);
    }
    bashCommandsArchiveSubscribe(observer: Observer<BashCommand[]>){
      return this.observableArchive.subscribe(observer);
    }
    getModels(){
        return this.llm;
    }
    modelsSubscribe(observer: Observer<LLM>){
        return this.observableModel.subscribe(observer);
    }

    addCommand(value: string, confidence: number, isTrusted: boolean){
        if (!this.isListening){
            return;
        }
        this.terminalHistory.addCommand(value, confidence, isTrusted).then(() => {
            this.observableCommands.next(this.terminalHistory.getHistory());
        });
    }
    addCommandGoneWrong(value: string, confidence: number, isTrusted: boolean, returnCode: number | undefined){
      if (!this.isListening){
        return;
      }
        //TODO: if we want to do something with commands that returned != 0
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
    deleteCommand(command: BashCommand){
        this.terminalHistory.deleteCommand(command);
        this.observableCommands.next(this.terminalHistory.getHistory());
    }
    deleteAllCommmands(){
        this.terminalHistory.deleteAllCommands();
        this.observableCommands.next(this.terminalHistory.getHistory());
    }
    setCommandImportance(command: BashCommand, importance: boolean){
        this.terminalHistory.setCommandImportance(command, importance);
        this.observableCommands.next(this.terminalHistory.getHistory());
    }
    modifyCommandDetail(command: BashCommand, modifier?: string){
      if (!modifier){
        return;
      }
      const value = modifier==="Inputs" ? command.inputs : command.output;
      vscode.window.showInputBox({prompt: 'Enter new detail for command', value: value}).then((detail) => {
        if (detail){
          console.log(detail);
          this.terminalHistory.modifyCommandDetail(command, modifier, detail);
          this.observableCommands.next(this.terminalHistory.getHistory());
        }
      });

    }

    printRule(command: BashCommand){
      this.terminalHistory.getRule(command).then((rule) => {
        if (rule){
            console.log(rule);
            this.writeToFiles.writeToCurrentFile(rule).then((success) => {
                if (success){
                    this.archiveCommands([command]);
                }
            });
        }
      });
    }
    printAllRules(){
      this.terminalHistory.getAllRules().then((rules) => {
        console.log(rules);
        if (!rules){
            vscode.window.showInformationMessage('No rules to print');
            return;
        }
        this.writeToFiles.writeToCurrentFile(rules).then((success) => {
          if (success){
            this.archiveCommands([]);
          }
        });
      });
    }

    useModel(modelIndex: number){
        this.llm.useModel(modelIndex);
        this.observableModel.next(this.llm);
    }

    isCopilotActive(){
        return this.llm.isCopilotActive();
    }
    activateCopilot(models: vscode.LanguageModelChat[]){
      this.llm.activateCopilot(models);
      this.observableModel.next(this.llm);
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
