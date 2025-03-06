import { json } from 'stream/consumers';
import * as vscode from 'vscode';
import { LLM, ModelComms } from './ModelComms';
import { read } from 'fs';
import { resolve } from 'path';
import { writeFile } from 'fs/promises';
import { ExtensionSettings } from '../utils/ExtensionSettings';
import { UndoRedoStack } from './UndoRedoStack';


export class DependencyError{
    constructor(public message: string, public reader_cell: number, public variable: string){}
}
export class IllegalTypeChangeError{
    constructor(public oldState: string, public newState: string, public error: string){}
}

//Enrich cell's data with additional information
export class RulesNode{
    constructor(
        public name: string,
        public type: "rule" | "script" | "undecided",
        public isFunction: boolean,
        public import_dependencies: { [key: string]: number },
        public rule_dependencies: { [key: string]: number },
        public undecided_dependencies: { [key: string]: number },
        public prefixCode: string = "",
        public postfixCode: string = "",
        public saveFiles: string[] = [],
        public readFiles: string[] = [],
        public canBecomeStatic: {rule: boolean, script: boolean, undecided: boolean} = {"rule": true, "script": true, "undecided": true},
        public snakemakeRule: string = ""
    ) {}

    updateRuleDependencies(cell: Cell, cells: Cell[]){
        this.rule_dependencies = {}; this.import_dependencies = {}; this.undecided_dependencies = {};
        Object.entries(cell.dependsOn).forEach(([key, target]) => {
            switch(cells[target].rule.type){
                case "rule":
                    this.rule_dependencies[key] = target;
                    break;
                case "script":
                    this.import_dependencies[key] = target;
                    break;
                case "undecided":
                    this.undecided_dependencies[key] = target;
                    break;
            }
        });
        this.updateType();
    }

    setCanBecome(){
        this.canBecomeStatic = this.canBecome();
    }

    canBecome(): {rule: boolean, script: boolean, undecided: boolean}{
        if (this.isFunction){
            return {"rule": false, "script": true, "undecided": false};
        }
        if (Object.keys(this.rule_dependencies).length > 0){
            return {"rule": true, "script": false, "undecided": false};
        } else if (Object.keys(this.undecided_dependencies).length > 0){
            return {"rule": true, "script": false, "undecided": true};
        }
        return {"rule": true, "script": true, "undecided": true};
    }

    updateType(){
        let canBecome = this.canBecome();
        if (!canBecome[this.type]){
            if (canBecome["undecided"]){
                this.type = "undecided";
            } else if (canBecome["rule"]){
                this.type = "rule";
            } else {
                this.type = "script";
            }
        }
    }

    setType(type: "rule" | "script" | "undecided", noException=false){
        let canBecome = this.canBecome();
        if (canBecome[type] === false){
            if (noException){
                return;
            }
            throw new IllegalTypeChangeError(this.type, type, "This node can't become this type");
        }
        this.type = type;
    }
}

//Cell represent a notebook's cell in the graph
export class Cell {
    constructor(
        public code: string,
        public isFunctions: boolean,
        public reads: string[] = [],
        public reads_file: string[] = [],
        public writes: string[] = [],
        public imports: string[] = [],
        public declares: string[] = [],
        public calls: string[] = [],
        public missingDependencies: string[] = [],
        //Links to other cells
        public dependsOn: { [key: string]: number } = {},
        public dependsOnFunction: { [key: string]: number } = {},
        
        public writesTo: { [key: string]: number[] } = {},
        public rule: RulesNode = new RulesNode(isFunctions ? declares[0] : "", isFunctions ? "script" : "undecided", isFunctions, {}, {}, {}),
        public replacedFunctionVariables: string[] = [],
        public wildcards: string[] = []
    ) {}

    toCode(): string{
        return (this.rule.prefixCode.length>0 ? "#Read input files\n"+this.rule.prefixCode.trim()+"\n" : "" ) +
        (this.code.length>0 ? "#Script body:\n"+this.code.trim()+"\n" : "") +
        (this.rule.postfixCode.length>0 ? "#Write output files\n"+this.rule.postfixCode.trim() : "");
    }

    private toSnakemakeRuleFirst(logs:boolean){
        return `rule ${this.rule.name}:\n`+
        (this.rule.readFiles.length>0 ? `\tinput:\n\t\t${this.rule.readFiles.map((c)=>'"'+c+'"').join("\n\t\t")}` : "")+
        (this.rule.saveFiles.length>0 ? `\toutput:\n\t\t${this.rule.saveFiles.map((c)=>'"'+c+'"').join("\n\t\t")}` : "")+
        (logs ? `\n\tlog:\n\t\t"${this.rule.name}.log"` : "");
    }

    toSnakemakeRule(inline_under: number, logs:boolean): {"rule": string|null, "filename": string|null, "code": string|null}{
        return {"rule": this.rule.snakemakeRule, "filename": this.rule.name+".py", "code": this.toCode()};
    }

    setWritesTo(index: number, variable: string){
        if (this.writesTo[variable]){
            this.writesTo[variable].push(index);
        } else {
            this.writesTo[variable] = [index];
        }
    }

}


export class CellDependencyGraph{
    canUndo: boolean = false;
    canRedo: boolean = false;
    constructor(public cells: Cell[]){
    }

    public static fromCode(codeCells: string[][]){
        return new CellDependencyGraph(codeCells.map((cell) => new Cell(cell.join(""), false)));
    }

    public setCellDependency(index: number, reads: string[], reads_file: string[], writes: string[], imports: string[]){
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

    //Move function declarations to new cells, return list of name-content pairs.
    public parseFunctions(){
        function findGlobalFunctions(cell: Cell): Array<{ name: string; content: string }> {
            const code = cell.code;
            const lines = code.split("\n");
            const functions: Array<{ name: string; content: string }> = [];
            let currentFunc: { name: string; content: string } | null = null;
            let currentIndent = 0;
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                const defMatch = line.match(/^def\s+([A-Za-z_]\w*)\s*\(.*\)\s*:/);
                if (defMatch) {
                    if (currentFunc) {functions.push(currentFunc)};
                    //If function declaration is preceded by a comment, include the comment into the function
                    if (i>0 && lines[i-1].trim().startsWith("#")){
                        line = lines[i-1] + "\n" + line;
                    }
                    currentFunc = { name: defMatch[1], content: line };
                    currentIndent = line.search(/\S|$/);
                } else if (currentFunc) {
                    const indent = line.search(/\S|$/);
                    if (indent <= currentIndent && line.trim() !== "") {
                        functions.push(currentFunc);
                        currentFunc = null;
                    } else if (currentFunc) {
                        currentFunc.content += "\n"+line;
                    }
                }
            }
            if (currentFunc) {functions.push(currentFunc);};
            functions.forEach(f => cell.code = cell.code.replace(f.content, ""));
            return functions;
        }

        //Get list of functions defined by each cell
        const functions: Array<Array<{ name: string; content: string }>> = this.cells.map(
            (cell) => findGlobalFunctions(cell)
        );
        let fi=0; let ci=0;
        while(fi<functions.length){
            const fun = functions[fi];
            const cell = this.cells[ci];
            if (fun.length===0){
                fi++; ci++;
                continue;
            }
            let newCell = new Cell(fun.map((f) => f.content).join("\n"), true, [], [], [], [], fun.map((f) => f.name)); 
            this.cells.splice(ci, 0, newCell);
            ci+=2;
            fi++;
        }
        this.cells = this.cells.filter((cell) => cell.code.length>1);
    }

    public removeFunctionDependency(i: number, dependency: string){
        const fcell = this.cells[i];
        if (!fcell.isFunctions) {return}
        fcell.replacedFunctionVariables = fcell.replacedFunctionVariables.filter((v) => v !== dependency);
        //In cell code, replace __dependency__ with dependency
        const regex = new RegExp(`\\b__${dependency.toLowerCase()}__\\b`, 'g');
        //In cell code, replace function definition parameter list with dependency removed
        const regex2 = new RegExp(`\\b(${fcell.declares.join("|")})\\s*\\(([^)]*)\\)\\s*:`, 'g');
        fcell.code = fcell.code.replace(regex2, (match, funcName, params) => {
            const paramList = params.split(',').map((p: string) => p.trim());
            const filteredParams = paramList.filter((p:string) => p !== `__${dependency.toLowerCase()}__`);
            return `${funcName}(${filteredParams.join(', ')}):`;
        });
        fcell.code = fcell.code.replace(regex, dependency);
        //Remove dependency from cells that call this function
        for (let j=i+1; j<this.cells.length; j++){
            const cell = this.cells[j];
            if (cell.isFunctions){
                continue;
            }
            fcell.declares.forEach((decl, index) => {
                if (cell.calls.includes(decl)){
                    const regex = new RegExp(`\\b${decl}\\(([^)]*)\\)`, 'g');
                    if (cell.code.match(regex)) {
                        cell.code = cell.code.replace(regex, (match, args) => {
                            const argList = args.split(',').map((arg:string) => arg.trim());
                            const filteredArgs = argList.filter((arg:string) => arg !== `${dependency.toLowerCase()}`);
                            return `${decl}(${filteredArgs.join(', ')})`;
                        });
                    }
                }
            });
        }
    }

    public makeIndividualFunctionIndependent(i: number){
        if (!this.cells[i].isFunctions) {return};

        const fcell = this.cells[i];
        const reads = fcell.reads;
        const replaced = reads.map((read) => `__${read.toLowerCase()}__` );
        fcell.declares.forEach((decl, index) => {
            //Remove function name from cell writes (sometimes models put it there, but it should not)
            if (fcell.writes.includes(decl)) {
                fcell.writes = fcell.writes.filter((read) => read !== decl);
            }
            //Same for reads of cells that call this function
            for (let j=i+1; j<this.cells.length; j++){
                if (this.cells[j].reads.includes(decl)) {
                    this.cells[j].reads = this.cells[j].reads.filter((read) => read !== decl);
                }
            }
        });
        //Replace all reads with replaced keyword inside code
        for (let j=0; j<reads.length; j++){
            const regex = new RegExp(`\\b${reads[j]}\\b`, 'g');
            fcell.code = fcell.code.replace(regex, replaced[j]);
        }
        if (replaced.length > 0){
            fcell.declares.forEach((decl, index) => {
                //Update function parameters
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
            fcell.replacedFunctionVariables = [...fcell.reads, ...fcell.replacedFunctionVariables];
            fcell.reads = [];
        } else {
            //Simply add dependencies to the cells that call the function
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
                    }
                });
            }
        }
    }

    public makeFunctionsIndependent(){
        for (let i=0; i<this.cells.length; i++){ 
            this.makeIndividualFunctionIndependent(i);
        }
        //Remove eventually empty cells
        this.cells = this.cells.filter((cell) => cell.code.length>1);
    }

    public setDependencyAsWildcard(index: number, dependency: string){
        const cell = this.cells[index];
        cell.wildcards.push(dependency);
        if (!cell.reads.includes(dependency)){
            cell.reads.push(dependency);
        }
        cell.dependsOn = Object.fromEntries(
            Object.entries(cell.dependsOn).filter(([key]) => key !== dependency)
        );
        cell.missingDependencies = cell.missingDependencies.filter((dep) => dep !== dependency);
        for (let i = index+1; i<this.cells.length; i++){
            if (this.cells[i].dependsOn[dependency] === index){
                this.setDependencyAsWildcard(i, dependency);
            }
        }
    }

    public setWildcardAsDependency(index: number, dependency: string){
        const cell = this.cells[index];
        cell.wildcards = cell.wildcards.filter((dep) => dep !== dependency);
    }

    buildDependencyGraph(){
        const lastChanged: { [key: string]: number }[] = this.cells.map(() => ({}));
        this.cells.forEach((cell, index) => {
            cell.dependsOn = {};
            cell.missingDependencies = [];
            cell.writesTo = {};
            if (index > 0){
                cell.reads.forEach((read) => {
                    if (!cell.wildcards.includes(read)){
                        if (lastChanged[index-1][read] !== undefined) {
                            cell.dependsOn[read] = lastChanged[index-1][read];
                            this.cells[lastChanged[index-1][read]].setWritesTo(index, read);
                        } else {
                            cell.missingDependencies.push(read);
                        }
                    }
                });
                Object.keys(lastChanged[index - 1]).forEach((key) => {
                    lastChanged[index][key] = lastChanged[index - 1][key];
                });
            }
            if (!cell.isFunctions){
                cell.writes.forEach((write) => {
                    lastChanged[index][write] = index;
                });
            }
        });
        this.updateRulesDependencies();
    }

    updateRulesDependencies(startFrom=0){
        for (let i=startFrom; i<this.cells.length; i++){
            this.cells[i].rule.updateRuleDependencies(this.cells[i], this.cells);
        }
    }

    setRuleDetails(index: number, name: string|undefined, type: "rule" | "script" | "undecided"){
        this.cells[index].rule.name = name || this.cells[index].rule.name;
        this.cells[index].rule.setType(type);
        this.updateRulesDependencies(index+1);
    }

    setRulesTypesAndNames(response:any, changeFrom=0){
        for (let i=changeFrom; i<response.rules.length; i++){
            const rule = response.rules[i];
            try{
                const name = rule.rule_name || this.cells[rule.cell_index].rule.name;
                this.cells[rule.cell_index].rule.name = name;
                this.cells[rule.cell_index].rule.setType(rule.type, true);
            } catch (e:any){}
        };
        this.updateRulesDependencies(changeFrom);
    }

    
}

class JSON_Importer{
    static reviveRulesNode(data: any): RulesNode {
        return new RulesNode(
            data.name,
            data.type,
            data.isFunction,
            data.import_dependencies,
            data.rule_dependencies,
            data.undecided_dependencies,
            data.prefixCode,
            data.postfixCode,
            data.saveFiles,
            data.readFiles,
            data.canBecomeStatic,
            data.snakemakeRule
        );
    }

    static reviveCell(data: any): Cell {
        return new Cell(
            data.code,
            data.isFunctions,
            data.reads,
            data.reads_file,
            data.writes,
            data.imports,
            data.declares,
            data.calls,
            data.missingDependencies,
            data.dependsOn,
            data.dependsOnFunction,
            data.writesTo,
            // Recreate the embedded RulesNode
            data.rule ? JSON_Importer.reviveRulesNode(data.rule) : new RulesNode("", data.isFunctions ? "script" : "undecided", data.isFunctions, {}, {}, {}),
            data.replacedFunctionVariables,
            data.wildcards
        );
    }

    static importCellDependencyGraph(json: string): CellDependencyGraph {
        const data = JSON.parse(json);
        if (!data.cells || !Array.isArray(data.cells)) {
            throw new Error("Invalid JSON: expected a property 'cells' that is an array");
        }
        const cells = data.cells.map((cellData: any) => JSON_Importer.reviveCell(cellData));
        return new CellDependencyGraph(cells);
    }
}

export class NotebookController{
    cells: CellDependencyGraph = new CellDependencyGraph([]);
    undoRedoStack: UndoRedoStack; 

    constructor(private path: vscode.Uri, private llm: LLM){
        this.undoRedoStack = new UndoRedoStack();
    }

    private parseJsonFromResponse(response: string): any{
        let start = response.indexOf("{");
        let end = response.lastIndexOf("}");
        if (start !== -1 && end !== -1){
            response = response.substring(start, end + 1);
        }
        return JSON.parse(response);
    }

    //Undo-Redo
    saveState(){
        const exported = JSON.stringify(this.cells);
        this.undoRedoStack.push(exported);
        this.cells.canUndo = this.undoRedoStack.undoCount>0;
        this.cells.canRedo = this.undoRedoStack.redoCount>0
    }
    undo(){
        const data = this.undoRedoStack.undo();
        if (data){
            this.cells = JSON_Importer.importCellDependencyGraph(data);
            this.cells.canUndo = this.undoRedoStack.undoCount>0;
            this.cells.canRedo = this.undoRedoStack.redoCount>0
        }
    }
    redo(){
        const data = this.undoRedoStack.redo();
        if (data){
            this.cells = JSON_Importer.importCellDependencyGraph(data);
            this.cells.canUndo = this.undoRedoStack.undoCount>0;
            this.cells.canRedo = this.undoRedoStack.redoCount>0
            return true;
        }
        return false;
    }
    resetUndoRedoStack(){
        this.undoRedoStack = new UndoRedoStack();
        this.cells.canUndo = false;
        this.cells.canRedo = false;
    }

    apply_from_chat(changes:any){
        //Validate input
        for (let cell of changes){
            if (typeof cell.cell_index !== 'number' ||
            !Array.isArray(cell.wildcards) ||
            !Array.isArray(cell.writes) ||
            !Array.isArray(cell.dependencies)) {
                throw new Error("Invalid response format: One or more cell properties are missing or of incorrect type. A cell changing must have cell_index, wildcards, writes and dependencies as fields.");
            }
        }
        for (let cell of changes){
            const index = cell.cell_index;
            const target = this.cells.cells[index];
            target.reads = cell.dependencies;
            target.writes = cell.writes;
            target.wildcards = cell.wildcards;
            target.rule.type = cell.state;
        }
        this.cells.buildDependencyGraph();
    }

    apply_from_chat_second_step(changes:any){
        //Validate input
        for (let cell of changes){
            if (typeof cell.cell_index !== 'number' ||
                typeof cell.snakemakeRule !== 'string' ||
                !Array.isArray(cell.readFiles) ||
                !Array.isArray(cell.saveFiles) ||
                typeof cell.prefixCode !== 'string' ||
                typeof cell.code !== 'string' ||
                typeof cell.postfixCode !== 'string') {
                 throw new Error("Invalid response format: One or more cell properties are missing or of incorrect type");
            }
        }
        for (let cell of changes){
            const index = cell.cell_index;
            const target = this.cells.cells[index];
            target.rule.readFiles = cell.readFiles;
            target.rule.saveFiles = cell.saveFiles;
            target.rule.prefixCode = cell.prefixCode;
            target.rule.postfixCode = cell.postfixCode;
            target.rule.snakemakeRule = cell.snakemakeRule;
            target.code = cell.code;
        }

    }


    private async runPromptAndParse(original_prompt: string): Promise<any> {
        let prompt = original_prompt;
        let response = "";
        for (let i=0; i<5; i++){
            try{
                response = await this.llm.runQuery(prompt);
                const parsed = this.parseJsonFromResponse(response);
                return parsed;
            } catch (e:any){
                prompt = "I asked you this:\n\n" + original_prompt + 
                "\n\nAnd your response was: \n" + response +
                "\n\nBut when trying to parse your response in json I got this error: \n" + e.message +
                "\n\nPlease try again.";
            }
        }
        console.log(prompt)
    }

    //Opens notebook, create cell graph with read/write dependencies, parse imports and functions.
    async openNotebook(): Promise<CellDependencyGraph>{
        const opened = await vscode.workspace.openTextDocument(this.path);
        const json = await JSON.parse(opened.getText());  
        const result: string[][] = json.cells.filter((cell: any) => cell.cell_type === "code").map((cell: any) => cell.source);
        //Build data structure
        this.cells = CellDependencyGraph.fromCode(result);
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

    async makeRulesGraph(): Promise<CellDependencyGraph>{
        await this.rulesGuessNameAndState();
        return this.cells;
    }

    private async rulesGuessNameAndState(changeFrom: number = 0){
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
        this.cells.cells.map((cell, index) => {
            return "Cell. " + index + "\nCode:\n" + cell.code + 
            "\n depends on cells: <" + Object.values(cell.dependsOn).join(", ")+">" +
            " current type: " + cell.rule.type + " current name (can be empty): <" + cell.rule.name + ">" +
            (cell.rule.type==="undecided" ?( " can become rule: <" + cell.rule.canBecome().rule + "> can become script: <" + cell.rule.canBecome().script) + ">" : "");
        }).join("\n\n") + "\n\n" +
        "For every cell I need you to provide:\n"+
        "1- A suggestion for the cell state, ONLY IF the cell is undecided, you can't change decided cells.\n"+
        "2- A possible short name for the rule or the script of the cell\n"+
        "When deciding if changing an undecided cell state consider this: small pieces of code that do not produce significant data are good candidates for scripts. Pieces of code that produce meaningful data, or that produce data that is readed by many other cells are good candidates to be rules. If you are undecided, let it undecided and the user will choose himself.\n"+
        "Please output your response in the following JSON schema:\n"+
        `{"rules": [ {"cell_index": <number>, "rule_name": <string>, "type": <string>} for each cell... ] } \n`+
        (changeFrom===0 ? "Please provide at least a name for every cell, even if you don't want to change the state." : 
            "You can change the state of the cells from " + changeFrom + " onward. For those, please provide at least a name for every cell, even if you don't want to change the state.");
        const formatted = await this.runPromptAndParse(prompt);
        if (formatted){
            this.cells.setRulesTypesAndNames(formatted, changeFrom);
        }
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
        this.cells?.cells.map((cell, index) => "Cell. " + index + "\nCode:\n" + cell.code + "\nThese are imports, the imported things do not go in the READS list: " + cell.imports.join(" - ")).join("\n\n") + "\n\n" +
        "Please provide to me the list of READED variables, WRITTEN variables and READED file for each cell. For each variable use the same name used in the code without changing it.\n"+
        "\n\nPlease write the output in JSON format following this schema:\n"+
        `{ "cells": [ {"cell_index": <number>, "reads": [<strings>], "writes": [<indexes>], "reads_file": [<indexes>]}  for each rule... ] }`;
        const formatted = await this.runPromptAndParse(prompt);
        if (!formatted || !formatted.cells || !Array.isArray(formatted.cells)) {
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
                this.cells?.setCellDependency(cell.cell_index, cell.reads, cell.reads_file, cell.writes, []);
            }
        );
    }

    private async parseImportsFromCells(){
        const imports = this.cells.parseImports();
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
        const formatted = await this.runPromptAndParse(prompt);
        if (!formatted || !formatted.cells || !Array.isArray(formatted.cells)) {
            throw new Error("Invalid response format: 'rules' is missing or not an array");
        }
        if (!this.cells){return;}
        for (let i=0; i<formatted.cells.length; i++){
            const p = formatted.cells[i];
            const newImports = p.imports.map((index: number) => imports?.[index]).filter((imp: string) => imp !== undefined);
            this.cells.cells[p.cell_index].code = newImports.join("\n") + "\n" + this.cells.cells[p.cell_index].code;
            this.cells.cells[p.cell_index].imports = newImports;
        }
    }

    public setDependencyAsWildcard(index: number, dependency: string){
        this.cells.setDependencyAsWildcard(index, dependency);
        this.cells.buildDependencyGraph();
    }

    public setWildcardAsDependency(index: number, dependency: string){
        this.cells.setWildcardAsDependency(index, dependency);
        this.cells.buildDependencyGraph();
    }

    public removeFunctionDependency(index: number, keyword: string){
        this.cells.removeFunctionDependency(index, keyword);
    }

    public addDependencyToFunction(index: number, keyword: string){
        this.cells.cells[index].reads.push(keyword);
        this.cells.makeIndividualFunctionIndependent(index);
        this.cells.buildDependencyGraph();
    }

    async updateRulePostfix(index: number, code: string){
        this.cells.cells[index].rule.postfixCode = code;
        const prompt = "I have this Python script:\n"+
        code + "\n\n"+
        "Can you tell me the list of files that this script writes? If it writes none, then return an empty list."+
        "Plase return it in JSON format following this schema:\n" +
        "{ 'written_filenames': ['list of filenames for the saved files'] }";
        const formatted = await this.runPromptAndParse(prompt);
        this.cells.cells[index].rule.saveFiles = formatted.written_filenames;
        
        //Propagate changes to other cells who reads from this one
        //and recursively to the cells that reads from them
        const targetsDone = new Set<number>();
        const targetsProcessing = new Set<number>(Object.values(this.cells.cells[index].writesTo).flat());
        while(targetsProcessing.size > 0){
            const t:number|undefined = targetsProcessing.values().next().value;
            if (t === undefined){
                continue;
            }
            Object.values(this.cells.cells[t].writesTo).flat().forEach((n) => {
                if (!targetsDone.has(n)){
                    targetsProcessing.add(n);
                }
            });
            targetsProcessing.delete(t);
            targetsDone.add(t);
        }
        const propagateTo = Array.from(targetsDone);
        propagateTo.sort((a, b) => a - b);
        await this.buildRulesAdditionalCode(propagateTo);
        return this.cells;
    }

    async updateRulePrefix(index: number, code: string){
        this.cells.cells[index].rule.prefixCode = code;
        if (this.cells.cells[index].rule.type === "rule"){
            const prompt = "I have this Python script:\n"+
                code + "\n\n"+ this.cells.cells[index].code + "\n\n"+ this.cells.cells[index].rule.postfixCode + "\n\n"+
                "Can you tell me the list of files that this script reads? If it reads none, then return an empty list."+
                "Plase return it in JSON format following this schema:\n" +
                "{ 'readed_filenames': ['list of filenames for the readed files'] }";
            const formatted = await this.runPromptAndParse(prompt);
            this.cells.cells[index].rule.readFiles = formatted.readed_filenames;
        }
        return this.cells;
    }

    async buildRulesAdditionalCode(targets:number[]=[]): Promise<CellDependencyGraph>{
        function getImportStatementsFromScripts(node: Cell, cells: Cell[]): string{
            const dependencies: Set<string> = new Set();
            Object.keys(node.rule.import_dependencies).forEach((dep) => {
                dependencies.add("from " + cells[node.rule.import_dependencies[dep]].rule.name + " import " + dep);
            });
            Object.keys(node.dependsOnFunction).forEach((dep) => {
                dependencies.add("from " + cells[node.dependsOnFunction[dep]].rule.name + " import " + dep);
            });
            return Array.from(dependencies).join("\n");
        }

        if (targets.length === 0){
            targets = Array.from(this.cells.cells.keys());
        }
        for (const i of targets){
            const cell = this.cells.cells[i];
            const node = cell.rule;
            if (node.type === "script"){
                node.prefixCode = getImportStatementsFromScripts(cell, this.cells.cells);
            } else if (node.type==="rule"){
                // [variable, node]
                const ruleDependencies: [string, number][] = Object.entries(node.rule_dependencies);
                const exportsTo: [string, number[]][] = Object.entries(cell.writesTo);
                const wildcards: string[] = cell.wildcards;
                const prompt = "I have a Python script, and I need to convert it to a snakemake rule and insert it into an existing snakemake workflow.\n"+
                "The script needs additional code to read and save files, read command line arguments, and manage wildcards.\n"+
                "Consider the following dependencies that can happen between rules:\n" +
                "1- The script might need to read files, produced by other rules, to valorize some variables.\n"+
                "2- The script might need to save some variables into files, that will be readed by other scripts.\n"+
                "3- The rule might have wildcards. Wildcards in Snakemake are specified inside the name of the output file(s), for example 'output_{sample}.txt'; Snakemake then generally passes their values as command line arguments, for example python my_script.py sample. The script must read these values and initialize the correct variables.\n"+ 

                " I will provide the name of the variables to valorize from files, the name of the input files and the piece of code that produces the file that needs to be readed. \n"+
                " I will also provide the name of the output files to write and the variables to save there.\n"+
                " And I will provide the variables that need to be valorized from wildcards.\n\n"+
                " From this, please write for me three things:\n"+
                "1- A snakemake rule, with input, output and shell directives. Manage wildcards and arguments of the script. Always pass to the script arguments the names of the input files, and the wildcards.\n"+
                "2- A prefix code, that will be appended before the actual code in the script, that reads command line arguments, read files and initializes variables (from files and wildcards). Please always use the filenames provided as command line arguments for the filenames.\n"+
                "3- A suffix code, that will be appended after the script, that saves the variables to the output files.\n"+

                "\nMy script is:\n#Begin script...\n" + cell.code + "\n#End of script...\nThe Script is named: " + cell.rule.name + "\n"+
                "The variables it needs to valorize by reading files are:\n" +
                ((ruleDependencies.length===0) ? " - no variable actually needed for reading from files-\n" :
                ruleDependencies.map((d:any) => ">Variable: " + d[0] + " produced by the script " + this.cells.cells[d[1]].rule.name).join("\n") + "\n"+
                "I will provide the code that produce the files that you need.\n"+
                ruleDependencies.map((d:any) => "Code that saves variable " + d[0] + " to a file:\n#Begin code...\n" + this.cells.cells[d[1]].code + "\n" + this.cells.cells[d[1]].rule.postfixCode + "\n#End code...\n").join("\n")) + "\n"+
                "The variables that needs to be saved to files are: \n" +
                ((exportsTo.length===0) ? " - no variable actually needed for saving -\n" : exportsTo.map((entry:[string,number[]]) => "Variable: " + entry[0] + " must be saved and will be readed by the script(s) " + entry[1].map((index:number)=>this.cells.cells[index].rule.name).join(", ")).join("\n")) + "\n\n"+
                ((wildcards.length===0) ? " - no wildcard needed -" : "Wildcards: " + wildcards.join(", ") + "\n\n") +
                "When saving files, you can decide the name, format and number of files. Consider the number of scripts that will read them to make a good decision.\n" +
                "\nPlease write the output in JSON format following this schema:\n"+
                "{ 'prefix_code': string 'code to read arguments, files', 'suffix_code': string 'code to save each file', 'readed_filenames': ['list of filenames for readed files'], 'written_filenames': ['list of filenames for the saved files'], 'rule': string (snakemake rule) }\n"+
                "Please do not repeat the code already existing, only valorize the fields. If a field is empty, write an empty array or empty string, don't skip the field.";
                const formatted = await this.runPromptAndParse(prompt);
                node.prefixCode = getImportStatementsFromScripts(cell, this.cells.cells) + "\n" + formatted.prefix_code;
                node.postfixCode = formatted.suffix_code;
                node.saveFiles = formatted.written_filenames;
                node.readFiles = formatted.readed_filenames;
                node.snakemakeRule = formatted.rule;
            }
        }
        return this.cells;
    }

    changeRuleState(index: number, newState: string): CellDependencyGraph{
        this.cells.setRuleDetails(index, undefined, newState as "rule" | "script" | "undecided");
        return this.cells;
    }

    addCellWrite(cell_index: number, write: string): [CellDependencyGraph, Promise<CellDependencyGraph>]{
        if (this.cells.cells[cell_index].writes.includes(write)){
            return [this.cells, new Promise((resolve) => resolve(this.cells))];
        }
        this.cells.cells[cell_index].writes.push(write);
        //re-build graph
        this.cells.buildDependencyGraph();
        //Re-build rules graph from cell_index 
        const update = Promise.resolve(this.cells) //this.rulesGuessNameAndState(cell_index).then(()=>this.cells);
        return [this.cells, update];
    }

    addCellDependency(cell_index: number, dependency: string): [CellDependencyGraph, Promise<CellDependencyGraph>]{
        //Remove from wildcards if present
        this.cells.setWildcardAsDependency(cell_index, dependency);
        if (!this.cells.cells[cell_index].reads.includes(dependency)){
            this.cells.cells[cell_index].reads.push(dependency);
        }
        //re-build graph
        this.cells.buildDependencyGraph();
        const update = Promise.resolve(this.cells) //this.rulesGuessNameAndState(cell_index).then(()=>this.cells);
        return [this.cells, update];
    }
    removeCellDependency(cell_index: number, dependency: string): [CellDependencyGraph, Promise<CellDependencyGraph>]{
        //Remove dependency from cell
        if (!this.cells.cells[cell_index].reads.includes(dependency)){
            return [this.cells, new Promise((resolve)=>resolve(this.cells))];
        }
        this.cells.setWildcardAsDependency(cell_index, dependency);
        this.cells.cells[cell_index].reads = this.cells.cells[cell_index].reads.filter((read) => read !== dependency);
        this.cells.buildDependencyGraph();
        const update = Promise.resolve(this.cells) //this.rulesGuessNameAndState(cell_index).then(()=>this.cells);
        return [this.cells, update];
    }
    removeCellWrite(cell_index: number, write: string): [CellDependencyGraph, Promise<CellDependencyGraph>]{
        if (!this.cells.cells[cell_index].writes.includes(write)){
            return [this.cells, new Promise((resolve)=>resolve(this.cells))];
        }
        //Remove write from cell
        this.cells.cells[cell_index].writes = this.cells.cells[cell_index].writes.filter((w) => w !== write);
        //re-build graph
        this.cells.buildDependencyGraph();
        const update = Promise.resolve(this.cells) //this.rulesGuessNameAndState(cell_index).then(()=>this.cells);
        return [this.cells, update];
    }

    deleteCell(cell_index: number): [CellDependencyGraph, Promise<CellDependencyGraph>]{
        const removed = this.cells.cells.splice(cell_index, 1);
        try{
            this.cells.buildDependencyGraph();
        } catch (e: any){
            //If removing this cell breaks the dependencies, notify the user and undo the change
            this.cells.cells.splice(cell_index, 0, ...removed);
            throw e;
        }
        const update = this.rulesGuessNameAndState(cell_index).then(()=>this.cells);
        return [this.cells, update];
    }

    async splitCell(index: number, code1: string, code2: string): Promise<CellDependencyGraph>{
        if (code1.length === 0 || code2.length === 0){ return this.cells; }
        const oldCell = this.cells.cells[index];
        
        try{
            let calls = oldCell.calls;
            const cell_a: Cell = new Cell(code1, false);
            const cell_b: Cell = new Cell(code2, false);
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
            const formatted = await this.runPromptAndParse(prompt);
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
        await this.rulesGuessNameAndState(index);
        return this.cells;
    }

    mergeCells(index_a: number, index_b: number):[CellDependencyGraph, Promise<CellDependencyGraph>]{
        if (index_b < index_a){
            const temp = index_a;
            index_a = index_b;
            index_b = temp;
        }
        //What A reads, goes in new cell reads
        //What B reads, goes in new cell reads IF A does not write it
        //Rest of fields are merged between the two
        const new_cell = new Cell(
            this.cells?.cells[index_a].code + this.cells?.cells[index_b].code,
            false,
            [...new Set([
                ...this.cells?.cells[index_a].reads || [],
                ...this.cells?.cells[index_b].reads.filter(
                    (read) => !this.cells?.cells[index_a].writes.includes(read)
                ) || []
            ])],
            [...this.cells.cells[index_a].reads_file, ...this.cells.cells[index_b].reads_file],
            [...new Set([...this.cells?.cells[index_a].writes || [], ...this.cells?.cells[index_b].writes || []])],
            [...new Set([...this.cells?.cells[index_a].imports || [], ...this.cells?.cells[index_b].imports || []])],
            [],
            [...new Set([...this.cells?.cells[index_a].calls || [], ...this.cells?.cells[index_b].calls || []])],
            [],
            {},
            { ...this.cells?.cells[index_a].dependsOnFunction, ...this.cells?.cells[index_b].dependsOnFunction }
        )
        this.cells.cells.splice(index_a, 2, new_cell);
        this.cells.buildDependencyGraph();
        const update = this.rulesGuessNameAndState(index_a).then(()=>this.cells);
        return [this.cells, update];
    }

    async exportSnakefile(exportPath:any):Promise<vscode.Uri>{
        //Build the snakefile
        const logs = ExtensionSettings.instance.getSnakemakeBestPracticesSetLogFieldInSnakemakeRules();
        const rules: {"rule": string|null; "filename": string|null; "code": string|null}[] = this.cells.cells.map(cell => cell.toSnakemakeRule(30,logs));
        let snakefile = "";
        const waiting = [];
        rules.forEach((rule) => {
            if (rule.rule){
                snakefile += rule.rule + "\n\n";
            }
            if (rule.filename && rule.code){
                waiting.push(writeFile(resolve(exportPath, rule.filename), rule.code));
            }
        });
        waiting.push(writeFile(resolve(exportPath, "Snakefile"), snakefile));
        await Promise.all(waiting);
        return vscode.Uri.file(resolve(exportPath, "Snakefile"));
    }

}