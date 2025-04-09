import * as vscode from 'vscode';
import { SnakefileContext } from './OpenendSnakefileContent';
import { ExecutionEnvironment } from '../model/TerminalHistory';
import { ExtensionSettings } from './ExtensionSettings';

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

    private writeToEditor(value: string, rule_all: string, editor: vscode.TextEditor | undefined, remove: string | null = null, prefix: string){
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

        content = prefix + "\n" + content.trimEnd() + "\n\n" + value.trimStart();
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

    

    async writeToCurrentFile(value: SnakefileContext): Promise<boolean>{
        let rules = value['rule']||"";
        let rule_all = value['rule_all'] || "";
        let remove = value['remove'];
        //Get the env files to export
        const envs = new Set(value.envs_to_export.filter((env: ExecutionEnvironment) => !env.stored));

        var editor = vscode.window.activeTextEditor;
        let config_include = "";
        if (value['add_to_config'] && value['add_to_config'].length>0 && value['config_paths'].length === 0){
            config_include = "configfile: config.yaml"
        }
        if (!editor){
            const result = await vscode.commands.executeCommand('workbench.action.files.newUntitledFile').then(() => {
                editor = vscode.window.activeTextEditor;
                return this.writeToEditor(rules, rule_all, editor, null, config_include);
            });
        } else {
            //vscode.window.showTextDocument(editor.document);
            const result = this.writeToEditor(rules, rule_all, editor, remove, config_include);
            if (!result){
                return false;
            }
        }

        //Write config
        if (value['add_to_config'] && value['add_to_config'].length > 0){
            let to_output = value['add_to_config'];
            if (value['config_paths'][0], value['config_content'][0] && value['config_content'][0].length > 0){
                to_output = value['config_content'][0] + "\n" + to_output;
            }
            if (value['config_paths'][0]){
                this.writeToFile(value['config_paths'][0], to_output);
                await vscode.workspace.openTextDocument(value['config_paths'][0]).then((document) => {
                    vscode.window.showTextDocument(document);
                });
            } else {
                to_output = "#config.yaml\n" + to_output;
                await vscode.commands.executeCommand('workbench.action.files.newUntitledFile');
                const config_editor = vscode.window.activeTextEditor;
                if (config_editor){
                    config_editor.edit(editBuilder => {
                        editBuilder.insert(new vscode.Position(0, 0), to_output);
                    });
                }
            }
        }

        //Write to the file currently in focus, if any
        if (ExtensionSettings.instance.getAddCondaDirective()){
            if (editor && editor.document.uri && editor.document.uri.fsPath.toLowerCase().endsWith('snakefile')){
                const directory = editor.document.uri.fsPath.slice(0, editor.document.uri.fsPath.lastIndexOf("/"));
                for (const env of envs) {
                    const env_path = directory + "/" + env.filename;
                    this.writeToFile(env_path, env.content);
                    env.stored = true;
                };
            } else {
                //If no editor is open, export envs to new tabs
                for (const env of envs){
                    await vscode.commands.executeCommand('workbench.action.files.newUntitledFile');
                    const env_editor = vscode.window.activeTextEditor;
                    await env_editor?.edit(editBuilder => {
                        editBuilder.insert(new vscode.Position(0, 0), `#Env ${env.filename}\n` + env.content);
                    });
                }
            }
        }
        //Highlight created Snakefile, not the env or config files
        if (editor){
            vscode.window.showTextDocument(editor.document);
        }
        return true;
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