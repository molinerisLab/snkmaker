import { mock } from "node:test";
import { LLM } from "../model/ModelComms";
import { NotebookController, CellDependencyGraph, Cell, DependencyError, RulesNode } from "../model/NotebookController";
import { NotebookViewCallbacks } from "../view/NotebookView";
const vscode = require('vscode');

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
        //mockData(this.view); return;
        try{
            this.view.setLoading("Building dependency graph...");
            const cellD: CellDependencyGraph = await this.model.openNotebook();
            this.view.setNotebookCells(cellD);
            this.view.setLoading("Building rules graph...");
            const nodes: RulesNode[]|undefined = await this.model.getRulesGraph();
            this.view.setRulesNodes(nodes||[]);
        } catch(error: any){
            this.view.onError(error);
        }
    }

    public deleteCell(cell_index: number){
        try{
            this.view.setLoading("Updating cell depenency graph...");
            const res = this.model.deleteCell(cell_index);
            if (res) {this.view.setNotebookCells(res[0]);}
            this.view.setLoading("Updating rules graph...");
            if (res) {
                res[1].then((nodes: RulesNode[]) => this.view.setRulesNodes(nodes));
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
            rules.then((nodes: RulesNode[]) => this.view.setRulesNodes(nodes));
        }
    }

    public splitCell(index: number, code1: string, code2: string){
        this.view.setLoading("Reconstructing dependency graph...");
        this.model.splitCell(index, code1, code2).then(
            (result:[CellDependencyGraph, RulesNode[]]|undefined) => {
                if (result){
                    const cellD: CellDependencyGraph = result[0];
                    const rules: RulesNode[] = result[1];
                    if (cellD) {this.view.setNotebookCells(cellD);}
                    this.view.setRulesNodes(rules);
                } else {
                    this.view.onSoftError(`Could not complete operation`);
                    this.view.stopLoading();
                }
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

function mockData(view:any){
    let d1 = {
        cells: [
            {code: "EXPERMENT_NAME = \"V_4\"\nDATASET_PATH = f\"dataset/{EXPERMENT_NAME}\"\nEXPERIMENT_CONFIG = None", reads: [], reads_file: [], writes: ["EXPERMENT_NAME", "DATASET_PATH", "EXPERIMENT_CONFIG"], imports: [], isFunctions: false, declares: [], dependsOn: {}, calls: []},
            {code: "def MY_FUN(arg1, __experment_name__):\n    print(arg1)\n    print(__experment_name__)\n\n", reads: [], reads_file: [], writes: [], imports: [], isFunctions: true, declares: ["MY_FUN"], dependsOn: {}, calls: []},
            {code: "MY_FUN(\"ciao\", EXPERMENT_NAME)\nMY_FUN(\"ciao2\", EXPERMENT_NAME)\nEXPERIMENT_CONFIG = \"config\"", reads: ["EXPERMENT_NAME"], reads_file: [], writes: ["EXPERIMENT_CONFIG"], imports: [], isFunctions: false, declares: [], dependsOn: {EXPERMENT_NAME: 0}, calls: ["MY_FUN"]},
            {code: "MY_FUN(\"ciao\", EXPERMENT_NAME)\nMY_FUN(\"ciao2\", EXPERMENT_NAME)\nEXPERIMENT_CONFIG = \"config\"", reads: ["EXPERMENT_NAME"], reads_file: [], writes: ["EXPERIMENT_CONFIG"], imports: [], isFunctions: false, declares: [], dependsOn: {EXPERMENT_NAME: 0}, calls: ["MY_FUN"]},
            {code: "MY_FUN(\"ciao\", EXPERMENT_NAME)\nMY_FUN(\"ciao2\", EXPERMENT_NAME)\nEXPERIMENT_CONFIG = \"config\"", reads: ["EXPERMENT_NAME"], reads_file: [], writes: ["EXPERIMENT_CONFIG"], imports: [], isFunctions: false, declares: [], dependsOn: {EXPERMENT_NAME: 0}, calls: ["MY_FUN"]}
            
        ]
    };
    let d2 = [
        {isLoading: true, cell: {code: "EXPERMENT_NAME = \"V_4\"\nDATASET_PATH = f\"dataset/{EXPERMENT_NAME}\"\nEXPERIMENT_CONFIG = None", reads: [], reads_file: [], writes: ["EXPERMENT_NAME", "DATASET_PATH", "EXPERIMENT_CONFIG"], imports: [], isFunctions: false, declares: [], dependsOn: {}, calls: []}, type: "script", name: "setup_experiment", can_become: {rule: true, script: true, undecided: true}, import_dependencies: {}, rule_dependencies: {}, undecided_dependencies: {}},
        {isLoading: true, cell: {code: "def MY_FUN(arg1, __experment_name__):\n    print(arg1)\n    print(__experment_name__)\n\n", reads: [], reads_file: [], writes: [], imports: [], isFunctions: true, declares: ["MY_FUN"], dependsOn: {}, calls: []}, type: "script", name: "define_function", can_become: {rule: true, script: true, undecided: true}, import_dependencies: {}, rule_dependencies: {}, undecided_dependencies: {}},
        {isLoading: true, cell: {code: "MY_FUN(\"ciao\", EXPERMENT_NAME)\nMY_FUN(\"ciao2\", EXPERMENT_NAME)\nEXPERIMENT_CONFIG = \"config\"", reads: ["EXPERMENT_NAME"], reads_file: [], writes: ["EXPERIMENT_CONFIG"], imports: [], isFunctions: false, declares: [], dependsOn: {EXPERMENT_NAME: 0}, calls: ["MY_FUN"]}, type: "rule", name: "run_experiment", can_become: {rule: true, script: true, undecided: true}, import_dependencies: {EXPERMENT_NAME: {isLoading: true, cell: {code: "EXPERMENT_NAME = \"V_4\"\nDATASET_PATH = f\"dataset/{EXPERMENT_NAME}\"\nEXPERIMENT_CONFIG = None", reads: [], reads_file: [], writes: ["EXPERMENT_NAME", "DATASET_PATH", "EXPERIMENT_CONFIG"], imports: [], isFunctions: false, declares: [], dependsOn: {}, calls: []}, type: "script", name: "setup_experiment", can_become: {rule: true, script: true, undecided: true}, import_dependencies: {}, rule_dependencies: {}, undecided_dependencies: {}}}, rule_dependencies: {}, undecided_dependencies: {}},
        {isLoading: true, cell: {code: "MY_FUN(\"ciao\", EXPERMENT_NAME)\nMY_FUN(\"ciao2\", EXPERMENT_NAME)\nEXPERIMENT_CONFIG = \"config\"", reads: ["EXPERMENT_NAME"], reads_file: [], writes: ["EXPERIMENT_CONFIG"], imports: [], isFunctions: false, declares: [], dependsOn: {EXPERMENT_NAME: 0}, calls: ["MY_FUN"]}, type: "rule", name: "run_experiment", can_become: {rule: true, script: true, undecided: true}, import_dependencies: {EXPERMENT_NAME: {isLoading: true, cell: {code: "EXPERMENT_NAME = \"V_4\"\nDATASET_PATH = f\"dataset/{EXPERMENT_NAME}\"\nEXPERIMENT_CONFIG = None", reads: [], reads_file: [], writes: ["EXPERMENT_NAME", "DATASET_PATH", "EXPERIMENT_CONFIG"], imports: [], isFunctions: false, declares: [], dependsOn: {}, calls: []}, type: "script", name: "setup_experiment", can_become: {rule: true, script: true, undecided: true}, import_dependencies: {}, rule_dependencies: {}, undecided_dependencies: {}}}, rule_dependencies: {}, undecided_dependencies: {}},
        {isLoading: true, cell: {code: "MY_FUN(\"ciao\", EXPERMENT_NAME)\nMY_FUN(\"ciao2\", EXPERMENT_NAME)\nEXPERIMENT_CONFIG = \"config\"", reads: ["EXPERMENT_NAME"], reads_file: [], writes: ["EXPERIMENT_CONFIG"], imports: [], isFunctions: false, declares: [], dependsOn: {EXPERMENT_NAME: 0}, calls: ["MY_FUN"]}, type: "rule", name: "run_experiment", can_become: {rule: true, script: true, undecided: true}, import_dependencies: {EXPERMENT_NAME: {isLoading: true, cell: {code: "EXPERMENT_NAME = \"V_4\"\nDATASET_PATH = f\"dataset/{EXPERMENT_NAME}\"\nEXPERIMENT_CONFIG = None", reads: [], reads_file: [], writes: ["EXPERMENT_NAME", "DATASET_PATH", "EXPERIMENT_CONFIG"], imports: [], isFunctions: false, declares: [], dependsOn: {}, calls: []}, type: "script", name: "setup_experiment", can_become: {rule: true, script: true, undecided: true}, import_dependencies: {}, rule_dependencies: {}, undecided_dependencies: {}}}, rule_dependencies: {}, undecided_dependencies: {}}

    ]
    view.setLoading("Building dependency graph...");
    view.setNotebookCells(d1);
    view.setLoading("Building rules graph...");
    view.setRulesNodes(d2);
}