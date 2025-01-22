import { LLM } from "../model/ModelComms";
import { NotebookController, CellDependencyGraph, Cell, DependencyError } from "../model/NotebookController";
import { NotebookViewCallbacks } from "../view/NotebookView";

/**The notebook functionality uses MVP pattern instead of MVVM
 * Compared to the bash history this component is based on a limited and very ordered sequence of commands 
 * between the view and the model. MVP will be more readable, compact and easier to maintain than MVVM.
 */

export class NotebookPresenter{
    constructor(private view: NotebookViewCallbacks, private model: NotebookController){
        this.model = model;
        this.view = view;
        this.buildNotebook();
    }

    private async buildNotebook(){
        try{
            this.view.setLoading("Building dependency graph...");
            const cellD: CellDependencyGraph = await this.model.openNotebook();
            this.view.setNotebookCells(cellD);
        } catch(error: any){
            this.view.onError(error);
        }
    }

    public deleteCell(cell_index: number){
        try{
            const cellD = this.model.deleteCell(cell_index);
            if (cellD) {this.view.setNotebookCells(cellD);}
        } catch (error) {
            if (error instanceof DependencyError) {
                this.view.onSoftError(`Cannot delete cell, as it defines variable ${error.variable}, readed by cell ${error.reader_cell}`);
            } else {
                this.view.onError(String(error));
            }
        }
    }
    public mergeCells(cell_index_top: number, cell_index_bottom: number){
        const result = this.model.mergeCells(cell_index_top, cell_index_bottom);
        if (result){
            this.view.setNotebookCells(result);
        }
    }

    public splitCell(index: number, code1: string, code2: string){
        this.view.setLoading("Reconstructing dependency graph...");
        this.model.splitCell(index, code1, code2).then(
            (cellD: CellDependencyGraph|undefined) => {
                if (cellD) {this.view.setNotebookCells(cellD);}
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