import { LLM } from "../model/ModelComms";
import { NotebookController } from "../model/NotebookController";
import { BashCommand, BashCommandContainer, TerminalHistory } from "../model/TerminalHistory";
import { ExtensionSettings } from "../utils/ExtensionSettings";
import { WriteToFiles } from "../utils/WriteToFiles";
import * as vscode from 'vscode';
import { NotebookViewCallbacks } from "../view/NotebookView";
import { NotebookPresenter } from "./NotebookPresenter";
import { OpenedSnakefileContent } from "../utils/OpenendSnakefileContent";

export class BashCommandViewModel{
    llm: LLM;
    terminalHistory: TerminalHistory;
    observableCommands = new Observable<BashCommandContainer[]>();
    observableArchive = new Observable<BashCommandContainer[]>();
    observableModel = new Observable<LLM>();
    writeToFiles: WriteToFiles;
    isListening = false;
    isChangingModel = false;
    openedNotebookPresenter: NotebookPresenter|null = null;
    
    constructor(private memento: vscode.Memento){
        this.llm = new LLM(memento);
        const modelId = memento.get<string|undefined>('current_model', undefined);
        if (modelId){
            this.useModel(modelId, true, true);
        }
        this.terminalHistory = new TerminalHistory(this.llm, memento);
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

    addCommand(value: string, confidence: number, isTrusted: boolean, alwaysAdd=false){
      if (!this.isListening && !alwaysAdd){
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

    private ruleOutputRoutine(output: Promise<any|null>, commands: BashCommandContainer[]){
      output.then((rules) => {
        if (rules !== null){
          this.writeToFiles.writeToCurrentFile(rules).then((success) => {
            if (success){
                this.archiveCommands(commands);
            }
            this.updateCanUndoCanRedo();
            if (rules['rule'].length < 2){
              vscode.window.showInformationMessage('No rule has been printed');
            }
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
      this.writeToFiles.tryToFocusOnSnakefile();
      this.ruleOutputRoutine(this.terminalHistory.getRule(command), [command]);
    }

    printAllRules(){
      this.writeToFiles.tryToFocusOnSnakefile();
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
        const exported = this.writeToFiles.readFromFile(path);
        this.terminalHistory.importFromJsonString(exported);
        this.observableCommands.next(this.terminalHistory.getHistory());
        this.observableArchive.next(this.terminalHistory.getArchive());
        vscode.window.showInformationMessage('Workspace loaded');
        this.updateCanUndoCanRedo();
        this.memento.update("stashed_state", exported);
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
        //Check if history is an array
        if (!Array.isArray(history)){
          //Check if history has a field called history
          if (history.hasOwnProperty('history')){
            history = history.history;
          } else {
            throw new Error('History is not an array');
          }
        }
        this.terminalHistory.setHistoryFromChat(history);
        this.observableCommands.next(this.terminalHistory.getHistory());
      } catch (e){
        vscode.window.showInformationMessage('Could not set history from LLM response');
      }
    }

    addModel(url: string, name: string, max_tokens: number, token: string){
      this.llm.addModel(url, token, name, max_tokens);
      this.observableModel.next(this.llm);
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
      }
    }

    filterCommands(commands: string[]){
      return commands.filter(command => this.terminalHistory.isCommandInHistory(command)===-1);
    }
    
    openNotebook(notebookPath: vscode.Uri, view: NotebookViewCallbacks){
      if (this.openedNotebookPresenter){
        this.closeNotebook();
      }
      this.openedNotebookPresenter = NotebookPresenter.openFromNotebook(view, new NotebookController(this.llm), this.memento, notebookPath);
      return this.openedNotebookPresenter;
    }

    openExportedNotebook(exportedDocument: vscode.TextDocument, view: NotebookViewCallbacks){
      if (this.openedNotebookPresenter){
        this.closeNotebook();
      }
      this.openedNotebookPresenter = NotebookPresenter.openFromExportedFile(view, new NotebookController(this.llm), this.memento, exportedDocument);
      return this.openedNotebookPresenter;
    }

    closeNotebook(){
      if (this.openedNotebookPresenter){
        this.openedNotebookPresenter.dispose();
      }
      this.openedNotebookPresenter = null;
    }

    getOpenedNotebook(): NotebookPresenter|null{
      if (vscode.window.tabGroups.activeTabGroup.activeTab?.label != "Export notebook"){
        return null;
      }
      return this.openedNotebookPresenter;
    }

    async generateDocumentation(){
      const history = this.terminalHistory.getHistory().map((command) => command.getCommand()).join('\n\n');
      let contextForHistory = "These are bash commands that will be converted into snakemake rules:\n" + history;
      vscode.window.showQuickPick(['Yes', 'No, use only bash history'], {
          placeHolder: 'Use existing Snakefile for the documentation?'
      }).then((selection) => {
          if (selection === 'Yes') {
            const path = OpenedSnakefileContent.getCurrentEditorSnakefilePath();
            vscode.window.showInputBox({ prompt: 'Enter the path to the Snakefile', value: path || "" }).then(async (snakefilePath) => {
              if (snakefilePath) {
                const content = await OpenedSnakefileContent.getFilePathContent(snakefilePath);
                contextForHistory = "Snakefile:\n\n" + content + "\n\n" + contextForHistory;
                this.terminalHistory.writeDocumentation(contextForHistory).then((docs) => {
                  this.writeToFiles.writeToNewFile(docs).catch((e:any) => {
                    vscode.window.showInformationMessage(e.toString());
                  });
                }).catch((e:any) => {
                  vscode.window.showInformationMessage(e.toString());
                });
              } else {
                vscode.window.showInformationMessage('No Snakefile path provided');
              }
            });
          } else {
            this.terminalHistory.writeDocumentation(contextForHistory).then((docs) => {
              this.writeToFiles.writeToNewFile(docs).catch((e:any) => {
                vscode.window.showInformationMessage(e.toString());
              });
            });
          }
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
