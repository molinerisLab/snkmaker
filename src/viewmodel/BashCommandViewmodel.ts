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
    isChangingModel = false;
    
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
        this.observableCommands.next(this.terminalHistory.getHistory());
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
      this.observableCommands.next(this.terminalHistory.getHistory());
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
      this.observableCommands.next(this.terminalHistory.getHistory());
    }

    async useModel(modelIndex: number){
        if (this.isChangingModel){
            return;
        }
        this.isChangingModel = true;
        this.llm.useModel(modelIndex).then((hi) => {
            this.isChangingModel = false;
            this.observableModel.next(this.llm);
			      vscode.window.showInformationMessage('Model activated. The model says hi: "' + hi + '"');
        }).catch((e) => {
          this.isChangingModel = false;
          vscode.window.showInformationMessage('Error activating model: ' + (<Error>e).message);
        });
    }

    isCopilotActive(){
        return this.llm.isCopilotActive();
    }
    async activateCopilot(){
      var models: vscode.LanguageModelChat[] = [];
      for (var i = 0; i < 20; i++){
        models = await vscode.lm.selectChatModels({vendor: 'copilot'});
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (models.length>0){
          break;
        }
      }
      if (models.length===0){
        vscode.window.showInformationMessage('Copilot not available');
        return;
      }
      this.llm.activateCopilot(models);
      await this.useModel(0);
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
