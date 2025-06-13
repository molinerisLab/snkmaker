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

    constructor(path: string|null = null) {
        this.history = [];
        this.archive = [];
        this.path = path;
    }

    private addCommands(commands: string[]): void {
        this.history.concat(commands.map(cmd => ({ command: cmd })));
    }

    getHistory(): RCommand[] {
        return this.history;
    }


    toJSON(): void {
        const json = JSON.stringify(this.archive);
        if (this.path) {
            const fs = require('fs');
            fs.writeFileSync(this.path, json, 'utf8');
        }
    }

    static fromJSON(jsonPath: string|null): RStudioHistory {
        if (!jsonPath) {
            return new RStudioHistory();
        }
        const fs = require('fs');
        const json = fs.readFileSync(jsonPath, 'utf8');
        if (!json) {
            return new RStudioHistory(jsonPath);
        }
        const instance = new RStudioHistory();
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed)) {
            instance.archive = parsed.map((cmd: any) => ({ command: cmd.command }));
        } else {
            vscode.window.showErrorMessage("Invalid RStudio history format in " + jsonPath);
            return new RStudioHistory(jsonPath);
        }
        return instance;
    }

    async exportCommands(commands: string[], llm: LLM): Promise<string> {
        this.addCommands(commands);
        const queries = new Queries(llm);
        queries.getRulesFromRHistory(this);
        

        this.archive = this.archive.concat(commands.map(cmd => ({ command: cmd })));
        this.history = [];
        this.toJSON();

    }
}


export class RStudioController{

    async getHistoryOfProject(): Promise<RStudioHistory> {
        const checkRProject = (filename: string): string|null => {
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
        if (vscode.window.activeTextEditor){
            if (vscode.window.activeTextEditor.document.fileName.toLowerCase().endsWith('snakefile')){
                const path = checkRProject(vscode.window.activeTextEditor.document.fileName);
                if (path){
                    return RStudioHistory.fromJSON(path);
                }
            }
            const content = vscode.window.activeTextEditor.document.getText();
            if (/rule\s+[a-zA-Z0-9_]+\s*:/.test(content)) {
                // This is likely a Snakefile
                const path = checkRProject(vscode.window.activeTextEditor.document.fileName);
                if (path){
                    return RStudioHistory.fromJSON(path);
                }
            }
        }
        await vscode.window.tabGroups.all.forEach(async (tabGroup) => {
            await tabGroup.tabs.forEach(async (tab) => {
                if (tab.label.toLowerCase().endsWith('snakefile')){
                    await vscode.window.showTextDocument(tab.input as vscode.TextDocument);
                    const path = checkRProject((tab.input as vscode.TextDocument).fileName);
                    if (path){
                        return RStudioHistory.fromJSON(path);
                    }
                }
            });
        });
        //Go back to previous editor, if any
        if (openedEditor){
            await vscode.window.showTextDocument(openedEditor.document);
        }
        return RStudioHistory.fromJSON(openedEditor?.document.fileName || null);
    }

}