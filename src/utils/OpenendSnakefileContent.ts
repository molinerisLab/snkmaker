import * as vscode from 'vscode';


/**	include: "Snakefile_versioned.sk"

configfile: "config_DGE.yaml" */

export class OpenedSnakefileContent{

    static async manageInclude(content: string, includePath: string): Promise<string> {
        const includePaths:any = {};
        const configPaths:any = {};

        const lines = content.replaceAll(";", "\n").split("\n");
        for (let line of lines) {
            const trimmed_line = line.replaceAll(' ', "");
            if (trimmed_line.includes("include:")) {
                let include = line.split(":")[1].replaceAll('"', "").trim();
                includePaths[include] = "";
            } else if (trimmed_line.includes("configfile:")) {
                const configfile = line.split(":")[1].replaceAll('"', "").trim();
                configPaths[configfile] = "";
            }
        }

        const includeKeys: string[] = Object.keys(includePaths);
        const configKeys: string[] = Object.keys(configPaths);

        for (let key of includeKeys) {
            const path = includePath + "/" + key;
            const includeContent = await vscode.workspace.fs.readFile
                (vscode.Uri.file(path)).then((data) => {
                    const decoder = new TextDecoder("utf-8");
                    return decoder.decode(data);
                }
            );
            includePaths[key] = includeContent;
        }
        for (let key of configKeys) {
            const path = includePath + "/" + key;
            const configContent = await vscode.workspace.fs.readFile
                (vscode.Uri.file(path)).then((data) => {
                    const decoder = new TextDecoder("utf-8");
                    return decoder.decode(data);
                }
            );
            configPaths[key] = configContent;
        }


        if (includeKeys.length > 0 || configKeys.length > 0) {
            content = "Snakefile:\n" + content;
        }
        if (configKeys.length > 0) {
            content = "Included configuration files (use the configurations inside the rules if needed!): \n\n" + 
                (
                    Object.keys(configPaths).map((key) => {
                        return "Config file: " + key + ":\n" + configPaths[key];
                    }).join("\n")
                ) + 
                content; 
        }
        if (includeKeys.length > 0) {
            content = "Included rule files:\n" + 
                Object.values(includePaths).join("\n") + 
                content; 
        }

        return content;
    }

    static async getCurrentEditorContent(){
            const editor = vscode.window.activeTextEditor;
            if (!editor) { 
                return  ""; 
            }
            let activeEditorCurrentPath = editor.document.fileName;
            activeEditorCurrentPath = activeEditorCurrentPath.slice(0, activeEditorCurrentPath.lastIndexOf("/"));
            const document = editor.document;
            const content = await OpenedSnakefileContent.manageInclude(
                document.getText(),
                activeEditorCurrentPath
            );
            return content;
        }

}