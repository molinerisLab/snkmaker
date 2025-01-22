import { LLM } from "../model/ModelComms";
import { NotebookController, CellDependencyGraph, Cell } from "../model/NotebookController";
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
            const cellD: CellDependencyGraph = await this.model.openNotebook();
            this.view.setNotebookCells(cellD);
        } catch(error: any){
            this.view.onError(error);
        }
    }


}