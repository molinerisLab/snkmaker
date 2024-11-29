import * as vscode from 'vscode';

export class WriteToFiles{

    private writeToEditor(value: string, editor: vscode.TextEditor | undefined){
        if (!editor){
            vscode.window.showInformationMessage('Please open a file in the editor to print the rules');
            return false;
        }
        const position = editor.selection.active;
        editor.edit(editBuilder => {
            editBuilder.insert(position, value);
        });
        return true;
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