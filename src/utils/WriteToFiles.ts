import * as vscode from 'vscode';

export class WriteToFiles{

    writeToFile(path: string, value: string): boolean{
        const fs = require('fs');
        fs.writeFile(path, value, (err: any) => {
            if (err){
                vscode.window.showInformationMessage('Error writing to file');
                return false;
            }
        });
        return true;
    }
    readFromFile(path: string): string{
        const fs = require('fs');
        return fs.readFileSync(path, 'utf8');
    }

    private writeToEditor(value: string, rule_all: string, editor: vscode.TextEditor | undefined, remove: string | null = null){
        if (!editor){
            vscode.window.showInformationMessage('Please open a file in the editor to print the rules');
            return false;
        }

        let content = editor.document.getText();
        if (remove){
            content = content.replace(remove, rule_all);
        } else {
            content = rule_all.trimEnd() + "\n\n" + content;
        }

        content = content.trimEnd() + "\n\n" + value.trimStart();
        editor.edit(editBuilder => {
            editBuilder.replace(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(editor.document.lineCount, 0)), content);
        });
        return true;
    }

    async writeToNewFile(value: string): Promise<boolean>{
        return vscode.commands.executeCommand('workbench.action.files.newUntitledFile', {"languageId": "markdown"}).then(() => {
            const editor = vscode.window.activeTextEditor;
            if (!editor){
                return false;
            }
            editor.edit(editBuilder => {
                editBuilder.insert(new vscode.Position(0, 0), value);
            });
            return true;
        });
    }

    async writeToCurrentFile(value: any): Promise<boolean>{
        let rules = value['rule'];
        let rule_all = value['rule_all'] || "";
        let remove = value['remove'];
        //Write to the file currently in focus, if any
        var editor = vscode.window.activeTextEditor;
        if (!editor){
            return vscode.commands.executeCommand('workbench.action.files.newUntitledFile').then(() => {
                editor = vscode.window.activeTextEditor;
                return this.writeToEditor(rules, rule_all, editor);
            });
        } else {
            return this.writeToEditor(rules, rule_all, editor, remove);
        }
    }
    hasEditorOpen(): boolean{
        return vscode.window.activeTextEditor !== undefined;
    }

    //If a Snakefile is open, try to focus on it
    tryToFocusOnSnakefile(){
        //Check if user is already in a Snakefile, even if not saved
        if (vscode.window.activeTextEditor){
            if (vscode.window.activeTextEditor.document.fileName.toLowerCase().endsWith('snakefile')){
                return;
            }
            const content = vscode.window.activeTextEditor.document.getText();
            if (/rule\s+[a-zA-Z0-9_]+\s*:/.test(content)) {
                // This is likely a Snakefile
                return;
            }
        }
        vscode.window.tabGroups.all.forEach((tabGroup) => {
            tabGroup.tabs.forEach((tab) => {
                if (tab.label.toLowerCase().endsWith('snakefile')){
                    vscode.window.showTextDocument(tab.input as vscode.TextDocument).then(() => {
                        // Focus is now on the Snakefile
                    }, (error) => {
                        vscode.window.showErrorMessage(`Failed to focus on Snakefile: ${error}`);
                    });
                }
            });
        });
    }
}