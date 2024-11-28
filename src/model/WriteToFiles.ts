import * as vscode from 'vscode';

export class WriteToFiles{
    writeToCurrentFile(value: string){
        //Write to the file currently in focus, if any
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const position = editor.selection.active;
            editor.edit(editBuilder => {
                editBuilder.insert(position, value);
            });
        } else {
            vscode.window.showInformationMessage('No file open');
        }
    }
}