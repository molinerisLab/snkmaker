import { json } from 'stream/consumers';
import * as vscode from 'vscode';
import { LLM, ModelComms } from './ModelComms';

export interface NotebookRulesCandidates{
    cell_index: number;
    rule_name: string;
    output_names: string[];
    strong_dependencies: number[];
    weak_dependencies: number[];
    other_rules_outputs: string[];
}

export class NotebookController{
    cells: string[][] | undefined;
    constructor(private path: vscode.Uri, private llm: LLM){
    }

    private parseJsonFromResponse(response: string): NotebookRulesCandidates[]{
        // If response is in form <some text>{ ..  }<some text>, remove surrounding text
        let start = response.indexOf("{");
        let end = response.lastIndexOf("}");
        if (start !== -1 && end !== -1){
            response = response.substring(start, end + 1);
        }
        const formatted = JSON.parse(response);
        if (!formatted.rules || !Array.isArray(formatted.rules)) {
            throw new Error("Invalid response format: 'rules' is missing or not an array");
        }
        formatted.rules.forEach((rule: any) => {
            if (typeof rule.cell_index !== 'number' ||
            typeof rule.rule_name !== 'string' ||
            !Array.isArray(rule.output_names) ||
            !Array.isArray(rule.strong_dependencies) ||
            !Array.isArray(rule.weak_dependencies) ||
            !Array.isArray(rule.other_rules_outputs)) {
            throw new Error("Invalid response format: One or more rule properties are missing or of incorrect type");
            }
        });
        return formatted.rules;
    }

    async openNotebook(): Promise<string[][]>{
        const opened = await vscode.workspace.openTextDocument(this.path);
        const json = await JSON.parse(opened.getText());  
        const result: string[][] = json.cells.filter((cell: any) => cell.cell_type === "code").map((cell: any) => cell.source);
        this.cells = result;
        return result;
    }

    public async getCandidateRules(): Promise<any>{
        let prompt = "I have a jupyter notebook that is being processed into a snakemake pipeline. This process involves " +
        "decomposition of the notebook into smaller pieces of python code, and linking them together in a snakemake pipeline.\n" +
        "As the first step, please consider the following notebook cell:\n\n" +
        this.cells?.map((cell, index) => "Cell. " + index + "\n" + cell.join("")).join("\n\n") + "\n\n" +
        "Please provide to me a list of cells that are good candidates to be individual snakemake rules. Not every cell needs to be a rule, some might end up being scripts that are imported or merged into other cells (for example a cell that defines a function)\n"+
        "For each candidate rule I need:\n"+
        "1- A candidate rule name and output name for each of the candidate rules\n"+
        "2- A list of strong dependencies for each of the candidate rules. A strong dependency means the python code of this cell depends on the context of another cell - for example it uses variables defined there\n"+
        "3- A list of weak dependencies for each of the candidate rules. A weak dependency means the python code of the cell uses a function defined in another cell, but the function can be theorically imported\n"+
        "4- A list of other rules' outputs that this rule depends on. If another rule produces an output in a file and this rule reads it.\n"+
        "\n\nPlease write the output in JSON format following this schema:\n"+
        `{ "rules": [ {"cell_index": <number>, "rule_name": <string>, "output_names": [<strings>], "strong_dependencies": [<indexes>], "weak_dependencies": [<indexes>], "other_rules_outputs": [<strings>]}  for each rule... ] }`;
        const response = await this.llm.runQuery(prompt);
        const formatted: NotebookRulesCandidates[] = this.parseJsonFromResponse(response);
        return formatted;
    }
}