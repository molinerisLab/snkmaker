import { json } from 'stream/consumers';
import * as vscode from 'vscode';
import { LLM, ModelComms } from './ModelComms';


export interface Cell{
    code: string; reads: string[]; reads_file: string[], writes: string[], imports: string[];
    isFunctions: boolean; declares: string[]; calls: string[];
    dependsOn: { [key: string]: number };
    dependsOnFunction: { [key: string]: number };
    missingDependencies: string[];
}
export interface CellDependencyGraph{
    cells: Cell[];
}

export class DependencyError{
    constructor(public message: string, public reader_cell: number, public variable: string){}
}
export class IllegalTypeChangeError{
    constructor(public oldState: string, public newState: string, public error: string){}
}

class CellDependencyGraphImpl implements CellDependencyGraph{
    cells: Cell[];
    constructor(cells: string[][]){
        this.cells = cells.map((cell) => {
            return {code: cell.join(""), reads: [], reads_file: [], writes: [], imports: [], isFunctions:false, declares:[], dependsOn:{}, calls:[], dependsOnFunction:{}, missingDependencies:[]};
        });
    }
    public setDependency(index: number, reads: string[], reads_file: string[], writes: string[], imports: string[]){
        this.cells[index].reads = reads;
        this.cells[index].reads_file = reads_file;
        this.cells[index].writes = writes;
        this.cells[index].imports = imports;
    }

    public parseImports(){
        const importRegex = /^(import\s+[^\s]+(?:\s+as\s+[^\s]+)?|from\s+[^\s]+\s+import\s+[^\s]+(?:\s+as\s+[^\s]+)?)/;
        const importSet = new Set<string>();
        for (let i=0; i<this.cells.length; i++){
            const cell = this.cells[i];
            const lines = cell.code.split(/[\n;]/);
            const filteredLines = lines.filter((line) => {
                if(importRegex.test(line.trim())){
                    importSet.add(line.trim());
                    return false;
                }
                return true;
            });
            cell.code = filteredLines.join("\n");
        }
        return Array.from(importSet);
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
            this.cells.splice(ci, 0, {code: fun.map((f) => f.content).join(""), reads: [], reads_file: [], writes: [], imports: [], isFunctions: true, declares: fun.map((f) => f.name), dependsOn:{}, calls:[], dependsOnFunction:{}, missingDependencies:[]});
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
            fcell.declares.forEach((decl, index) => {
                if (fcell.writes.includes(decl)) {
                    fcell.writes = fcell.writes.filter((read) => read !== decl);
                }
                for (let j=i+1; j<this.cells.length; j++){
                    if (this.cells[j].reads.includes(decl)) {
                        this.cells[j].reads = this.cells[j].reads.filter((read) => read !== decl);
                    }
                }
            });
            //Replace all reads with replaced keyword inside code
            for (let j=0; j<reads.length; j++){
                fcell.code = fcell.code.replace(reads[j], replaced[j]);
            }
            if (replaced.length > 0){
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
                            cell.dependsOnFunction[decl] = i;
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
        }
        //Remove eventually empty cells
        this.cells = this.cells.filter((cell) => cell.code.length>1);
    }

    buildDependencyGraph(){
        const lastChanged: { [key: string]: number }[] = this.cells.map(() => ({}));
        this.cells.forEach((cell, index) => {
            cell.dependsOn = {};
            cell.missingDependencies = [];
            if (index > 0){
                cell.reads.forEach((read) => {
                    if (lastChanged[index-1][read] !== undefined) {
                        cell.dependsOn[read] = lastChanged[index-1][read];
                    } else if (cell.writes.includes(read)){

                    } else {
                        cell.missingDependencies.push(read);
                        //throw new DependencyError(`Variable ${read} is not defined in previous cells`, index, read);
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
    ruleAdditionalInfo: RuleAdditionalInfo;
}

class RuleAdditionalInfo{
    prefixCode: string = "";
    postfixCode: string = "";
    exportsTo: { [key: string]: RulesNode[] } = {};
    saveFiles: string[] = [];
    readFiles: string[] = [];
    constructor(public code:string){}
}

export class RulesNodeImpl implements RulesNode{
    can_become = {"rule": true, "script": true, "undecided": true};
    import_dependencies: { [key: string]: RulesNodeImpl } = {};
    rule_dependencies: { [key: string]: RulesNodeImpl } = {};
    undecided_dependencies: { [key: string]: RulesNodeImpl } = {};
    ruleAdditionalInfo: RuleAdditionalInfo;

    constructor(public isLoading: boolean, public cell: Cell, public type: "rule" | "script" | "undecided", public name: string){
        if (this.cell.isFunctions){
            this.can_become = {"rule": false, "script": true, "undecided": false};
        }
        this.ruleAdditionalInfo = new RuleAdditionalInfo(cell.code);
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
            throw new IllegalTypeChangeError(this.type, type, "This node can't become this type");
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
    buildAdditionalInfo(){
        this.nodes.forEach((node, index) => {
            Object.entries(node.rule_dependencies).forEach(([variable, target]: [string, RulesNodeImpl]) => {
                if (target.ruleAdditionalInfo.exportsTo[variable] === undefined){
                    target.ruleAdditionalInfo.exportsTo[variable] = [this.nodes[index]];
                } else {
                    target.ruleAdditionalInfo.exportsTo[variable].push(this.nodes[index]);
                }
            });
        });
    }
    buildFromDependencyGraph(cells: CellDependencyGraph, startFrom=0){
        let nodes = this.nodes;
        if (startFrom > 0 && startFrom < this.nodes.length){
            nodes = this.nodes.slice(0, startFrom);
        }
        for (let i=startFrom; i<cells.cells.length; i++){
            const cell = cells.cells[i];
            if (cell.isFunctions){
                nodes.push(new RulesNodeImpl(false, cell, "script", ""));
                continue;
            }
            const rule = new RulesNodeImpl(false, cell, "undecided", "");
            Object.keys(cell.dependsOn).forEach((dependency: string) => {
                rule.addDependency(dependency, nodes[cell.dependsOn[dependency]]);
            });
            nodes.push(rule);
        }
        this.nodes = nodes;
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
        //Parse imports
        await this.parseImportsFromCells();
        //Get dependencies
        await this.setDependenciesForCells();
        //Use parsed info to make functions independent from context
        this.cells.makeFunctionsIndependent();
        //Build dependency indexes:
        this.cells.buildDependencyGraph();
        return this.cells;
    }

    async updateRule(rule: RulesNodeImpl, position: number){
        if (rule.ruleAdditionalInfo.saveFiles.length > 0){
            const prompt = "I have this Python script:\n"+
            rule.ruleAdditionalInfo.postfixCode + "\n\n"+
            "Can you tell me the list of files that this script writes? If it writes none, then return an empty list."+
            "Plase return it in JSON format following this schema:\n" +
            "{ 'written_filenames': ['list of filenames for the saved files'] }";
            const response = await this.llm.runQuery(prompt);
            const formatted: any = this.parseJsonFromResponse(response);
            rule.ruleAdditionalInfo.saveFiles = formatted.written_filenames;
        }
        if (this.rulesGraph){
            this.rulesGraph.nodes[position].cell.code = rule.cell.code;
            this.rulesGraph.nodes[position].ruleAdditionalInfo = rule.ruleAdditionalInfo;
        }
    }

    async buildAdditionalInfo(startFrom=0){
        if (!this.rulesGraph){return;}
        this.rulesGraph.buildAdditionalInfo();

        function getDependenciesFromScripts(node: RulesNodeImpl, nodes: RulesNodeImpl[]){
            const dependencies: any = [];
            Object.keys(node.import_dependencies).forEach((dep) => {
                dependencies.push([dep, node.import_dependencies[dep]]);
            });
            Object.keys(node.cell.dependsOnFunction).forEach((dep) => {
                dependencies.push([dep, nodes[node.cell.dependsOnFunction[dep]]]);
            });
            return dependencies;
        }

        for (let i=startFrom; i<this.rulesGraph.nodes.length; i++){
            const node = this.rulesGraph.nodes[i];
            if (node.type === "script"){
                const dependencies = getDependenciesFromScripts(node, this.rulesGraph.nodes);
                if (dependencies.length === 0){
                    continue;
                }
                node.isLoading = true;
                const prompt = "I have this Python script. The script uses imported data and/or functions from other scripts, "+
                "but the import statements are missing. I'd like you to add the imoport statement for me. "+
                "All the other scripts as in the same directory as this one.\n"+
                "The script is:\n\n" + node.cell.code + "\n\n"+
                "The dependencies are:\n" + 
                dependencies.map((d:any) => d[0] + " from script " + d[1].name).join("\n") + "\n\n"+
                "Please write for me the import statements of my script. Please write the output in JSON format following this schema:\n"+
                `{"imports": ["import statement for each dependency"]}` +
                "Please do not repeat the code already existing, only add the import statements";
                const response = await this.llm.runQuery(prompt);
                const formatted: any = this.parseJsonFromResponse(response);
                if (!formatted.imports || !Array.isArray(formatted.imports)) {
                    throw new Error("Invalid response format: 'imports' is missing or not an array");
                }
                node.isLoading = false;
                node.ruleAdditionalInfo.prefixCode = formatted.imports.join("\n");
            } else if (node.type==="rule"){
                // [variable, node]
                const importDependencies = getDependenciesFromScripts(node, this.rulesGraph.nodes);
                const ruleDependencies = Object.entries(node.rule_dependencies);
                const exportsTo = Object.entries(node.ruleAdditionalInfo.exportsTo);
                node.isLoading = true;
                const prompt = "I have this Python script, and I need you to add code to perform three operations: "+
                "1- The scripts is missing some imports. I will provide you the list of the imports that are needed and the names "+
                "of the scripts from which the imports are needed. You need to add the import statements to the script. "+
                "Note, the scripts are in the same directory of this one.\n"+
                "2- The script needs to read some file(s) and use their content to valorize some variables before starting. "+
                " I will provide the name of the variables to valorize and the piece of code that produces the file that needs to be readed.\n"+
                "3- The script produces some output files, that will be readed by other scripts. "+
                " I will provide the name of the variables that needs to be saved."+
                "My script is:\n\n" + node.cell.code + "\n\n"+
                "The imports needed are:\n" +
                ((importDependencies.length===0) ? " - no import actually needed -" :
                importDependencies.map((d:any) => d[0] + " from script " + d[1].name).join("\n")) + "\n\n"+
                "The variables it needs to valorize by reading files are: " +
                ((ruleDependencies.length===0) ? " - no variable actually needed for reading -" :
                ruleDependencies.map((d:any) => "Variable: " + d[0] + " produced by the script " + d[1].name).join("\n") + "\n\n"+
                "I will provide the code that produces the files that you need: "+
                ruleDependencies.map((d:any) => "Code that saves variable " + d[0] + " to a file:\n" + d[1].ruleAdditionalInfo.postfixCode).join("\n")) + "\n\n"+
                "The variables that needs to be saved are: \n" +
                ((exportsTo.length===0) ? " - no variable actually needed for saving -" :
                exportsTo.map((d:any) => "Variable: " + d[0] + " must be saved and will be readed by the script(s) " + d[1].map((d:RulesNodeImpl)=>d.name).join(", ")).join("\n") + "\n\n"+
                "When saving files, you can decide the name, format and number of files. Consider the number of scripts that will read them to make a good decision.\n") +
                "\nPlease write the output in JSON format following this schema:\n"+
                "{ 'imports': ['import statement for each dependency'], 'reads': ['code to read each file'], 'writes': ['code to save each file'], 'readed_filenames': ['list of filenames for readed files'], 'written_filenames': ['list of filenames for the saved files'] }\n"+
                "Please do not repeat the code already existing, only valorize the three fields. If a field is empty, write an empty array.";
                const response = await this.llm.runQuery(prompt);
                const formatted: any = this.parseJsonFromResponse(response);
                node.ruleAdditionalInfo.prefixCode = formatted.imports.join("\n") + "\n" + formatted.reads.join("\n");
                node.ruleAdditionalInfo.postfixCode = formatted.writes.join("\n");
                node.ruleAdditionalInfo.saveFiles = formatted.written_filenames;
                node.ruleAdditionalInfo.readFiles = formatted.readed_filenames;
                node.isLoading = false;
            }
        }
        return this.rulesGraph.nodes;
    }

    private async parseImportsFromCells(){
        const imports = this.cells?.parseImports();
        let prompt = "I have a jupyter notebook that is being processed. The notebook is made of a list of cells, each containing python code.\n" +
        "I want to re-organize the imports. I already removed all import statement for every cell's code.\n"+
        "I will now provide you: a list of all the import statements found in the cells, and the code of each cell.\n"+
        "I want you to provide me the list of the imports that each cell needs.\n"+
        "For each cell, provide a list of the imports that are needed by the code of the cell.\n"+
        "\n\nThese are the import statements:\n"+
        imports?.map((imp, index) => "Import num " + index + ": " + imp).join("\n") + "\n\n" +
        "These are the cells:\n" +
        this.cells?.cells.map((cell, index) => "Cell num " + index + ": " + cell.code).join("\n") + "\n\n" +
        "For each cell, I'd like a list of the imports that are needed. "+
        "Please write the needed imports as a list of indexes (example: import 0, 1, 5).\n"+
        "Please write the output in JSON format following this schema:\n"+
        "{'cells': [cell_index: number, imports: [index of import for each import needed]]}";
        const response = await this.llm.runQuery(prompt);
        const formatted: any = this.parseJsonFromResponse(response);
        if (!formatted.cells || !Array.isArray(formatted.cells)) {
            throw new Error("Invalid response format: 'rules' is missing or not an array");
        }
        if (!this.cells){return;}
        for (let i=0; i<formatted.cells.length; i++){
            const p = formatted.cells[i];
            const newImports = p.imports.map((index: number) => imports?.[index]).filter((imp: string) => imp !== undefined);
            this.cells.cells[p.cell_index].code = newImports.join("\n") + "\n" +
            this.cells.cells[p.cell_index].code;
        }
    }

    getCells(): CellDependencyGraph | undefined{
        return this.cells;
    }
    getRules(){
        return this.rulesGraph?.nodes;
    }

    async getRulesGraph(): Promise<RulesNode[] | undefined>{
        if (!this.cells){
            return;
        }
        this.rulesGraph = new RulesDependencyGraph(this.cells);
        await this.updateRulesGraph();
        return this.rulesGraph.nodes;
    }

    changeRuleState(index: number, newState: string):RulesNode[]{
        if (!this.rulesGraph){
            return [];
        }
        const node = this.rulesGraph.nodes[index];
        node.setType(newState as "rule" | "script" | "undecided");
        this.rulesGraph.nodes[index] = node;
        for (let i=index+1; i<this.rulesGraph.nodes.length; i++){
            this.rulesGraph.nodes[i].updateDependencies();
        }
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
        "The main issue is managing the state. Jupyter notebooks have a global state. I can define or modify a variable in a cell, and refer to this variable in another. "+
        "After the decomposition, every cell will be executed indipendently, so I must manage the dependencies between the cells.\n"+
        "In this step I'm interested in data dependencies, so variables that are defined, modified or readed by the code inside the cells.\n"+
        +"\nFor each cell, I need the set of variables that the code inside WRITES (either define for the first time or modify) and READS. " +
        "I also need the list of files that the cell might read.\n"+
        "The READS variable must contain all the variables that the code might read. The only variables that you can skip are the ones that are defined in a local context, "+
        "for example if the code defines a function, and inside the function a local variable is defined and then readed (or a function argument is readed), this can be skipped. But if the code inside the function " +
        "reads a variable that might be defined outside of the function, the variable definitely goes in the READS list.\n"+
        "Also, modules or things that are already in the cell 'import' statements do not go in the READ list.\n" +
        "Regarding the WRITES list, peration that modify mutable objects, as appending to a list, count as WRITE operations. " +
        "As I'm interested only in data dependencies, if the cell defines a function, the name of the function that is defined do not go in the WRITES list for now. \n" +
        "I give you an example:\n"+
        "VAR_1 = 5; LIST_1.append(1);\n"+
        "print(VAR_2)\n"+
        "def myFun(arg1):\n"+
        "    print(arg1)\n"+
        "    print(VAR_3)\n"+
        "READS: VAR_2, LIST_1, VAR_3 (notice: VAR_3 is readed in the function body, but is defined outside, so it's a READ. arg1 is also readed in the function body but is an argument, valorized somewhere else, so it's not a dependency - when some cell calls the functions, it will valorize it and it will be a dependency of this cell)\n"+
        "WRITES: VAR_1, LIST_1 (notice: LIST_1 is both in the READS and WRITES, as append() depends on the previous state of the list and changes it).\n"+
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

    addCellWrite(cell_index: number, write: string): [CellDependencyGraph, Promise<RulesNode[]>]|undefined{
        if (!this.cells){return;}
        //Remove write from cell
        if (this.cells.cells[cell_index].writes.includes(write)){
            return [this.cells, new Promise((resolve) => resolve(this.rulesGraph?.nodes||[]))];
        }
        this.cells.cells[cell_index].writes.push(write);
        //re-build graph
        this.cells.buildDependencyGraph();
        //Re-build rules graph from cell_index 
        this.rulesGraph?.buildFromDependencyGraph(this.cells, cell_index);
        const update = this.updateRulesGraph(cell_index);
        return [this.cells, update];
    }
    addCellDependency(cell_index: number, dependency: string): [CellDependencyGraph, Promise<RulesNode[]>]|undefined{
        if (!this.cells){return;}
        //Remove dependency from cell
        if (this.cells.cells[cell_index].reads.includes(dependency)){
            return [this.cells, new Promise((resolve) => resolve(this.rulesGraph?.nodes||[]))];
        }
        this.cells.cells[cell_index].reads.push(dependency);
        //re-build graph
        this.cells.buildDependencyGraph();
        //Re-build rules graph from cell_index 
        this.rulesGraph?.buildFromDependencyGraph(this.cells, cell_index);
        const update = this.updateRulesGraph(cell_index);
        return [this.cells, update];
    }
    removeCellDependency(cell_index: number, dependency: string): [CellDependencyGraph, Promise<RulesNode[]>]|undefined{
        if (!this.cells){return;}
        //Remove dependency from cell
        this.cells.cells[cell_index].reads = this.cells.cells[cell_index].reads.filter((read) => read !== dependency);
        //re-build graph
        this.cells.buildDependencyGraph();
        //Re-build rules graph from cell_index 
        this.rulesGraph?.buildFromDependencyGraph(this.cells, cell_index);
        const update = this.updateRulesGraph(cell_index);
        return [this.cells, update];
    }
    removeCellWrite(cell_index: number, write: string): [CellDependencyGraph, Promise<RulesNode[]>]|undefined{
        if (!this.cells){return;}
        //Remove write from cell
        this.cells.cells[cell_index].writes = this.cells.cells[cell_index].writes.filter((w) => w !== write);
        //re-build graph
        this.cells.buildDependencyGraph();
        //Re-build rules graph from cell_index 
        this.rulesGraph?.buildFromDependencyGraph(this.cells, cell_index);
        const update = this.updateRulesGraph(cell_index);
        return [this.cells, update];
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
                isFunctions: false, declares: [], dependsOn: {}, calls: [], dependsOnFunction:{},
                missingDependencies:[]
            };
            const cell_b: Cell = {
                code: code2, reads: [], reads_file: [], writes: [], imports: [],
                isFunctions: false, declares: [], dependsOn: {}, calls: [], dependsOnFunction:{},
                missingDependencies:[]
            };
            this.cells.cells.splice(index, 1, cell_a, cell_b);
            let prompt = "I have a jupyter notebook that is being processed into a snakemake pipeline. This process involves " +
            "decomposition of the notebook into smaller pieces of python code, and linking them together in a snakemake pipeline.\n" +
            "The most important thing is define how each cell changes the global state.\nFor each cell, " +
            "I need the set of non-local variables that the code inside the cell WRITES (either define first time or modify) and READS. I also need the list of files that the cell might read.\n"+
            "The READS variables must contain only GLOBAL variables readed. " +
            "Modules or things that are already in the cell 'import' statements do not go in the READ list. " +
            "If a cell declares a function that receives an argument,"+
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
                        cell_a.dependsOnFunction[call] = oldCell.dependsOnFunction[call];
                    }
                    if (cell_b.code.includes(call)) {
                        cell_b.calls.push(call);
                        cell_b.dependsOnFunction[call] = oldCell.dependsOnFunction[call];
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
            calls: [...new Set([...this.cells?.cells[index_a].calls || [], ...this.cells?.cells[index_b].calls || []])],
            dependsOnFunction: { ...this.cells?.cells[index_a].dependsOnFunction, ...this.cells?.cells[index_b].dependsOnFunction },
            missingDependencies:[]
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