import { LLM, ModelComms } from "../model/ModelComms";
import { BashCommand, BashCommandContainer, TerminalHistory } from "../model/TerminalHistory";
import { WriteToFiles } from "../utils/WriteToFiles";
import * as vscode from 'vscode';

export class BashCommandViewModel{
    llm: LLM;
    terminalHistory: TerminalHistory;
    observableCommands = new Observable<BashCommandContainer[]>();
    observableArchive = new Observable<BashCommandContainer[]>();
    observableModel = new Observable<LLM>();
    writeToFiles: WriteToFiles;
    isListening = false;
    isChangingModel = false;
    
    constructor(private memento: vscode.Memento, stashState: boolean){
        this.llm = new LLM(memento);
        const modelId = memento.get<string|undefined>('current_model', undefined);
        if (modelId){
            this.useModel(modelId, true, true);
        }
        this.terminalHistory = new TerminalHistory(this.llm, memento, stashState);
        this.writeToFiles = new WriteToFiles();
    }

    startListening(){
      this.isListening = true;
    }

    stopListening(){
      this.isListening = false;
    }

    bashCommandsSubscribe(observer: Observer<BashCommandContainer[]>){
        return this.observableCommands.subscribe(observer);
    }
    bashCommandsArchiveSubscribe(observer: Observer<BashCommandContainer[]>){
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
          this.updateCanUndoCanRedo();
      }).catch((e) => {
        vscode.window.showInformationMessage(e.toString());
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

    archiveCommands(commands: BashCommandContainer[]){
      if (commands.length === 0){
          this.terminalHistory.archiveAllCommands();
      }
      commands.forEach(command => {
          this.terminalHistory.archiveCommand(command);
      });
      this.observableCommands.next(this.terminalHistory.getHistory());
      this.observableArchive.next(this.terminalHistory.getArchive());
      this.updateCanUndoCanRedo();
    }

    restoreCommands(commands: BashCommandContainer[]){
      commands.forEach(command => {
          this.terminalHistory.restoreCommand(command);
      });
      this.observableCommands.next(this.terminalHistory.getHistory());
      this.observableArchive.next(this.terminalHistory.getArchive());
      this.updateCanUndoCanRedo();
    }

    deleteCommand(command: BashCommandContainer){
      const isCommandInHistory = this.terminalHistory.deleteCommand(command);
      if (isCommandInHistory){
        this.observableCommands.next(this.terminalHistory.getHistory());
      } else {
        this.observableArchive.next(this.terminalHistory.getArchive());
      }
      this.updateCanUndoCanRedo();
    }

    deleteAllCommmands(){
      this.terminalHistory.deleteAllCommands();
      this.observableCommands.next(this.terminalHistory.getHistory());
      this.updateCanUndoCanRedo();
    }

    deleteAllArchivedCommands(){
      this.terminalHistory.deleteAllArchivedCommands();
      this.observableArchive.next(this.terminalHistory.getArchive());
      this.updateCanUndoCanRedo();
    }
    setCommandImportance(command: BashCommandContainer, importance: boolean){
      this.terminalHistory.setCommandImportance(command, importance);
      this.observableCommands.next(this.terminalHistory.getHistory());
      this.updateCanUndoCanRedo();
    }

    modifyCommandDetail(command: BashCommand, modifier?: string){
      if (!modifier){
        return;
      }
      var value;
      switch (modifier){
        case "RuleName":
          value = command.getRuleName();
          break;
        case "Output":
          value = command.getOutput();
          break;
        case "Inputs":
          value = command.getInput();
          break;
        default:
          return;
      }
      vscode.window.showInputBox({prompt: 'Enter new detail for command', value: value}).then((detail) => {
        if (detail){
          this.terminalHistory.modifyCommandDetail(command, modifier, detail);
          this.observableCommands.next(this.terminalHistory.getHistory());
          this.updateCanUndoCanRedo();
        }
      });
    }

    private ruleOutputRoutine(output: Promise<string|null>, commands: BashCommandContainer[]){
      output.then((rules) => {
        if (rules){
          this.writeToFiles.writeToCurrentFile(rules).then((success) => {
            if (success){
                this.archiveCommands(commands);
            }
            this.updateCanUndoCanRedo();
          });
        } else {
          vscode.window.showInformationMessage('No rules to print');
        }
      }).catch((e) => {
        vscode.window.showInformationMessage(e.toString());
        this.observableCommands.next(this.terminalHistory.getHistory());
      });
      this.observableCommands.next(this.terminalHistory.getHistory());
    }

    printRule(command: BashCommandContainer){
      this.ruleOutputRoutine(this.terminalHistory.getRule(command), [command]);
    }

    printAllRules(){
      this.ruleOutputRoutine(this.terminalHistory.getAllRules(), []);
    }

    async useModel(id: string, skipMessage: boolean = false, skipErrorMessage: boolean = false){
      if (this.isChangingModel){
          return;
      }
      this.isChangingModel = true;
      this.llm.useModel(id, skipMessage).then((hi) => {
        this.observableModel.next(this.llm);
        vscode.window.showInformationMessage('Model activated. The model says hi: "' + hi + '"');
      }).catch((e) => {
        if (!skipErrorMessage){
          vscode.window.showInformationMessage('Error activating model: ' + (<Error>e).message);
        }
      }).finally(() => {
        this.isChangingModel = false;
        this.llm.isCopilotWaiting = false;
      });
    }

    isCopilotActive(){
        return this.llm.isCopilotActive();
    }

    async activateCopilot(){
      var models: vscode.LanguageModelChat[] = [];
      //Copilot takes a while to load after vscode opening - wait a bit for it
      for (var i = 0; i < 40; i++){
        models = await vscode.lm.selectChatModels({vendor: 'copilot'});
        await new Promise(resolve => setTimeout(resolve, 500));
        if (models.length>0){
          break;
        }
      }

      //If no copilot available, notify user
      if (models.length===0){
        this.llm.isCopilotWaiting = false;
        vscode.window.showInformationMessage('Copilot not available');
        return;
      }

      this.llm.activateCopilot(models);
      if (this.llm.current_model === -1){
        const modelId = this.memento.get<string>('current_model', 'gpt-4o');
        this.useModel(modelId, true);
      }
      this.observableModel.next(this.llm);
    }

    moveCommands(sourceBashCommands: any, targetBashCommand: BashCommandContainer | null){
      this.terminalHistory.moveCommands(sourceBashCommands, targetBashCommand).then(
        (count: boolean) => {
          if (count === true){
            this.observableCommands.next(this.terminalHistory.getHistory());
          }
        }
      );
      this.observableCommands.next(this.terminalHistory.getHistory());
      this.updateCanUndoCanRedo();
    }

    saveWorkspace(path: string | undefined){
      if (!path){return;}

      if (this.writeToFiles.writeToFile(path, this.terminalHistory.exportAsJsonString())){
        vscode.window.showInformationMessage('Workspace saved');
      }
    }

    loadWorkspace(path: string){
      try{
        this.terminalHistory.importFromJsonString(this.writeToFiles.readFromFile(path));
        this.observableCommands.next(this.terminalHistory.getHistory());
        this.observableArchive.next(this.terminalHistory.getArchive());
        vscode.window.showInformationMessage('Workspace loaded');
        this.updateCanUndoCanRedo();
      } catch (e){
        vscode.window.showInformationMessage('Error loading workspace: ' + e);
      }
    }

    undo(){
      this.terminalHistory.undo();
      this.observableCommands.next(this.terminalHistory.getHistory());
      this.observableArchive.next(this.terminalHistory.getArchive());
      this.updateCanUndoCanRedo();
    }

    redo(){
      if (this.terminalHistory.redo()){
        this.observableCommands.next(this.terminalHistory.getHistory());
        this.observableArchive.next(this.terminalHistory.getArchive());
        this.updateCanUndoCanRedo();
      }
    }

    updateCanUndoCanRedo(){
      vscode.commands.executeCommand('setContext', 'myExtension.canUndo', this.terminalHistory.canUndo());
      vscode.commands.executeCommand('setContext', 'myExtension.canRedo', this.terminalHistory.canRedo());
    }

    setHistory(history: any){
      try{
        this.terminalHistory.setHistoryFromChat(history);
        this.observableCommands.next(this.terminalHistory.getHistory());
      } catch (e){
        vscode.window.showInformationMessage('Error setting history: ' + e);
      }
    }

    addModel(){
      vscode.window.showQuickPick(['Continue', 'Cancel'], {placeHolder: 'Adding a new model with OpenAI API'}).then((value) => {
          if (value !== 'Continue'){
            return;
          }
          vscode.window.showInputBox({prompt: 'Enter the API URL'}).then((url) => {
            if (!url){
              return;
            }
            vscode.window.showInputBox({prompt: 'Enter the API key',ignoreFocusOut: true}).then((token) => {
              if (!token){
                return;
              }
              vscode.window.showInputBox({prompt: 'Enter the name of the model',ignoreFocusOut: true}).then((name) => {
                if (!name){
                  return;
                }
                vscode.window.showInputBox({prompt: 'Enter the maximum number of tokens',ignoreFocusOut: true}).then((max_tokens) => {
                  if (!max_tokens){
                    return;
                  }
                  this.llm.addModel(url, token, name, parseInt(max_tokens));
                  this.observableModel.next(this.llm);
                });
              });
            });
          });
        }
      );
    }

    deleteModel(id: string){
      this.llm.deleteModel(id);
      this.observableModel.next(this.llm);
    }

    unstashHistory(){
      const stashedState = this.memento.get<string|undefined>('stashed_state', undefined);
      if (stashedState){
        this.terminalHistory.loadJsonString(stashedState);
        this.observableCommands.next(this.terminalHistory.getHistory());
        this.observableArchive.next(this.terminalHistory.getArchive());
        this.memento.update('stashed_state', undefined);
      }
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
