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

    private writeToEditor(value: string, editor: vscode.TextEditor | undefined){
        if (!editor){
            vscode.window.showInformationMessage('Please open a file in the editor to print the rules');
            return false;
        }
        const position = editor.selection.end;
        editor.edit(editBuilder => {
            editBuilder.insert(position, "\n\n"+value);
        });
        return true;
    }

    async writeToNewFile(value: string): Promise<boolean>{
        return vscode.commands.executeCommand('workbench.action.files.newUntitledFile', {"languageId": "markdown"}).then(() => {
            const editor = vscode.window.activeTextEditor;
            return this.writeToEditor(value, editor);
        });
    }

    async writeToCurrentFile(value: string): Promise<boolean>{
        //Write to the file currently in focus, if any
        var editor = vscode.window.activeTextEditor;
        if (!editor){
            return vscode.commands.executeCommand('workbench.action.files.newUntitledFile').then(() => {
                editor = vscode.window.activeTextEditor;
                return this.writeToEditor(value, editor);
            });
        } else {
            return this.writeToEditor(value, editor);
        }
    }
    hasEditorOpen(): boolean{
        return vscode.window.activeTextEditor !== undefined;
    }
}