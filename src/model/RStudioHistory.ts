import * as vscode from 'vscode';
import { SnakefileContext } from '../utils/OpenendSnakefileContent';
import { LLM } from './ModelComms';
import { Queries } from './Queries';


interface RCommand {
    command: string;
}

export class RStudioHistory {
    archive: RCommand[] = [];
    history: RCommand[] = [];
    path: string|null = null;
    pathToSnakefile: string|null = null;

    constructor(path: string|null = null, pathToSnakefile: string|null = null) {
        this.pathToSnakefile = pathToSnakefile;
        this.history = [];
        this.archive = [];
        this.path = path;
    }

    saveIfFirstTime(): void {
        if (!this.path && this.pathToSnakefile) {
            const dir = this.pathToSnakefile.slice(0, this.pathToSnakefile.lastIndexOf('/'));
            this.path = dir + '/.rsnkmaker';
            this.toJSON();
        }
    }

    private addCommands(commands: string[]): void {
        this.history = commands.map(cmd => {return { command: cmd }});
    }

    getHistory(): RCommand[] {
        return this.history;
    }


    toJSON(): void {
        if (this.path) {
            const json = JSON.stringify(
                {
                    archive: this.archive,
                    history: this.history
                },
                null, 2 // Pretty print with 2 spaces
            );
            const fs = require('fs');
            fs.writeFileSync(this.path, json, 'utf8');
        }
    }

    static fromJSON(jsonPath: string|null, snakemakePath:string|null=null): RStudioHistory {
        if (!jsonPath) {
            const h = new RStudioHistory();
            h.pathToSnakefile = snakemakePath;
            return h;
        }
        const fs = require('fs');
        const json = fs.readFileSync(jsonPath, 'utf8');
        if (!json) {
            return new RStudioHistory(jsonPath);
        }
        const instance = new RStudioHistory();
        const parsed = JSON.parse(json);
        
        instance.archive = parsed.archive || [];
        instance.history = parsed.history || [];

        instance.path = jsonPath;
        instance.pathToSnakefile = snakemakePath;
        return instance;
    }

    async exportCommands(commands: string[], llm: LLM): Promise<SnakefileContext> {
        this.addCommands(commands);
        const queries = new Queries(llm);
        const context = await queries.getRulesFromRHistory(this);

        this.archive = this.archive.concat(this.history);
        this.history = [];
        this.toJSON();
        return context;
    }
}


export class RStudioController{

    async getHistoryOfProject(): Promise<RStudioHistory> {
        const checkRProject = (filename: string): string|null => {
            if (!filename) {
                return null;
            }
            const fs = require('fs');
            const path = require('path');
            const dir = path.dirname(filename);
            const files = fs.readdirSync(dir);
            if (files.some((f: string) => f === '.rsnkmaker')) {
                return dir+ '/.rsnkmaker';
            }
            return null;
        }

        // Look for a Snakefile in the workspace, look for a .rsnkmaker file in the workspace.
        let openedEditor = vscode.window.activeTextEditor;
        let foundSnakefile = null;
        if (vscode.window.activeTextEditor){
            if (vscode.window.activeTextEditor.document.fileName.toLowerCase().endsWith('snakefile')){
                const path = checkRProject(vscode.window.activeTextEditor.document.fileName);
                foundSnakefile = vscode.window.activeTextEditor;
                if (path){
                    return RStudioHistory.fromJSON(path, vscode.window.activeTextEditor.document.fileName);
                }
            }
            const content = vscode.window.activeTextEditor.document.getText();
            if (/rule\s+[a-zA-Z0-9_]+\s*:/.test(content)) {
                // This is likely a Snakefile
                foundSnakefile = vscode.window.activeTextEditor;
                const path = checkRProject(vscode.window.activeTextEditor.document.fileName);
                if (path){
                    return RStudioHistory.fromJSON(path, vscode.window.activeTextEditor.document.fileName);
                }
            }
        }
        const allTabs = vscode.window.tabGroups.all;
        for (let i=0; i<allTabs.length; i++){
            const tabGroup = allTabs[i];
            const tabs = tabGroup.tabs;
            for (let j=0; j<tabs.length; j++){
                const tab = tabs[j];
                await vscode.window.showTextDocument(tab.input as vscode.TextDocument);
                const docname = vscode.window.activeTextEditor?.document.fileName;
                if (docname && docname.toLowerCase().endsWith('snakefile')){
                    foundSnakefile = vscode.window.activeTextEditor;
                    const path = checkRProject(docname);
                    if (path){
                        return RStudioHistory.fromJSON(path, docname);
                    }
                }
            }
        }
        //Go back to previous editor, if any
        if (foundSnakefile){
            await vscode.window.showTextDocument(foundSnakefile.document);
            return RStudioHistory.fromJSON(null, foundSnakefile.document.fileName);
        } else if (openedEditor){
            await vscode.window.showTextDocument(openedEditor.document);
        }
        return RStudioHistory.fromJSON(null, null);
    }

}