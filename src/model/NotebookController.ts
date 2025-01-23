import { json } from 'stream/consumers';
import * as vscode from 'vscode';
import { LLM, ModelComms } from './ModelComms';


export interface Cell{
    code: string; reads: string[]; reads_file: string[], writes: string[], imports: string[];
    isFunctions: boolean; declares: string[]; calls: string[];
    dependsOn: { [key: string]: number };
}
export interface CellDependencyGraph{
    cells: Cell[];
}

export class DependencyError{
    constructor(public message: string, public reader_cell: number, public variable: string){}
}

class CellDependencyGraphImpl implements CellDependencyGraph{
    cells: Cell[];
    constructor(cells: string[][]){
        this.cells = cells.map((cell) => {
            return {code: cell.join(""), reads: [], reads_file: [], writes: [], imports: [], isFunctions:false, declares:[], dependsOn:{}, calls:[]};
        });
    }
    public setDependency(index: number, reads: string[], reads_file: string[], writes: string[], imports: string[]){
        this.cells[index].reads = reads;
        this.cells[index].reads_file = reads_file;
        this.cells[index].writes = writes;
        this.cells[index].imports = imports;
    }
    private findGlobalFunctions(code: string): Array<{ name: string; content: string }> {
        const lines = code.split("\n");
        const functions: Array<{ name: string; content: string }> = [];
        let currentFunc: { name: string; content: string } | null = null;
        let currentIndent = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const defMatch = line.match(/^def\s+([A-Za-z_]\w*)\s*\(.*\)\s*:/);
            if (defMatch) {
                if (currentFunc) {functions.push(currentFunc)};
                currentFunc = { name: defMatch[1], content: line + "\n" };
                currentIndent = line.search(/\S|$/);
            } else if (currentFunc) {
                const indent = line.search(/\S|$/);
                if (indent <= currentIndent && line.trim() !== "") {
                    functions.push(currentFunc);
                    currentFunc = null;
                } else if (currentFunc) {
                    currentFunc.content += line + "\n";
                }
            }
        }
        if (currentFunc) {functions.push(currentFunc);};
        return functions;
    }

    public parseFunctions(){
        //Get list of functions defined by each cell
        const functions: Array<Array<{ name: string; content: string }>> = this.cells.map(
            (cell) => this.findGlobalFunctions(cell.code)
        );
        let fi=0; let ci=0;
        while(fi<functions.length){
            const fun = functions[fi];
            const cell = this.cells[ci];
            if (fun.length===0){
                fi++; ci++;
                continue;
            }
            //Remove function declaration from cells
            fun.forEach((f) => {
                cell.code = cell.code.replace(f.content, "");
            });
            //Append new cell with only function declarations
            this.cells.splice(ci, 0, {code: fun.map((f) => f.content).join(""), reads: [], reads_file: [], writes: [], imports: [], isFunctions: true, declares: fun.map((f) => f.name), dependsOn:{}, calls:[]});
            ci+=2;
            fi++;
        }
    }

    public makeFunctionsIndependent(){
        for (let i=0; i<this.cells.length; i++){ 
            if (!this.cells[i].isFunctions) {continue};

            const fcell = this.cells[i];
            const reads = fcell.reads;
            const replaced = reads.map((read) => `__${read.toLowerCase()}__` );
            //Replace all reads with replaced keyword inside code
            for (let j=0; j<reads.length; j++){
                fcell.code = fcell.code.replace(reads[j], replaced[j]);
            }
            fcell.declares.forEach((decl, index) => {
                const regex = new RegExp(`\\b${decl}\\(([^)]*)\\)`, 'g');
                fcell.code = fcell.code.replace(regex, (match, p1) => {
                    return match.replace(p1, p1 + ", " + replaced.join(", "));
                });
            });
            //Find cells that call one of these functions - replace call and add dependencies
            for (let j=i+1; j<this.cells.length; j++){
                const cell = this.cells[j];
                if (cell.isFunctions){
                    continue;
                }
                fcell.declares.forEach((decl, index) => {
                    const regex = new RegExp(`\\b${decl}\\(([^)]*)\\)`, 'g');
                    if (cell.code.match(regex)){
                        cell.calls.push(decl);
                        cell.reads.push(...reads);
                        cell.reads = [...new Set(cell.reads)];
                        cell.code = cell.code.replace(regex, (match, p1) => {
                            return match.replace(p1, p1 + ", " + reads.join(", "));
                        });
                    }
                });
            }
            fcell.reads = [];
        }
        //Remove eventually empty cells
        this.cells = this.cells.filter((cell) => cell.code.length>1);
    }

    buildDependencyGraph(){
        const lastChanged: { [key: string]: number }[] = this.cells.map(() => ({}));
        this.cells.forEach((cell, index) => {
            if (index > 0){
                cell.reads.forEach((read) => {
                    if (lastChanged[index-1][read] !== undefined) {
                        cell.dependsOn[read] = lastChanged[index-1][read];
                    } else if (cell.writes.includes(read)){

                    } else {
                        throw new DependencyError(`Variable ${read} is not defined in previous cells`, index, read);
                    }
                });
                Object.keys(lastChanged[index - 1]).forEach((key) => {
                    lastChanged[index][key] = lastChanged[index - 1][key];
                });
            }
            cell.writes.forEach((write) => {
                lastChanged[index][write] = index;
            });
        });
    }
}

export interface RulesNode{
    isLoading: boolean;
    cell: Cell;
    name: string;
    can_become: { [key: string]: boolean };
    type: "rule" | "script" | "undecided";
    import_dependencies: { [key: string]: RulesNodeImpl };
    rule_dependencies: { [key: string]: RulesNodeImpl };
    undecided_dependencies: { [key: string]: RulesNodeImpl };
}

export class RulesNodeImpl implements RulesNode{
    can_become = {"rule": true, "script": true, "undecided": true};
    import_dependencies: { [key: string]: RulesNodeImpl } = {};
    rule_dependencies: { [key: string]: RulesNodeImpl } = {};
    undecided_dependencies: { [key: string]: RulesNodeImpl } = {};

    constructor(public isLoading: boolean, public cell: Cell, public type: "rule" | "script" | "undecided", public name: string){
        if (this.cell.isFunctions){
            this.can_become = {"rule": false, "script": true, "undecided": false};
        }
    }
    getType(): 'rule' | 'script' | 'undecided' {
        return this.type;
    }
    addDependency(key: string, target: RulesNodeImpl): boolean{
        const oldType = this.type;
        if (target.type === "rule"){
            this.rule_dependencies[key] = target;
        } else if (target.type === "script"){
            this.import_dependencies[key] = target;
        } else {
            this.undecided_dependencies[key] = target;
        }
        this.updateCanBecome();
        this.updateType();
        return this.type!==oldType;
    }
    updateDependencies(){
        const allDependencies = [...Object.keys(this.import_dependencies), ...Object.keys(this.rule_dependencies), ...Object.keys(this.undecided_dependencies)];
        const allDependencyNodes: RulesNodeImpl[] = [...Object.values(this.import_dependencies), ...Object.values(this.rule_dependencies), ...Object.values(this.undecided_dependencies)];
        this.rule_dependencies = {}; this.import_dependencies = {}; this.undecided_dependencies = {};
        allDependencies.forEach((key, target) => {
            if (allDependencyNodes[target].type === "rule"){
                this.rule_dependencies[key] = allDependencyNodes[target];
            } else if (allDependencyNodes[target].type === "script"){
                this.import_dependencies[key] = allDependencyNodes[target];
            } else {
                this.undecided_dependencies[key] = allDependencyNodes[target];
            }
        });
        this.updateCanBecome();
        this.updateType();
    }
    updateCanBecome(){
        if (this.cell.isFunctions){
            this.can_become = {"rule": false, "script": true, "undecided": false};
            return;
        }
        this.can_become = {"rule": true, "script": true, "undecided": true};
        if (Object.keys(this.rule_dependencies).length > 0){
            this.can_become = {"rule": true, "script": false, "undecided": false};
        } else if (Object.keys(this.undecided_dependencies).length > 0){
            this.can_become = {"rule": true, "script": false, "undecided": true};
        }
    }
    updateType(){
        if (this.can_become[this.type]){
            return;
        }
        if (this.can_become["undecided"]){
            this.type = "undecided";
            return;
        }
        if (this.can_become["rule"]){
            this.type = "rule";
            return;
        }
        this.type = "script";
    }
    setType(type: "rule" | "script" | "undecided"){
        if (this.can_become[type] === false){
            throw new Error("Cannot change type to " + type);
        }
        this.type = type;
    }
}

class RulesDependencyGraph{
    nodes: RulesNodeImpl[];
    constructor(cells: CellDependencyGraph){
        this.nodes = [];
        this.buildFromDependencyGraph(cells);
    }
    buildFromDependencyGraph(cells: CellDependencyGraph, startFrom=0){
        let nodes = this.nodes;
        if (startFrom > 0 && startFrom < this.nodes.length){
            nodes = this.nodes.slice(0, startFrom);
        }
        for (let i=startFrom; i<cells.cells.length; i++){
            const cell = cells.cells[i];
            if (cell.isFunctions){
                nodes.push(new RulesNodeImpl(true, cell, "script", ""));
                continue;
            }
            const rule = new RulesNodeImpl(true, cell, "undecided", "");
            Object.keys(cell.dependsOn).forEach((dependency: string) => {
                rule.addDependency(dependency, nodes[cell.dependsOn[dependency]]);
            });
            nodes.push(rule);
        }
    }

    setNodeDetails(index: number, name: string, type: "rule" | "script" | "undecided"){
        this.nodes[index].name = name;
        this.nodes[index].setType(type);
        for (let i=index+1; i<this.nodes.length; i++){
            this.nodes[i].updateDependencies();
        }
    }
    async guessGraphTypesAndNames(response:any, changeFrom=0){
        for (let i=changeFrom; i<response.rules.length; i++){
            const rule = response.rules[i];
            //"cell_index": <number>, "rule_name": <string>, "type": <string>} for each cell... ]
            try{
                const name = rule.rule_name || this.nodes[rule.cell_index].name;
                this.setNodeDetails(rule.cell_index, name, rule.type);
            } catch (e:any){}
        };
    }
}

export class NotebookController{
    cells: CellDependencyGraphImpl | undefined;
    rulesGraph: RulesDependencyGraph | undefined;
    constructor(private path: vscode.Uri, private llm: LLM){
    }

    async openNotebook(): Promise<CellDependencyGraph>{
        const opened = await vscode.workspace.openTextDocument(this.path);
        const json = await JSON.parse(opened.getText());  
        const result: string[][] = json.cells.filter((cell: any) => cell.cell_type === "code").map((cell: any) => cell.source);
        //Build data structure
        this.cells = new CellDependencyGraphImpl(result);
        //Parse function declarations
        this.cells.parseFunctions();
        //Get dependencies
        await this.setDependenciesForCells();
        //Use parsed info to make functions independent from context
        this.cells.makeFunctionsIndependent();
        //Build dependency indexes:
        this.cells.buildDependencyGraph();
        return this.cells;
    }

    async getRulesGraph(): Promise<RulesNode[] | undefined>{
        if (!this.cells){
            return;
        }
        this.rulesGraph = new RulesDependencyGraph(this.cells);
        await this.updateRulesGraph();
        return this.rulesGraph.nodes;
    }

    private async updateRulesGraph(changeFrom: number = 0): Promise<RulesNode[]>{
        if (!this.rulesGraph){
            return [];
        }
        let prompt = "I have a jupyter notebook that is being processed into a snakemake pipeline. This process is complex and involves " +
        "decomposition of the notebook into smaller pieces of python code, and linking them together in a snakemake pipeline.\n" +
        "In this step, I have a list of cells. Each cell can have three states: \n"+
        "1- A rule: A cell that is a candidate to become a snakemake rule. It will produce output files.\n"+
        "2- A script: A cell will not become a rule, but will be imported by other cells.\n"+
        "3- Undecided: A cell that can be either a rule or a script and it will be decided later.\n\n"+
        "Note: each cell has data dependencies toward other cells. Data dependencies include the following limitations:\n"+
        "1- A rule can depend from any type of cells\n"+
        "2- A script can depend only from other scripts\n"+
        "3- An undecided cell can depend from scripts and undecided cells\n"+
        "This implies that turning an undecided cell into a rule will force its undecided dependencies to become rules too.\n\n"+
        "Consider the following notebook cells:\n\n" +
        this.rulesGraph.nodes.map((node, index) => {
            return "Cell. " + index + "\nCode:\n" + node.cell.code + 
            "\n depends on cells: <" + Object.values(node.cell.dependsOn).join(", ")+">" +
            " current type: " + node.type + " current name (can be empty): <" + node.name + ">" +
            (node.type==="undecided" ?( " can become rule: <" + node.can_become.rule + "> can become script: <" + node.can_become.script) + ">" : "");
        }).join("\n\n") + "\n\n" +
        "For every cell I need you to provide:\n"+
        "1- A suggestion for the cell state, ONLY IF the cell is undecided, you can't change decided cells.\n"+
        "2- A possible short name for the rule or the script of the cell\n"+
        "When deciding if changing an undecided cell state consider this: small pieces of code that do not produce significant data are good candidates for scripts. Pieces of code that produce meaningful data, or that produce data that is readed by many other cells are good candidates to be rules. If you are undecided, let it undecided and the user will choose himself.\n"+
        "Please output your response in the following JSON schema:\n"+
        `{"rules": [ {"cell_index": <number>, "rule_name": <string>, "type": <string>} for each cell... ] } \n`+
        (changeFrom===0 ? "Please provide at least a name for every cell, even if you don't want to change the state." : 
            "You can change the state of the cells from " + changeFrom + " onward. For those, please provide at least a name for every cell, even if you don't want to change the state.");
        const response = await this.llm.runQuery(prompt);
        const formatted: any = this.parseJsonFromResponse(response);
        this.rulesGraph.guessGraphTypesAndNames(formatted, changeFrom);
        return this.rulesGraph.nodes;
    }

    private async setDependenciesForCells(){
        let prompt = "I have a jupyter notebook that is being processed into a snakemake pipeline. This process involves " +
        "decomposition of the notebook into smaller pieces of python code, and linking them together in a snakemake pipeline.\n" +
        "The most important thing is define how each cell changes the global state.\nFor each cell, " +
        "I need the set of non-local variables that the code inside the cell WRITES (either define first time or modify) and READS. I also need the list of files that the cell might read.\n"+
        "The READS variables must contain only GLOBAL variables readed. If a cell declares a function that receives an argument,"+
        " the argument is NOT in the READS list - it will be the cell who call the function who provide it. " +
        "Contrarily, if the cell calls the function and valorize the argument with a global variable then the variables goes in the READS. "+
        "If a function reads a global variable inside its body, it goes into the READS list of the cell that declares this function.\n"+
        "Finally, the READS and WRITES lists regard only variables. If a cell calls a function EXAMPLE_FUNCTION(..params..) do not put EXAMPLE_FUNCTION in the READS list, " +
        "and if a cell defines it def EXAMPLE_FUNCTION(..): .. do not put it in the  WRITES list. \n" +
        "Regarding the WRITES list, notice that only variables and data goes there, not function declaration. For example MY_VAR+=1: MY_VAR goes in the list. def my_func(..): my_func does not go in the list.\n" +
        "Consider the following notebook cells:\n\n" +
        this.cells?.cells.map((cell, index) => "Cell. " + index + "\n" + cell.code).join("\n\n") + "\n\n" +
        "Please provide to me the list of READED variables, WRITTEN variables and READED file for each cell. For each variable use the same name used in the code without changing it.\n"+
        "\n\nPlease write the output in JSON format following this schema:\n"+
        `{ "cells": [ {"cell_index": <number>, "reads": [<strings>], "writes": [<indexes>], "reads_file": [<indexes>]}  for each rule... ] }`;
        const response = await this.llm.runQuery(prompt);
        const formatted: any = this.parseJsonFromResponse(response);
        if (!formatted.cells || !Array.isArray(formatted.cells)) {
            throw new Error("Invalid response format: 'rules' is missing or not an array");
        }
        formatted.cells.forEach(
            (cell: any) => {
                if (typeof cell.cell_index !== 'number' ||
                !Array.isArray(cell.reads) ||
                !Array.isArray(cell.writes) ||
                !Array.isArray(cell.reads_file)) {
                throw new Error("Invalid response format: One or more cell properties are missing or of incorrect type");
                }
                this.cells?.setDependency(cell.cell_index, cell.reads, cell.reads_file, cell.writes, []);
            }
        );
    }

    private parseJsonFromResponse(response: string): any{
        // If response is in form <some text>{ ..  }<some text>, remove surrounding text
        let start = response.indexOf("{");
        let end = response.lastIndexOf("}");
        if (start !== -1 && end !== -1){
            response = response.substring(start, end + 1);
        }
        return JSON.parse(response);
    }

    deleteCell(cell_index: number): [CellDependencyGraph, Promise<RulesNode[]>]|undefined{
        if (this.cells && this.rulesGraph){
            const removed = this.cells.cells.splice(cell_index, 1);
            try{
                this.cells.buildDependencyGraph();
            } catch (e: any){
                //If removing this cell breaks the dependencies, notify the user and undo the change
                this.cells.cells.splice(cell_index, 0, ...removed);
                throw e;
            }
            //Update rule graph
            this.rulesGraph.buildFromDependencyGraph(this.cells, cell_index);
            const update = this.updateRulesGraph(cell_index);
            return [this.cells, update];
        }
        return undefined;
    }

    async splitCell(index: number, code1: string, code2: string): Promise<[CellDependencyGraph, RulesNode[]]|undefined>{
        if (!this.cells){return;}
        if (code1.length === 0 || code2.length === 0){ return [this.cells, this.rulesGraph?.nodes||[]];}
        const oldCell = this.cells.cells[index];
        try{
            let calls = oldCell.calls;
            const cell_a: Cell = {
                code: code1, reads: [], reads_file: [], writes: [], imports: [],
                isFunctions: false, declares: [], dependsOn: {}, calls: []
            };
            const cell_b: Cell = {
                code: code2, reads: [], reads_file: [], writes: [], imports: [],
                isFunctions: false, declares: [], dependsOn: {}, calls: []
            };
            this.cells.cells.splice(index, 1, cell_a, cell_b);
            let prompt = "I have a jupyter notebook that is being processed into a snakemake pipeline. This process involves " +
            "decomposition of the notebook into smaller pieces of python code, and linking them together in a snakemake pipeline.\n" +
            "The most important thing is define how each cell changes the global state.\nFor each cell, " +
            "I need the set of non-local variables that the code inside the cell WRITES (either define first time or modify) and READS. I also need the list of files that the cell might read.\n"+
            "The READS variables must contain only GLOBAL variables readed. If a cell declares a function that receives an argument,"+
            " the argument is NOT in the READS list - it will be the cell who call the function who provide it. " +
            "Contrarily, if the cell calls the function and valorize the argument with a global variable then the variables goes in the READS. "+
            "If a function reads a global variable inside its body, it goes into the READS list of the cell that declares this function.\n"+
            "Finally, the READS and WRITES lists regard only variables. If a cell calls a function EXAMPLE_FUNCTION(..params..) do not put EXAMPLE_FUNCTION in the READS list, " +
            "and if a cell defines it def EXAMPLE_FUNCTION(..): .. do not put it in the  WRITES list. \n" +
            "Regarding the WRITES list, notice that only variables and data goes there, not function declaration. For example MY_VAR+=1: MY_VAR goes in the list. def my_func(..): my_func does not go in the list.\n" +
            "Note that the cells provided are only part of the notebook. Readed variables that are not defined in these cells are likely defined by previous ones.\n"+
            "Consider the following notebook cells:\n\n" +
            [cell_a,cell_b].map((cell, index) => "Cell. " + index + "\n" + cell.code).join("\n\n") + "\n\n" +
            "Please provide to me the list of READED variables, WRITTEN variables and READED file for each cell. For each variable use the same name used in the code without changing it.\n"+
            "\n\nPlease write the output in JSON format following this schema:\n"+
            `{ "cells": [ {"cell_index": <number>, "reads": [<strings>], "writes": [<indexes>], "reads_file": [<indexes>]}  for each rule... ] }`;
            const response = await this.llm.runQuery(prompt);
            const formatted: any = this.parseJsonFromResponse(response);
            if (!formatted.cells || !Array.isArray(formatted.cells)) {
                throw new Error("Invalid response format: 'rules' is missing or not an array");
            }
            cell_a.reads = formatted.cells[0].reads;
            cell_a.reads_file = formatted.cells[0].reads_file;
            cell_a.writes = formatted.cells[0].writes;
            cell_b.reads = formatted.cells[1].reads;
            cell_b.reads_file = formatted.cells[1].reads_file;
            cell_b.writes = formatted.cells[1].writes;
            if (calls.length > 0){
                cell_a.reads = cell_a.reads.filter((read) => !calls.includes(read));
                cell_b.reads = cell_b.reads.filter((read) => !calls.includes(read));
                calls.forEach((call) => {
                    if (cell_a.code.includes(call)) {
                        cell_a.calls.push(call);
                    }
                    if (cell_b.code.includes(call)) {
                        cell_b.calls.push(call);
                    }
                });
            }
            this.cells.buildDependencyGraph();
        } catch (e: any){
            this.cells.cells.splice(index, 2, oldCell);
            throw e;
        }
        //Update rule graph
        this.rulesGraph?.buildFromDependencyGraph(this.cells, index);
        const update = await this.updateRulesGraph(index);
        return [this.cells, update];
    }

    mergeCells(index_a: number, index_b: number): [CellDependencyGraph, Promise<RulesNode[]>]|undefined{
        if (index_b < index_a){
            const temp = index_a;
            index_a = index_b;
            index_b = temp;
        }
        if (!this.cells){return;}
        //What A reads, goes in new cell reads
        //What B reads, goes in new cell reads IF A does not write it
        //Rest of fields are merged between the two
        const new_cell: Cell = {
            code: this.cells?.cells[index_a].code + this.cells?.cells[index_b].code,
            reads: [...new Set([
                ...this.cells?.cells[index_a].reads || [],
                ...this.cells?.cells[index_b].reads.filter(
                    (read) => !this.cells?.cells[index_a].writes.includes(read)
                ) || []
            ])],
            reads_file: [...this.cells.cells[index_a].reads_file, ...this.cells.cells[index_b].reads_file],
            writes: [...new Set([...this.cells?.cells[index_a].writes || [], ...this.cells?.cells[index_b].writes || []])],
            imports: [...new Set([...this.cells?.cells[index_a].imports || [], ...this.cells?.cells[index_b].imports || []])],
            isFunctions: false,
            declares: [],
            dependsOn: {},
            calls: [...new Set([...this.cells?.cells[index_a].calls || [], ...this.cells?.cells[index_b].calls || []])]
        };
        this.cells.cells.splice(index_a, 2, new_cell);
        this.cells.buildDependencyGraph();
        //Update rule graph
        this.rulesGraph?.buildFromDependencyGraph(this.cells, index_a);
        const update = this.updateRulesGraph(index_a);
        return [this.cells, update];
    }

}


/**public async getCandidateRules(): Promise<any>{
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
    } */