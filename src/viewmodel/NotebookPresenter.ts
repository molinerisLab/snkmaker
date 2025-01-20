import { LLM } from "../model/ModelComms";
import { NotebookController, NotebookRulesCandidates } from "../model/NotebookController";
import { NotebookViewCallbacks } from "../view/NotebookView";

export class NotebookPresenter{
    constructor(private view: NotebookViewCallbacks, private model: NotebookController){
        this.model = model;
        this.view = view;
        //this.mockData();
        this.model.openNotebook().then((cells: string[][]) => {
            this.view.setNotebookCells(cells);
            this.model.getCandidateRules().then(
                (rules: NotebookRulesCandidates[]) => {
                    this.view.setCandidateRules(rules);
                }
            ).catch((error: string) => {
                this.view.onError(error);
            });
        }).catch((error: string) => {
            this.view.onError(error);
        });
    }

    private mockData(){
        this.view.setNotebookCells([["print('Hello World')", "print('mocked1)"], ["print('Hello World 2')","print('mocked2)"], ["print('Hello World 3')","print('mocked3)"]]);
        const candidateRules: NotebookRulesCandidates[] = [{
            cell_index: 0,
            rule_name: "rule1",
            output_names: ["output1"],
            strong_dependencies: [1],
            weak_dependencies: [],
            other_rules_outputs: ["output2"]
        },
        {
            cell_index: 2,
            rule_name: "rule_2",
            output_names: ["output2"],
            strong_dependencies: [],
            weak_dependencies: [0],
            other_rules_outputs: ["output1"]
        }];
        this.view.setCandidateRules(candidateRules);
    }
}