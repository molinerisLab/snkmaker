import { mock } from "node:test";
import { LLM } from "../model/ModelComms";
import { NotebookController, CellDependencyGraph, DependencyError, IllegalTypeChangeError, RulesNode, Cell } from "../model/NotebookController";
import { NotebookViewCallbacks } from "../view/NotebookView";
import * as vscode from 'vscode';
import { resolve } from 'path';

/**The notebook functionality uses MVP pattern instead of MVVM
 * Compared to the bash history this component is based on a limited and very ordered sequence of commands 
 * between the view and the model. MVP will be more readable, compact and easier to maintain than MVVM.
 */

export class NotebookPresenter{

    public static openFromNotebook(view: NotebookViewCallbacks, model: NotebookController, memento: any, notebookPath: vscode.Uri){
        const presenter = new NotebookPresenter(view, model, memento);
        presenter.buildNotebook(notebookPath);
        return presenter;
    }

    public static openFromExportedFile(view: NotebookViewCallbacks, model: NotebookController, memento: any, exportedPath: vscode.TextDocument){
        const presenter = new NotebookPresenter(view, model, memento);
        presenter.loadNotebook(exportedPath);
        return presenter;
    }

    constructor(private view: NotebookViewCallbacks, private model: NotebookController, private memento: any){
        this.model = model;
        this.view = view;
    }

    public save(currentScreen: number){
        if (!this.model.save(currentScreen)){
            this.saveAs(currentScreen);
            return;
        }
    }
    public saveAs(currentScreen: number){
        let defaultUri = vscode.Uri.file(`export_process.snkmk`);
        if (this.model.filename){
            defaultUri = vscode.Uri.file(`${this.model.filename}`);
        } else if (this.model.path){
            const filename = resolve(this.model.path.fsPath).split('.').shift();
            defaultUri = vscode.Uri.file(`${filename}.snkmk`);
        }
        vscode.window.showSaveDialog({
            filters: { 'SnakemakerNotebook': ['snkmk'] },
            defaultUri: defaultUri
        }).then((path: vscode.Uri|undefined) => {
            if (path) {
                this.model.saveAs(path.fsPath, currentScreen);
            }
        });
    }

    private async loadNotebook(exportedPath: vscode.TextDocument){
        this.model.openFrom(exportedPath);
        if (this.model.cells.currentState===0){
            this.view.setNotebookCells(this.model.cells);
            this.view.setRulesNodes(this.model.cells);
        } else {
            this.view.setOutput(this.model.cells);
        }
    }

    private async buildNotebook(notebookPath: vscode.Uri){
        try{
            this.view.setLoading("Building dependency graph...");
            const cellD: CellDependencyGraph = await this.model.openNotebook(notebookPath);
            this.view.setNotebookCells(cellD);
            this.view.setLoading("Building rules graph...");
            const nodes: CellDependencyGraph = await this.model.makeRulesGraph();
            this.view.setRulesNodes(nodes);
            this.model.saveState();
        } catch(error: any){
            this.view.onError(error);
        }
    }
    
    public back(){
        this.view.setLoading("Returning to notebook...");
        this.view.setNotebookCells(this.model.cells);
        this.view.setRulesNodes(this.model.cells);
        this.model.resetUndoRedoStack();
    }

    public produceSnakefile(){
        this.view.setLoading("Building Snakemake rules...");
        this.model.buildRulesAdditionalCode().then(
            (res: CellDependencyGraph) => {
                this.model.resetUndoRedoStack();
                this.model.saveState();
                this.view.stopLoading();
                this.view.setOutput(res);
            }
        ).catch(
            (error: any) => {
                this.view.onSoftError(error);
            }
        );
    }

    public async propagateChangesPrefix(index: number, code: string){
        this.view.setLoading("Propagating changes...");
        this.model.updateRulePrefix(index, code).then(
            (res: CellDependencyGraph) => {
                this.model.saveState();
                this.view.stopLoading();
                this.view.setOutput(res);
            }
        ).catch(
            (error: any) => {
                this.view.onSoftError("Model could not propagate changes made in the code");
            }
        );
    }
    public async propagateChangesSnakemakeRule(index: number, code: string){
        this.view.setLoading("Propagating changes...");
        this.model.updateSnakemakeRule(index, code).then(
            (res: CellDependencyGraph) => {
                this.model.saveState();
                this.view.stopLoading();
                this.view.setOutput(res);
            }
        ).catch(
            (error: any) => {
                this.view.onSoftError("Model could not propagate changes made in the code");
            }
        );
    }
    public async propagateChangesPostfix(index: number, code: string){
        this.view.setLoading("Propagating changes...");
        this.model.updateRulePostfix(index, code).then(
            (res: CellDependencyGraph) => {
                this.model.saveState();
                this.view.stopLoading();
                this.view.setOutput(res);
            }
        ).catch(
            (error: any) => {
                this.view.onSoftError("Model could not propagate changes made in the code");
            }
        );
    }

    public getCells(): CellDependencyGraph{
        const cells = this.model.cells;
        return cells;
    }

    public changeRuleState(cell_index: number, state: string){
        this.view.setLoading("Updating rules graph...");
        try{
            const nodes = this.model.changeRuleState(cell_index, state);
            this.model.saveState();
            this.view.setRulesNodes(nodes);
        } catch(error: any){
            if (error instanceof IllegalTypeChangeError) {
                this.view.onSoftError(`Cannot change state from ${error.oldState} to ${error.newState}`);
            } else {
                this.view.onError(String(error));
            }
        }
    }

    public addDependency(cell_index: number, variable: string){
        if (this.model.cells.cells[cell_index].isFunctions){
            this.addFunctionDependency(cell_index, variable);
            this.model.saveState();
            return;
        }

        try{
            this.view.setLoading("Updating cell depenency graph...");
            const res = this.model.addCellDependency(cell_index, variable);
            if (res) {this.view.setNotebookCells(res[0]);}
            this.view.setLoading("Updating rules graph...");
            if (res) {
                res[1].then((nodes: CellDependencyGraph) => this.view.setRulesNodes(nodes));
                this.model.saveState();
            }
        } catch (error) {
            if (error instanceof DependencyError) {
                this.view.onSoftError(`Cannot add this dependency, as no cell writes the variable ${error.variable}`);
            } else {
                this.view.onError(String(error));
            }
        }
    }

    public addWrite(cell_index: number, variable: string){
        try{
            this.view.setLoading("Updating cell depenency graph...");
            const res = this.model.addCellWrite(cell_index, variable);
            if (res) {this.view.setNotebookCells(res[0]);}
            this.view.setLoading("Updating rules graph...");
            if (res) {
                res[1].then((nodes: CellDependencyGraph) => this.view.setRulesNodes(nodes));
                this.model.saveState();
            }
        } catch (error) {
            this.view.onError(String(error));
        }
    }

    public removeDependency(cell_index: number, variable: string){
        try{
            this.view.setLoading("Updating cell depenency graph...");
            const res = this.model.removeCellDependency(cell_index, variable);
            if (res) {this.view.setNotebookCells(res[0]);}
            this.view.setLoading("Updating rules graph...");
            if (res) {
                res[1].then((nodes: CellDependencyGraph) => this.view.setRulesNodes(nodes));
                this.model.saveState();
            }
        } catch (error) {
            if (error instanceof DependencyError) {
                this.view.onSoftError(`Cannot delete cell, as it defines variable ${error.variable}, readed by cell ${error.reader_cell}`);
            } else {
                this.view.onError(String(error));
            }
        }
    }
    public removeWrite(cell_index: number, variable: string){
        try{
            this.view.setLoading("Updating cell depenency graph...");
            const res = this.model.removeCellWrite(cell_index, variable);
            if (res) {this.view.setNotebookCells(res[0]);}
            this.view.setLoading("Updating rules graph...");
            if (res) {
                res[1].then((nodes: CellDependencyGraph) => this.view.setRulesNodes(nodes));
                this.model.saveState();
            }
        } catch (error) {
            if (error instanceof DependencyError) {
                this.view.onSoftError(`Cannot remove the write "${error.variable}", it is a dependency of cell ${error.reader_cell}. Remove the dependency first.`);
            } else {
                this.view.onError(String(error));
            }
        }
    }

    public deleteCell(cell_index: number){
        try{
            this.view.setLoading("Updating cell depenency graph...");
            const res = this.model.deleteCell(cell_index);
            if (res) {this.view.setNotebookCells(res[0]);}
            this.view.setLoading("Updating rules graph...");
            if (res) {
                res[1].then((nodes: CellDependencyGraph) => this.view.setRulesNodes(nodes));
                this.model.saveState();
            }
        } catch (error) {
            if (error instanceof DependencyError) {
                this.view.onSoftError(`Cannot delete cell, as it defines variable ${error.variable}, readed by cell ${error.reader_cell}`);
            } else {
                this.view.onError(String(error));
            }
        }
    }
    public mergeCells(cell_index_top: number, cell_index_bottom: number){
        this.view.setLoading("Updating cell depenency graph...");
        const result = this.model.mergeCells(cell_index_top, cell_index_bottom);
        if (result){
            const cells = result[0]; const rules = result[1];
            this.view.setNotebookCells(cells);
            this.view.setLoading("Updating rules graph...");
            rules.then((nodes: CellDependencyGraph) => {
                this.view.setRulesNodes(nodes);
                this.model.saveState();
            }).catch((error: any) => {
                this.view.onError(error);
            });
        }
    }

    public splitCell(index: number, code1: string, code2: string){
        this.view.setLoading("Reconstructing dependency graph...");
        this.model.splitCell(index, code1, code2).then(
            (cellD:CellDependencyGraph) => {
                if (cellD) {this.view.setNotebookCells(cellD);}
                this.view.setRulesNodes(cellD);
                this.model.saveState();
            }
        ).catch(
            (error: any) => {
                if (error instanceof DependencyError) {
                    this.view.onSoftError(`Cannot delete cell, as it defines variable ${error.variable}, readed by cell ${error.reader_cell}`);
                } else {
                    this.view.onError(String(error));
                }
            }
        );
    }

    public exportSnakefile(){
        vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select export directory'
        }).then((folderUri:any) => {
            if (folderUri && folderUri[0]) {
                const exportPath = folderUri[0].fsPath;
                this.view.setLoading("Exporting Snakefile...");
                this.model.exportSnakefile(exportPath).then(
                    (snakefileUri: vscode.Uri) => {
                        this.view.stopLoading();
                        vscode.window.showInformationMessage(`Snakefile exported to ${exportPath}`);
                        vscode.workspace.openTextDocument(snakefileUri).then((document: vscode.TextDocument) => {
                            vscode.window.showTextDocument(document);
                        });
                    }
                ).catch(
                    (error: any) => {
                        this.view.onSoftError("Could not export Snakefile: " + error);
                    }
                );
            }
        });
    }

    public removeFunctionDependency(cell_index: number, variable_name: string){
        this.model.removeFunctionDependency(cell_index, variable_name);
        this.model.saveState();
        this.view.setNotebookCells(this.model.cells);
        this.view.setRulesNodes(this.model.cells);
    }

    public addFunctionDependency(cell_index: number, variable_name: string){
        this.model.addDependencyToFunction(cell_index, variable_name);
        this.model.saveState();
        this.view.setNotebookCells(this.model.cells);
        this.view.setRulesNodes(this.model.cells);
    }

    public setDependencyAsWildcard(index: number, dependency: string){
        this.model.setDependencyAsWildcard(index, dependency);
        this.model.saveState();
        this.view.setNotebookCells(this.model.cells);
        this.view.setRulesNodes(this.model.cells);
    }

    public setWildcardAsDependency(index: number, dependency: string){
        this.model.setWildcardAsDependency(index, dependency);
        this.model.saveState();
        this.view.setNotebookCells(this.model.cells);
        this.view.setRulesNodes(this.model.cells);
    }

    public addWildcard(index: number, dependency: string){
        this.model.setDependencyAsWildcard(index, dependency);
        this.model.saveState();
        this.view.setNotebookCells(this.model.cells);
        this.view.setRulesNodes(this.model.cells);
    }

    public dispose(){
        this.view.dispose();
    }

    public get_step(){
        return this.view.get_state();
    }

    public apply_from_chat(data:any): string{
        if (!data["changes"] || data["changes"].length===0){
            return "";
        }
        this.view.setLoading("Applying changes from chat agent...");
        const changes = data["changes"];
        const response = this.model.apply_from_chat(changes);
        setTimeout(() => {
            this.model.saveState();
            this.view.setNotebookCells(this.model.cells);
            this.view.setRulesNodes(this.model.cells);
        }, 1000);
        return response;
    }

    public apply_from_chat_second_step(data:any): string{
        if (!data["changes"] || data["changes"].length===0){
            return "";
        }
        this.view.setLoading("Applying changes from chat agent...");
        const changes = data["changes"];
        let newConfig = undefined;
        if (data["config"]){
            newConfig = data["config"];
        }
        const response = this.model.apply_from_chat_second_step(changes, newConfig);
        setTimeout(() => {
            this.model.saveState();
            this.view.setOutput(this.model.cells);
        }, 1000);
        return response;
    }

    public undo(current_step: number){
        this.model.undo();
        if (current_step===0){
            this.view.setNotebookCells(this.model.cells);
            this.view.setRulesNodes(this.model.cells);
        } else {
            this.view.setOutput(this.model.cells);
        }
    }
    public redo(current_step: number){
        this.model.redo();
        if (current_step===0){
            this.view.setNotebookCells(this.model.cells);
            this.view.setRulesNodes(this.model.cells);
        } else {
            this.view.setOutput(this.model.cells);
        }
    }

    public configChanged(config: string){

        this.view.setLoading("Propagating changes");
        this.model.configUpdatedByUser(config).then(() => {
            this.model.saveState();
            this.view.setOutput(this.model.cells);
        }).catch((error: any) => {
            this.view.onError(error);
        });
    }
}
