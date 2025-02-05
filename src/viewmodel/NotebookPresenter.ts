import { mock } from "node:test";
import { LLM } from "../model/ModelComms";
import { NotebookController, CellDependencyGraph, DependencyError, IllegalTypeChangeError, RulesNode, Cell } from "../model/NotebookController";
import { NotebookViewCallbacks } from "../view/NotebookView";
const vscode = require('vscode');

/**The notebook functionality uses MVP pattern instead of MVVM
 * Compared to the bash history this component is based on a limited and very ordered sequence of commands 
 * between the view and the model. MVP will be more readable, compact and easier to maintain than MVVM.
 */

export class NotebookPresenter{
    constructor(private view: NotebookViewCallbacks, private model: NotebookController, private memento: any){
        this.model = model;
        this.view = view;
        this.buildNotebook();
    }

    private saveMockedData(key: string, value: any){
        this.memento.update(key, JSON.stringify(value));
    }
    private mockOrLoadData(key: string){
        const data = this.memento.get(key, undefined);
        if (data){
            const c = JSON.parse(data);
            if (key === 'notebook'){
                c.cells.forEach((cell:any) => {
                    cell.rule.setCanBecome= ()=>{};
                    cell.rule.canBecomeStatic={rule: true, script: true, undecided: true};});
                }
            return c;
        }
        return undefined;
    }

    private async buildNotebook(){
        /*let mocked = this.mockOrLoadData('notebook');
        if (mocked){
            this.view.setNotebookCells(mocked);
            this.view.setRulesNodes(mocked);
            return;   
        }*/
        try{
            this.view.setLoading("Building dependency graph...");
            const cellD: CellDependencyGraph = await this.model.openNotebook();
            this.view.setNotebookCells(cellD);
            this.view.setLoading("Building rules graph...");
            const nodes: CellDependencyGraph = await this.model.makeRulesGraph();
            this.view.setRulesNodes(nodes);
        } catch(error: any){
            this.view.onError(error);
        }
    }

    public produceSnakefile(){
        /*let mocked = this.mockOrLoadData('secondstep');
        if (mocked){
            this.view.stopLoading();
            this.view.setOutput(mocked);
            return;   
        }*/
        this.view.setLoading("Building Snakemake rules...");
        this.model.buildRulesAdditionalCode().then(
            (res: CellDependencyGraph) => {
                this.view.stopLoading();
                this.view.setOutput(res);
            }
        ).catch(
            (error: any) => {
                this.view.onError(error);
            }
        );
    }

    public async propagateChangesPrefix(index: number, code: string){
        this.view.setLoading("Propagating changes...");
        this.model.updateRulePrefix(index, code).then(
            (res: CellDependencyGraph) => {
                this.view.stopLoading();
                this.view.setOutput(res);
            }
        ).catch(
            (error: any) => {
                this.view.onError(error);
            }
        );
    }
    public async propagateChangesPostfix(index: number, code: string){
        this.view.setLoading("Propagating changes...");
        this.model.updateRulePostfix(index, code).then(
            (res: CellDependencyGraph) => {
                this.view.stopLoading();
                this.view.setOutput(res);
            }
        ).catch(
            (error: any) => {
                this.view.onError(error);
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
        try{
            this.view.setLoading("Updating cell depenency graph...");
            const res = this.model.addCellDependency(cell_index, variable);
            if (res) {this.view.setNotebookCells(res[0]);}
            this.view.setLoading("Updating rules graph...");
            if (res) {
                res[1].then((nodes: CellDependencyGraph) => this.view.setRulesNodes(nodes));
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
            rules.then((nodes: CellDependencyGraph) => this.view.setRulesNodes(nodes));
        }
    }

    public splitCell(index: number, code1: string, code2: string){
        this.view.setLoading("Reconstructing dependency graph...");
        this.model.splitCell(index, code1, code2).then(
            (cellD:CellDependencyGraph) => {
                if (cellD) {this.view.setNotebookCells(cellD);}
                this.view.setRulesNodes(cellD);
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
}
