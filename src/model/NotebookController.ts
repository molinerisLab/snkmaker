import { json } from 'stream/consumers';
import * as vscode from 'vscode';
import { LLM, ModelComms, ModelNotReadyError, PromptTemperature } from './ModelComms';
import { read, writeFileSync } from 'fs';
import { resolve } from 'path';
import { writeFile } from 'fs/promises';
import { ExtensionSettings } from '../utils/ExtensionSettings';
import { UndoRedoStack } from './UndoRedoStack';
const diff = require('diff');
import { assert } from "console";
import { TestRules } from '../utils/TestRules';
import { OpenedSnakefileContent, SnakefileContext } from '../utils/OpenendSnakefileContent';
const { jsonrepair } = require('jsonrepair')

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
        public wildcards: string[] = [],
    ) {}

    toCode(): string{
        return (this.rule.prefixCode.length>0 ? "#Read input files\n"+this.rule.prefixCode.trim()+"\n" : "" ) +
        (this.code.length>0 ? "#Script body:\n"+this.code.trim()+"\n" : "") +
        (this.rule.postfixCode.length>0 ? "#Write output files\n"+this.rule.postfixCode.trim() : "");
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
    config: string = "";
    currentState: number = 0;
    constructor(public cells: Cell[]){
    }

    public static fromCode(codeCells: string[][]){
        return new CellDependencyGraph(codeCells.map((cell) => new Cell(cell.join(""), false)));
    }

    public setCellDependency(index: number, reads: string[], reads_file: string[], writes: string[], imports: string[]){
        reads = reads.filter((read) => this.cells[index].imports.filter(
            (imp) => imp.indexOf(read) !== -1
        ).length === 0);
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
            for (let toRemove of importSet){
                const regex = new RegExp(`[ \\t]*\\b${toRemove}\\b\\s*[;\\n]?`, 'g')
                cell.code = cell.code.replace(regex, '');
            }
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
            let dependencyNameInCell = dependency;
            if (cell.replacedFunctionVariables.includes(dependency)){
                dependencyNameInCell = `__${dependency.toLowerCase()}__`;
            }
            fcell.declares.forEach((decl, index) => {
                if (cell.dependsOnFunction[decl] === i){
                    const regex = new RegExp(`\\b${decl}\\(((?:[^()]*|\\([^()]*\\))*)\\)`, 'g');
                    if (cell.code.match(regex)) {
                        cell.code = cell.code.replace(regex, (match, args) => {
                            const argList = args.split(',').map((arg:string) => arg.trim());
                            const filteredArgs = argList.filter(
                                (arg:string) => arg.replaceAll(" ","") !== `__${dependency.toLowerCase()}__=${dependencyNameInCell}`&&
                                    arg.replaceAll(" ","") !== `${dependencyNameInCell}=${dependencyNameInCell}`
                            );
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
        let reads = fcell.reads;

        //Check that reads are not already part of the function arguments
        //(can happen both because they are named the same or because the model put them there anyway)
        // Parse function arguments from all function definitions in the cell
        const allArgs: Set<string> = new Set();
        const functionRegex = /def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g;
        let match;
        if ((match = functionRegex.exec(fcell.code)) !== null) {
            const argList = match[2];
            const args = argList.split(',')
            .map(arg => arg.trim().split('=')[0].trim())
            .filter(arg => arg.length > 0)
            .forEach(arg => allArgs.add(arg));
        }
        reads = reads.filter(read => !allArgs.has(read));

        // Filter out reads that are already function arguments
        const uniqueArguments = [...new Set(arguments)];
        const replaced = reads
            .filter(read => !uniqueArguments.includes(read))
            .map(read => `__${read.toLowerCase()}__`);
        fcell.declares.forEach((decl, index) => {
            //Remove function name from cell writes (sometimes models put it there, but it should not)
            if (fcell.writes.includes(decl)) {
                fcell.writes = fcell.writes.filter((read) => read !== decl);
            }
            //Same for reads of cells that call this function
            for (let j=i+1; j<this.cells.length; j++){
                if (this.cells[j].reads.includes(decl)) {
                    this.cells[j].reads = this.cells[j].reads.filter(
                        (read) => read !== decl);
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
                const regex = new RegExp(`\\b${decl}\\(((?:[^()]*|\\([^()]*\\))*)\\)`, 'g');
                fcell.code = fcell.code.replace(regex, (match, p1) => {
                    return match.replace(p1, p1 + ", " + replaced.join(", "));
                });
            });
            //Find cells that call one of these functions - replace call and add dependencies
            for (let j=i+1; j<this.cells.length; j++){
                const cell = this.cells[j];
                fcell.declares.forEach((decl, index) => {
                    const regex = new RegExp(`\\b${decl}\\(((?:[^()]*|\\([^()]*\\))*)\\)`, 'g');
                    if (cell.code.match(regex)){
                        cell.calls.push(decl);
                        cell.reads.push(...reads);
                        cell.reads = [...new Set(cell.reads)];
                        const new_args = reads.map(
                            (read) => `__${read.toLowerCase()}__=${read}`
                        )
                        cell.code = cell.code.replace(regex, (match, p1) => {
                            return match.replace(p1, p1 + ", " + new_args.join(", "));
                        });
                    }
                });
            }
            fcell.replacedFunctionVariables = [...reads, ...fcell.replacedFunctionVariables];
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
        this.cells = this.cells.filter((cell) => cell.code.trim().length>1);
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
        const declared: { [key: string]: number } = {}
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
                cell.calls.forEach((call) => {
                    const target = declared[call];
                    cell.dependsOnFunction[call] = target;
                });
            }
            if (!cell.isFunctions){
                cell.writes.forEach((write) => {
                    lastChanged[index][write] = index;
                });
            } else {
                cell.declares.forEach((decl) => {
                    if (!declared[decl]){
                        declared[decl] = index;
                    }
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
        const graph = new CellDependencyGraph(cells);
        if (data.currentState){
            graph.currentState = data.currentState;
        }
        return graph
    }
}

export class NotebookController{
    cells: CellDependencyGraph = new CellDependencyGraph([]);
    undoRedoStack: UndoRedoStack; 

    filename: string | undefined = undefined;
    public path: vscode.Uri | undefined = undefined;

    constructor(private llm: LLM){
        this.undoRedoStack = new UndoRedoStack();
    }

    private parseJsonFromResponse(response: string): any{
        let start = response.indexOf("{");
        let end = response.lastIndexOf("}");
        if (start !== -1 && end !== -1){
            response = response.substring(start, end + 1);
        }
        try{
            return JSON.parse(response);
        } catch (e:any){
            try{
                console.log("Trying to repair json");
                response = jsonrepair(response);
                return JSON.parse(response);
            } catch (e:any){
                console.log(response);
                console.log("Error parsing json: ", e.message);
                throw e;
            }
        }
    }

    openFrom(path: vscode.TextDocument){
        const data = path.getText();
        this.cells = JSON_Importer.importCellDependencyGraph(data);
        this.cells.canUndo = this.undoRedoStack.undoCount>0;
        this.cells.canRedo = this.undoRedoStack.redoCount>0;
        this.filename = path.fileName;
    }

    saveAs(path: string, currentScreen: number){
        this.cells.currentState = currentScreen;
        const exported = JSON.stringify(this.cells);
        writeFileSync(path, exported);
        this.filename = path;
        return true;
    }
    save(currentScreen: number): boolean{
        this.cells.currentState = currentScreen;
        if (!this.filename){
            return false;
        }
        return this.saveAs(this.filename, currentScreen);
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

    apply_from_chat(changes:any): string{
        function arrays_diff(array_1: string[], array_2: string[], title: string){
            const a1 = new Set(array_1);
            const a2 = new Set(array_2);
            const added = [...a2].filter(x => !a1.has(x));
            const removed = [...a1].filter(x => !a2.has(x));
            if (added.length===0 && removed.length===0){
                return "";
            }
            if (added.length===0){ added.push("- ");}
            if (removed.length===0){ removed.push("- ");}
            return `#### ${title}\n\t* Added: ${added.join(", ")}\n\t* Removed: ${removed.join(", ")}\n`;
        }
        //Validate input
        for (let cell of changes){
            if (typeof cell.cell_index !== 'number' ||
            !Array.isArray(cell.wildcards) ||
            !Array.isArray(cell.writes) ||
            !Array.isArray(cell.dependencies)) {
                throw new Error("Invalid response format: One or more cell properties are missing or of incorrect type. A cell changing must have cell_index, wildcards, writes and dependencies as fields.");
            }
        }
        const diff: string[] = [];
        for (let cell of changes){
            const index = cell.cell_index;
            const target = this.cells.cells[index];
            let diff_str = `${arrays_diff(target.reads, cell.dependencies, "Reads:")}${arrays_diff(target.writes, cell.writes,"Writes:")}${arrays_diff(target.wildcards, cell.wildcards, "Wildcards:")}`;
            const oldType = target.rule.type;
            target.rule.setType(cell.state);
            if (oldType !== cell.state){
                diff_str += `#### State:\n\t* ${oldType} -> ${cell.state}\n`;
            }
            target.reads = cell.dependencies;
            target.writes = cell.writes;
            target.wildcards = cell.wildcards;
            if (target.rule.type === 'script'){
                target.wildcards.forEach((wildcard) => {
                    this.addCellDependency(index, wildcard);
                    diff_str += `#### Wildcard to dependency:\n\t* ${wildcard}\n`;
                });
            }
            if (diff_str.length>0){
                diff.push(`\n### Cell ${index}:\n`+diff_str);
            }
        }
        this.cells.buildDependencyGraph();
        return "\n\n## Performed changes:\n\n" + diff.join("") + "\n*Changes can be undo with Ctrl+Z*";
    }

    static diffCode(oldCode: string, newCode: string, title: string): string {
        const changes = diff.diffLines(oldCode, newCode);
        let lineNumber = 1;
        let worthShowing = false;
        const formatted_changes = changes.map((change:any) => {
            const currentLineNumber = change.removed ? lineNumber : lineNumber;
            if (!change.removed) {
                lineNumber += (change.value.match(/\n/g) || []).length;
            }
            worthShowing = worthShowing || ((change.added || change.removed) && change.value.trim().length>0);
            if (change.added){
                return `+ ${change.value}`;
            } else if (change.removed){
                return `- ${change.value}`;
            } else {
                return `${change.value}`;
            }
        }).join("\n");
        if (!worthShowing){
            return "";
        }
        return `\n\n\`\`\`diff\n#### Changes in ${title}:\n${formatted_changes}\n\`\`\`\n`;
    }

    apply_from_chat_second_step(changes:any, newConfig: string|undefined): string{
        //Validate input
        for (let cell of changes){
            if (typeof cell.cell_index !== 'number' ||
                typeof cell.snakemakeRule !== 'string' ||
                typeof cell.prefixCode !== 'string' ||
                typeof cell.code !== 'string' ||
                typeof cell.postfixCode !== 'string') {
                 throw new Error("Invalid response format: One or more cell properties are missing or of incorrect type");
            }
        }

        const diffs: string[] = []
        if (newConfig){
            diffs.push(
                `### config.yaml:\n`,
                NotebookController.diffCode(this.cells.config, newConfig, `config`)
            );
            this.cells.config = newConfig;
        }
        for (let cell of changes){
            const index = cell.cell_index;
            const target = this.cells.cells[index];
            cell.prefixCode = cell.prefixCode.trim().replace("#Start prefix code...\n", "").replace("#End prefix code...", "");
            cell.postfixCode = cell.postfixCode.trim().replace("#Start postfix code...\n", "").replace("#End postfix code...", "");
            cell.snakemakeRule = cell.snakemakeRule.trim().replace("#Rule...\n", "").replace("#End rule...", "");
            cell.code = cell.code.trim().replace("#Start code...\n", "").replace("#End code...", "");

            diffs.push(
                `### Cell ${index}:\n`,
                NotebookController.diffCode(target.rule.snakemakeRule, cell.snakemakeRule, `Cell ${index} - Snakefile`),
                NotebookController.diffCode(target.rule.prefixCode, cell.prefixCode, `Cell ${index} - Prefix code`),
                NotebookController.diffCode(target.code, cell.code, `Cell ${index} - Main code`),
                NotebookController.diffCode(target.rule.postfixCode, cell.postfixCode, `Cell ${index} - Suffix code`)
            );
            target.rule.prefixCode = cell.prefixCode;
            target.rule.postfixCode = cell.postfixCode;
            target.rule.snakemakeRule = cell.snakemakeRule;
            target.code = cell.code;
        }
        return "\n\n## Performed changes:\n\n" + diffs.join("") + "\n\n*Changes can be undo with Ctrl+Z*";
    }


    private async runPromptAndParse(original_prompt: string, t: PromptTemperature,
        validate_function: ((response: any) => string|null)|undefined=undefined): Promise<any> {
        let prompt = original_prompt;
        let response = "";
        for (let i=0; i<5; i++){
            try{
                response = await this.llm.runQuery(prompt, t);
                const parsed = this.parseJsonFromResponse(response);
                if (validate_function){
                    const validationError = validate_function(parsed);
                    if (validationError) {
                        throw new Error(validationError);
                    }
                }
                return parsed;
            } catch (e:any){
                if (e instanceof ModelNotReadyError){
                    vscode.window.showErrorMessage("Snakemaker: No LLM currently selected. Please select one in the model section.");
                    return undefined;
                }
                console.log(prompt);
                console.log(response);
                prompt = "I asked you this:\n\n" + original_prompt + 
                "\n\nAnd your response was: \n" + response +
                "\n\nBut when trying to parse your response in json I got this error: \n" + e.message +
                "\n\nPlease try again. Remember your response is parsed by a script, "+
                "so it must be in the correct format. Do not write an example json before the real one or the parser will fail.";
            }
        }
    }

    //Opens notebook, create cell graph with read/write dependencies, parse imports and functions.
    async openNotebook(notebookPath: vscode.Uri): Promise<CellDependencyGraph>{
        this.path = notebookPath;
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
        if (this.cells.cells.filter((cell) => cell.missingDependencies.length>0).length > 0){
            await this.tryFixIssues();
        }
        return this.cells;
    }

    async makeRulesGraph(): Promise<CellDependencyGraph>{
        await this.rulesGuessNameAndState();
        return this.cells;
    }

    private async tryFixIssues(){
        const tabuList: Set<string> = new Set();
        for (let i=0; i<this.cells.cells.length; i++){
            const cell = this.cells.cells[i];
            if (cell.missingDependencies.length === 0){
                continue;
            }
            //Fix hallucinated dependencies
            const prompt = "I have the following piece of python code:\n" + cell.code +
            "\nThis code belongs to a larger file. A first analysis performed by an LLM has determined the variables that this piece of code reads from "+
            "the external context - meaning the code can read these variables before it writes them, so they must be written "+
            "by some other piece of code before it.\n"+
            "Between these variables there are some that you need to check again, to ensure it's correct to "+
            "consider them external dependencies. The variables are:\n" +
            cell.missingDependencies.join(", ") +
            "\nRemember, a variable is an external dependencies if all these conditions are met:\n"+
            "1-The code accesses the content of the variable.\n"+
            "2-The code does not define or modify the variable before accessing it.\n"+
            "In other words, the code raises an exception because it tries to read an undefined variable.\n"+
            "For each of these variable, determine if they are an external dependency or not.\n"+
            "Return a JSON object with the following schema:\n"+
            "{ \"variables\": [ {\"name\": <string>, \"is_external\": <boolean>} ] }"+
            "If a variable is not external, you need to include it in the response anyway and set is_external to false.\n"+
            "You can add reasonings to your response, but the only { and } in your response must belong to the JSON,"+
            " or the parser will break. So use the curly braces only to delimit the JSON object.";
            const response = await this.llm.runQuery(prompt, PromptTemperature.RULE_OUTPUT);
            try{
                const parsed = this.parseJsonFromResponse(response);
                if (parsed.variables && Array.isArray(parsed.variables)){
                    parsed.variables.forEach((varObj:any) => {
                            if (varObj.is_external === false){
                                this.removeCellDependency(i, varObj.name);
                            }
                        }
                    );
                }
            } catch (e:any){
                console.log("Error parsing response: ", e.message);
            }
            if (cell.missingDependencies.length === 0){
                continue;
            }
            //Fix missing dependencies
            const dep = cell.missingDependencies.filter((dep) => !tabuList.has(dep));
            const prompt2 = "I have the following list of pieces of python code:\n\n" +
            this.cells.cells.map((cell, index) => {
                return "Piece n. " + index + "\nCode:\n" + cell.code;
            }).join("\n\n") +
            "\n\nAnd I have the following set of variables that I am interested in checking:\n" +
            dep.join(", ") +
            "\n\nFor each of these variables, I need you to tell me if they are defined or written or modified in some "+
            "of the pieces of code I gave you. I am interested only in pieces that writes or define the variable, not in those that read it."+
            "\n\nPlease return a JSON object with the following schema:\n"+
            "{variables: [ {\"name\": <string>, \"pieces\": [<number>, <number>, ...] } ] }"+
            "\nWhere pieces is the list of pieces of code that define or write the variable. If a variable is not defined or written in any piece of code, it's an empty list.\n"+
            "You can add reasonings to your response, but the only { and } in your response must belong to the JSON,"+
            " or the parser will break. So use the curly braces only to delimit the JSON object.";
            const response2 = await this.llm.runQuery(prompt2, PromptTemperature.RULE_OUTPUT);
            try{
                const parsed2 = this.parseJsonFromResponse(response2);
                if (parsed2.variables && Array.isArray(parsed2.variables)){
                    parsed2.variables.forEach(
                        (varObj:any) => {
                            varObj.pieces.forEach((pieceIndex: number) => {
                                this.addCellWrite(pieceIndex, varObj.name);
                            });
                        }
                    )
                }
                cell.missingDependencies.forEach((dep) => {
                    tabuList.add(dep);
                });
            } catch (e:any){
                console.log("Error parsing response: ", e.message);
            }
        }
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
        (changeFrom===0 ? "Please provide at least a name for every cell, even if you don't want to change the state and even if it's a script." : 
            "You can change the state of the cells from " + changeFrom + " onward. For those, please provide at least a name for every cell, even if you don't want to change the state.");
        
        const validate = (response: any) => {
            if (!response.rules || !Array.isArray(response.rules)) {
                return "Invalid response format: 'rules' is missing or not an array";
            }
            for (let rule of response.rules){
                if (typeof rule.cell_index !== 'number'){
                    return "Invalid response format: 'cell_index' is not a number";
                }
                if (!rule.type || !["rule", "script", "undecided"].includes(rule.type)) {
                    return "Invalid response format: Rule type missing or not in ['rule', 'script', 'undecided']";
                }
                if (!rule.rule_name || typeof rule.rule_name !== 'string') {
                    return "Invalid response format: Rule name missing";
                }
            }
            return null;
        }
        const formatted = await this.runPromptAndParse(prompt, PromptTemperature.MEDIUM_DETERMINISTIC, validate);
        if (formatted){
            this.cells.setRulesTypesAndNames(formatted, changeFrom);
        }
    }

    private async setDependenciesForCells(){
        const BATCH_SIZE = 12;
        for (let i=0; i<this.cells.cells.length; i+=BATCH_SIZE){
            const batch = this.cells.cells.slice(i, i+BATCH_SIZE);
            let prompt = "I have a jupyter notebook that is being processed into a snakemake pipeline. This process involves " +
            "decomposition of the notebook into smaller pieces of python code, and linking them together in a snakemake pipeline.\n" +
            "The main issue is managing the state. Jupyter notebooks have a global state. I can define or modify a variable in a cell, and refer to this variable in another. "+
            "After the decomposition, every cell will be executed indipendently, so I must manage the dependencies between the cells.\n"+
            "In this step I'm interested in data dependencies, so variables that are defined, modified or readed by the code inside the cells.\n"+
            +"\nFor each cell, consider the code and find the set of variables that the code WRITES (either define for the first time or modify) and READS from other cells. " +
            
            "-The READS variables are not all the variables readed, but only those readed from other cells' code. "+
            "In other words, given each cell, imagine to run its code independently. What variables will raise an exception because the code tries to read them without "+
            "having defined them? These are the only variables that go in READS."+
            "Example:\nMY_VAR=3#MY_VAR is written here\n#some code..\nprint(MY_VAR) #=> MY_VAR is readed from the same cell - the READS list is empty."+
            "\nExample:\ndef func(MY_VAR):\n\tprint(MY_VAR) #=> MY_VAR is readed from the function arguments - the READS list is empty."+
            "\nExample with lambda function:\nlambda MY_VAR: MY_VAR+1 #=> MY_VAR is readed from the lambda function argument - the READS list is empty."+
            "\nExample with undecidable case:\nif (condition):\n\tMY_VAR=1\nprint(MY_VAR) #=> Here MY_VAR could be written in the cell depending on 'condition', "+
            "but if 'condition' is false then it is readed from somewhere else. You cannot know the value of 'condition' from static analysis so the READS list contains MY_VAR.\n"+
            "Also, modules or things that are already in the cell 'import' statements do not go in the READ list.\n" +
            "Regarding the WRITES list, operations that modify mutable objects, as appending to a list, count as WRITE operations. " +
            "As I'm interested only in data dependencies, if the cell defines a function, the name of the function that is defined do not go in the WRITES list for now. \n" +
            "Consider the following notebook cells (note: what you see is only a subsets of cells):\n\n" +
            batch.map((cell, index) => "Cell index. " + (index+i) + "\nCode:\n" + cell.code + "\nThese are imports, the imported things do not go in the READS list: " + cell.imports.join(" - ")).join("\n\n") + "\n\n" +
            "Please provide to me the list of READED variables, WRITTEN variables and READED file for each cell. For each variable use the same name used in the code without changing it.\n"+
            "\n\nPlease write the output in JSON format (remember: JSON doesn't support the triple quote syntax for strings!) following this schema:\n"+
            `{ "cells": [ {"cell_index": <number>, "reads": [<strings>], "writes": [<indexes>], "reads_file": [<indexes>]}  for each rule... ] }`;
            
            const validate = (response: any) => {
                if (!response.cells || !Array.isArray(response.cells)) {
                    return "Invalid response format: 'cells' is missing or not an array";
                }
                for (let cell of response.cells){
                    if (typeof cell.cell_index !== 'number' ||
                    !Array.isArray(cell.reads) ||
                    !Array.isArray(cell.writes) ||
                    !Array.isArray(cell.reads_file)) {
                        return "Invalid response format: One or more cell properties are missing or of incorrect type";
                    }
                }
                return null;
            }
            const formatted = await this.runPromptAndParse(prompt, PromptTemperature.DAG_GEN, validate);
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
        "Please write the output in JSON format (remember: JSON doesn't support the triple quote syntax for strings!) following this schema:\n"+
        "{'cells': [cell_index: number, imports: [index of import for each import needed]]}";
        const validate = (response: any) => {
            if (!response.cells || !Array.isArray(response.cells)) {
                return "Invalid response format: 'cells' is missing or not an array";
            }
            for (let cell of response.cells){
                if (typeof cell.cell_index !== 'number' || !Array.isArray(cell.imports)) {
                    return "Invalid response format: One or more cell properties are missing or of incorrect type";
                }
            }
            return null;
        }
        const formatted = await this.runPromptAndParse(prompt, PromptTemperature.GREEDY_DECODING, validate);
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
        const cell = this.cells.cells[index];
        const prompt = `I have a snakemake rule calling a python script. The script can be divided into prefix code, main code and suffix code.\n`+
        `Snakemake rule:\n#Rule...\n${cell.rule.snakemakeRule}\n#End rule...\nPrefix code:\n#Start prefix code...\n${cell.rule.prefixCode}\n#End prefix code...\n` +
        `Main code:\n#Start code...\n${cell.code}\n#End code...\n` +
        `Suffix code:\n#Start Suffix code...\n${cell.rule.postfixCode}\n#End Suffix code...\n` +
        `Cell uses wildcards: ${cell.wildcards.join(",")}\n\n` + 
        `Now the user changed the suffix code. The new suffix code is:\n#Start suffix code...\n${code}\n#End suffix code...\n` +
        `Please provide the new snakemake rule considering this updated prefix code.\n` +
        `Please write the output in JSON format (remember: JSON doesn't support the triple quote syntax for strings!) following this schema: { 'snakemakeRule': string }\n`+
        "Please always output this JSON. If the rule does not need changing, output the same rule as before.";
        const formatted = await this.runPromptAndParse(prompt, PromptTemperature.RULE_OUTPUT);
        this.cells.cells[index].rule.snakemakeRule = formatted.snakemakeRule;
        this.cells.cells[index].rule.postfixCode = code;
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

    async updateSnakemakeRule(index: number, code: string){
        const cell = this.cells.cells[index];
        if (this.cells.cells[index].rule.type === "rule"){
            const prompt = `I have a snakemake rule calling a python script. The script can be divided into prefix code, main code and suffix code.\n`+
            `Snakemake rule:\n#Rule...\n${cell.rule.snakemakeRule}\n#End rule...\nPrefix code:\n#Start prefix code...\n${cell.rule.prefixCode}\n#End prefix code...\n` +
            `Main code:\n#Start code...\n${cell.code}\n#End code...\n` +
            `Suffix code:\n#Start Suffix code...\n${cell.rule.postfixCode}\n#End Suffix code...\n` +
            `Cell uses wildcards: ${cell.wildcards.join(",")}\n\n` + 
            `Now the user changed the Snakemake rule code. The new Snakemake rule is:\n${code}\n` +
            `Please provide the new prefix and suffix code based on the new snakemake rule. You can not change main code.\n` +
            `Please write the output in JSON format (remember: JSON doesn't support the triple quote syntax for strings!) following this schema: { 'prefix_code': string, 'suffix_code': string }\n`+
            "Please always output this JSON. If the code do not need changing, output the same code as before.";
            const formatted = await this.runPromptAndParse(prompt, PromptTemperature.RULE_OUTPUT);
            this.cells.cells[index].rule.snakemakeRule = code;
            this.cells.cells[index].rule.prefixCode = formatted.prefix_code;
            this.cells.cells[index].rule.postfixCode = formatted.suffix_code;
        }
        return this.cells;
    }

    async updateRulePrefix(index: number, code: string){
        const cell = this.cells.cells[index];
        if (this.cells.cells[index].rule.type === "rule"){
            const prompt = `I have a snakemake rule calling a python script. The script can be divided into prefix code, main code and suffix code.\n`+
            `Snakemake rule:\n#Rule...\n${cell.rule.snakemakeRule}\n#End rule...\nPrefix code:\n#Start prefix code...\n${cell.rule.prefixCode}\n#End prefix code...\n` +
            `Main code:\n#Start code...\n${cell.code}\n#End code...\n` +
            `Suffix code:\n#Start Suffix code...\n${cell.rule.postfixCode}\n#End Suffix code...\n` +
            `Cell uses wildcards: ${cell.wildcards.join(",")}\n\n` + 
            `Now the user changed the prefix code. The new prefix code is:\n#Start prefix code...\n${code}\n#End prefix code...\n` +
            `Please provide the new snakemake rule considering this updated prefix code.\n` +
            `Please write the output in JSON format (remember: JSON doesn't support the triple quote syntax for strings!) following this schema: { 'snakemakeRule': string }\n`+
            "Please always output this JSON. If the rule does not need changing, output the same rule as before.";
            const formatted = await this.runPromptAndParse(prompt, PromptTemperature.RULE_OUTPUT);
            this.cells.cells[index].rule.snakemakeRule = formatted.snakemakeRule;
            this.cells.cells[index].rule.prefixCode = code;
        } else {
            this.cells.cells[index].rule.prefixCode = code;
        }
        return this.cells;
    }

    async finalizeRulesCodeAndCreateConfig(){
        const prompt = "I have a jupyter notebook that is being processed into a snakemake pipeline. "+
        "The process is almost completed. Cells have been divided into rules (called from the Snakefile) and scripts "+
        "(used with imports). The Snakefile has been written, and pieces of code have been enriched with " +
        "prefix and suffix code to manage input and output files, wildcards and other dependencies.\n" +
        "Note that every cell has a 'Main code' which contains the main logic. " +
        "Cells might also have prefix code (manages inputs) and suffix (manages output).\n"+
        "The last step is to finalize the code and the Snakefile and manage the config file.\n" +
        "Your goals are:\n" +
        "1- Read the code and the Snakefile, if you find errors fix them.\n" + 
        "2- If you find some repeating patterns, or some hardcoded data that would be better as a configuration, " + 
        "add it to the configuration. \nAdding to a configuration involves both defining the config.yaml and "+
        "changing the code to access it. Remember, from the python scripts you can access the " +
        "configuration with snakemake.config['variable_name'].\n" +
        "Also remember only rules can access the snakemake access. Scripts can not.\n" +
        "This is the code of the cells:\n" +
        this.cells.cells.map((cell, index) => {
            let base = `Cell n. ${index}:\nType: ${cell.rule.type}\n`;
            if (cell.rule.type === "rule"){
                base += `Cell's Snakemake rule:\n ${cell.rule.snakemakeRule}\n`+
                `Cell's Prefix code:\n${cell.rule.prefixCode}\n`+
                `Cell's Main code:\n${cell.code}\n`+
                `Cell's Suffix code:\n${cell.rule.postfixCode}\n`;
            } else {
                base += `Cell's Prefix code:\n${cell.rule.prefixCode}\n`
                base += `Cell's Main Code:\n${cell.code}\n`;
            }
            return base;
        }) +
        `\nPlease answer this prompt with a JSON that follows this schema:\n`+
        `{ 'config': string (the config file), cells: [{cell_index: number, prefix_code: string, main_code: string, postfix_code: string, snakemake_rule: string}] }\n`+
        `You DO NOT have to put all the cells and all the fields in the 'cell' objects, only what you want to change.\n`+
        `For example if you want only to modify cell N and only its postfix_code field, just return one object with cell_index: N and postfix_code: new_code\n`+
        "Also, you can not change the type of a cell (from rule to script or vice versa) and you can only change fields that "+
        "exist already, you can not add new fields.\n";
        const validate = (response: any) => {
            if (!response['config']){
                return "Missing field config";
            }
            if (typeof response['config'] !== 'string') {
                return "Invalid response format: 'config' must be a string";
            }
            if (response['cells'] && !Array.isArray(response['cells'])) {
                return "Invalid response format: 'cells' must be an array";
            }
            return null;
        }
        const formatted = await this.runPromptAndParse(prompt, PromptTemperature.RULE_OUTPUT, validate);
        if (formatted.config){
            this.cells.config = formatted.config;
        }
        if (formatted.cells){
            formatted.cells.forEach((cell: any) => {
                if (cell.cell_index && cell.cell_index < this.cells.cells.length){
                    if (cell.snakemake_rule){
                        this.cells.cells[cell.cell_index].rule.snakemakeRule = cell.snakemake_rule;
                    }
                    if (cell.prefix_code){
                        this.cells.cells[cell.cell_index].rule.prefixCode = cell.prefix_code;
                    }
                    if (cell.postfix_code){
                        this.cells.cells[cell.cell_index].rule.postfixCode = cell.postfix_code;
                    }
                    if (cell.main_code){
                        this.cells.cells[cell.cell_index].code = cell.main_code;
                    }
                }
            });
        }        
    }

    async configUpdatedByUser(newConfig: string){
        const oldConfig = this.cells.config;
        const prompt = "I have a jupyter notebook that is being processed into a snakemake pipeline. "+
        "The process is almost completed. Cells have been divided into rules (called from the Snakefile) and scripts "+
        "(used with imports). The Snakefile has been written, and pieces of code have been enriched with " +
        "prefix and suffix code to manage input and output files, wildcards and other dependencies. " +
        "Finally, a config.yaml file has been defined.\n" +
        "Now the user has just manually updated the config file and you might need to update something " +
        "in the code or in the snakefile.\n" +
        "This was the old config.yaml:\n" + oldConfig + "\n" +
        "This is the new config.yaml:\n" + newConfig + "\n" +
        "This is the code of the cells:\n" +
        this.cells.cells.map((cell, index) => {
            let base = `Cell n. ${index}:\nType: ${cell.rule.type}\n`;
            if (cell.rule.type === "rule"){
                base += `Snakemake rule:\n ${cell.rule.snakemakeRule}\n`+
                `Prefix code:\n${cell.rule.prefixCode}\n`+
                `Main code:\n${cell.code}\n`+
                `Suffix code:\n${cell.rule.postfixCode}\n`;
            } else {
                base += `Prefix code:\n${cell.rule.prefixCode}\n`
                base += `Code:\n${cell.code}\n`;
            }
            return base;
        }) +
        "Please provide the changes needed. Do not perform changes that are not required by the new config.\n"+
        "Remember, from the python scripts you can access the " +
        "configuration with snakemake.config['variable_name'].\n" +
        "Also remember only rules can access the snakemake access. Scripts can not.\n" +
        `\nPlease answer this prompt with a JSON that follows this schema:\n`+
        `{ 'config': string (the config file), cells: {cell_index: number, prefix_code: string, postfix_code: string, snakemake_rule: string, code: string } }\n`+
        `You DO NOT have to put all the cells and all the fields in the 'cell' objects, only what you want to change.\n`+
        `For example if you want only to modify cell N and only its postfix_code field, just return one object with cell_index: N and postfix_code: new_code\n`+
        "Also, you can not change the type of a cell (from rule to script or vice versa) and you can only change fields that "+
        "exist already, you can not add new fields.\n";
        const validate = (response: any) => {
            if (response.cells && !Array.isArray(response.cells)) {
                return "Invalid response format: 'cells' must be an array";
            }
            return null;
        }
        const formatted = await this.runPromptAndParse(prompt, PromptTemperature.RULE_OUTPUT, validate);
        this.cells.config = newConfig;
        if (formatted.cells){
            formatted.cells.forEach((cell: any) => {
                if (cell.cell_index && cell.cell_index < this.cells.cells.length){
                    if (cell.snakemake_rule){
                        this.cells.cells[cell.cell_index].rule.snakemakeRule = cell.snakemake_rule;
                    }
                    if (cell.prefix_code){
                        this.cells.cells[cell.cell_index].rule.prefixCode = cell.prefix_code;
                    }
                    if (cell.postfix_code){
                        this.cells.cells[cell.cell_index].rule.postfixCode = cell.postfix_code;
                    }
                    if (cell.code){
                        this.cells.cells[cell.cell_index].code = cell.code;
                    }
                }
            });
        }        

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
                "1- A snakemake rule, with input, output, logs and script directives. "+
                "As the python scripts are run inside the 'script' directive of Snakemake, they have access to "+
                "input and output filenames, wildcards, config and params. The script can read them as: "+
                "snakemake.input[0], [1].. snakemake.output[0], [1] .. snakemake.wildcards['wildcard_name']  (for example, from filename test_run_{N} you can access snakemake.wildcards['N'])\n"+
                "Important: If a directive of the Snakemake rule is empty, for example because the script has no inputs or outputs, skip the directive entirely. "+
                "It is legit to define a rule without the input directive, while it's not legit to define the directive and leave it empty.\n"+
                "Important: the script directive must use the three-quotes syntax: \"\"\", and it simply states the path to the script to call. Example:\n"+
                "script:\n\t\"\"\"my_script.py\"\"\"\n"+
                "Important: if the rule contains wildcards, all of them must appear in all the directives: input, output and log (except if a directive is missing).\n"+
                "2- A prefix code, that will be appended before the actual code in the script, that reads snakemake data, initialize variables, read files. Please always use the snakemake.input, snakemake.wildcards etc to initialize variables and filenames.\n"+
                "3- A suffix code, that will be appended after the script, that saves the variables to the output files. Use snakemake.output for the filenames.\n"+

                "\nMy script is:\n#Begin script...\n" + cell.code + "\n#End of script...\nThe Script is named: " + cell.rule.name + "\n"+
                "The variables it needs to valorize by reading files are:\n" +
                (
                    (ruleDependencies.length===0) ? " - no variable needed for reading from files. This script reads no files.-\n" :
                    ruleDependencies.map((d:any) => 
                        ">Variable: " + d[0] + " produced by the script " + this.cells.cells[d[1]].rule.name
                    ).join("\n") + "\n"+
                    "I will provide the code that produce the files that you need.\n"+
                    ruleDependencies.map(
                        (d:any) => "Code that saves variable " + d[0] + " to a file:\n#Begin code...\n" + this.cells.cells[d[1]].code + "\n" + this.cells.cells[d[1]].rule.postfixCode + "\n#End code...\n"
                    ).join("\n") +
                    
                "IMPORTANT: some variables in the code will be valorized with import statement, it is NOT your responsability manage them. You add code ONLY to read files for the variables you are provided with above. You DO NOT add code for other variables.\n"
                ) + "\n"+
                "The variables that needs to be saved to files are: \n" +
                ((exportsTo.length===0) ? " - no variable actually needed for saving -\n" : exportsTo.map((entry:[string,number[]]) => "Variable: " + entry[0] + " must be saved and will be readed by the script(s) " + entry[1].map((index:number)=>this.cells.cells[index].rule.name).join(", ")).join("\n")) + "\n\n"+
                ((wildcards.length===0) ? " - no wildcard needed -" : "Wildcards: " + wildcards.join(", ") + "\n\n") +
                ((this.cells.config.length>0) ? `This is the config file of the Snakemake pipeline:\n${this.cells.config}\n\n` : '') +
                "When saving files, you can decide the name, format and number of files. Consider the number of scripts that will read them to make a good decision.\n" +
                "\nPlease write the output in JSON format (remember: JSON doesn't support the triple quote syntax for strings!) following this schema:\n"+
                "{ 'prefix_code': string 'code to read arguments, files', 'suffix_code': string 'code to save each file', 'rule': string (snakemake rule) }\n"+
                "Please do not repeat the code already existing, only valorize the fields. If a field is empty, write an empty array or empty string, don't skip the field.\n"
                const formatted = await this.runPromptAndParse(prompt, PromptTemperature.RULE_OUTPUT);
                node.prefixCode = getImportStatementsFromScripts(cell, this.cells.cells) + "\n" + formatted.prefix_code.trim().replace("#Begin prefix code...\n", "").replace("#End prefix code...", "");
                node.postfixCode = formatted.suffix_code.trim().replace("#Start Suffix code...\n", "").replace("#End Suffix code...", "");
                node.snakemakeRule = formatted.rule.trim().replace("#Rule...\n", "").replace("#End rule...", "");
            }
        }
        await this.finalizeRulesCodeAndCreateConfig();
        return this.cells;
    }

    changeRuleState(index: number, newState: string): CellDependencyGraph{
        this.cells.setRuleDetails(index, undefined, newState as "rule" | "script" | "undecided");
        if (newState === 'script'){
            this.cells.cells[index].wildcards.forEach((wildcard) => {
                this.addCellDependency(index, wildcard);
            });
        }
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
            "\n\nPlease write the output in JSON format (remember: JSON doesn't support the triple quote syntax for strings!) following this schema:\n"+
            `{ "cells": [ {"cell_index": <number>, "reads": [<strings>], "writes": [<indexes>], "reads_file": [<indexes>]}  for each rule... ] }`;
            const formatted = await this.runPromptAndParse(prompt, PromptTemperature.RULE_OUTPUT);
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

    async testRulesBeforeExporting(snakefile: string, config: string){
        const validator = new TestRules();
        const success = await validator.testSnakemakePath();
        if (!success){
            return {rules: snakefile, config: config};
        }
        for (let i=0; i<3; i++){
            const c = new SnakefileContext(
                null, snakefile, "", [], [], [], [], "", "", config, null, []
            );
            const result = await validator.validateRules(c);
            if (result.success){
                break;
            }
            const prompt = `I have this snakefile:\n\n${snakefile}\n\n`+
            (config.length > 0 ? `And this config file:\n\n${config}\n\n` : "") +
            `The rules are not valid. The error is:\n\n${result.message}\n\n`+
            `Please fix this error.\n`+
            `Please write the output in JSON format (remember: JSON doesn't support the triple quote syntax for strings) following this schema:\n`+
            (config.length > 0 ? `{ 'rules': string, 'config': string } (corresponding to the new snakefile rules and the new config)` : "{ 'rules': string}");
            const validate_function = (response: any) => {
                if (!response.rules || typeof response.rules !== 'string') {
                    return "Invalid response format: 'rules' must be a string";
                }
                return null;
            }
            let formatted = await this.runPromptAndParse(prompt, PromptTemperature.RULE_OUTPUT, validate_function);
            snakefile = formatted.rules.trim();
            if (formatted.config){
                config = formatted.config.trim();
            }
        }
        return {rules: snakefile, config: config};
    }

    async testPythonScriptsBeforeExporting(scripts: {'script': string, 'name': string}[]){
        const validator = new TestRules();
        const success = await validator.testPythonPath();
        if (!success){
            return scripts;
        }
        for (let i=0; i<scripts.length; i++){
            for (let j=0; j<3; j++){
                const script = scripts[i];
                const result = await validator.testPythonScript(script.script);
                if (result.success){
                    break;
                }
                const prompt = `I have this python script:\n\n${script.script}\n\n`+
                `The script is not valid. The error is:\n\n${result.message}\n\n`+
                `Please fix this error.\n`+
                `Please write the output in JSON format (remember: JSON doesn't support the triple quote syntax for strings) following this schema:\n`+
                `{ 'script': string } (corresponding to the new python script)`;
                const validate_function = (response: any) => {
                    if (!response.script || typeof response.script !== 'string') {
                        return "Invalid response format: 'script' must be a string";
                    }
                    return null;
                }
                let formatted = await this.runPromptAndParse(prompt, PromptTemperature.RULE_OUTPUT, validate_function);
                scripts[i].script = formatted.script.trim();
            }
        }
        return scripts;
    }

    async exportSnakefile(exportPath:any):Promise<vscode.Uri>{
        //Build the snakefile
        const logs = ExtensionSettings.instance.getSnakemakeBestPracticesSetLogFieldInSnakemakeRules();
        const rules: {"rule": string|null; "filename": string|null; "code": string|null}[] = this.cells.cells.map(cell => cell.toSnakemakeRule(30,logs));
        let snakefile = "";
        const waiting = [];
        let config = this.cells.config;
        if (config.length > 0){
            snakefile = "configfile: \"config.yaml\"\n\n";
        }
        let scripts: {'script': string, 'name': string}[] = [];
        rules.forEach((rule) => {
            if (rule.rule){
                snakefile += rule.rule + "\n\n";
            }
            if (rule.filename && rule.code){
                scripts.push({script: rule.code, name: rule.filename});
            }
        });
        //Test rules
        if (ExtensionSettings.instance.getValidateSnakemakeRules()){
            const result: {'rules': string, config: string} = await this.testRulesBeforeExporting(
                snakefile,
                config
            );
            snakefile = result.rules;
            config = result.config;
            scripts = await this.testPythonScriptsBeforeExporting(scripts);
        }
        scripts.forEach((script => waiting.push(writeFile(resolve(exportPath, script.name), script.script))));

        if (config.length > 0){
            waiting.push(writeFile(resolve(exportPath, "config.yaml"), config));
        }
        waiting.push(writeFile(resolve(exportPath, "Snakefile"), snakefile));
        await Promise.all(waiting);
        this.saveAs(exportPath + "/export_notebook.snkmk", 1);
        return vscode.Uri.file(resolve(exportPath, "Snakefile"));
    }

}