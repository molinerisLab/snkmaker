import * as vscode from 'vscode';
import { ExecutionEnvironment } from '../model/TerminalHistory';


/**	include: "Snakefile_versioned.sk"

configfile: "config_DGE.yaml" */

export class SnakefileContext{
    constructor(
        public snakefile_path: string | null,
        public snakefile_content: string | null,
        public content: string | null,
        public config_paths: string[],
        public config_content: string[],
        public include_paths: string[],
        public include_content: string[],
        public rule: string | null,
        public rule_all: string | null,
        public add_to_config: string | null,
        public remove: string | null,
        public envs_to_export: ExecutionEnvironment[]
    ) {}
    get_snakefile(){
        return (this.snakefile_content?.replaceAll(this.remove||"","") || "") + "\n" + this.rule + "\n" + (this.rule_all || "");
    }
}

export class OpenedSnakefileContent{

    static async manageInclude(original_content: string, original_path: string): Promise<SnakefileContext> {
        const includePaths:any = {};
        const configPaths:any = {};
        const includePath = original_path.slice(0, original_path.lastIndexOf("/"))

        const lines = original_content.replaceAll(";", "\n").split("\n");
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
            try{
                const includeContent = await vscode.workspace.fs.readFile
                    (vscode.Uri.file(path)).then((data) => {
                        const decoder = new TextDecoder("utf-8");
                        return decoder.decode(data);
                    }
                );
                includePaths[key] = includeContent;
            } catch (e) {
                console.log("Error reading include file: ", e);
                includeKeys.splice(includeKeys.indexOf(key), 1);
            }
        }
        for (let key of configKeys) {
            const path = includePath + "/" + key;
            try{
                const configContent = await vscode.workspace.fs.readFile
                    (vscode.Uri.file(path)).then((data) => {
                        const decoder = new TextDecoder("utf-8");
                        return decoder.decode(data);
                    }
                );
                configPaths[key] = configContent;
            } catch (e) {
                console.log("Error reading config file: ", e);
                configKeys.splice(configKeys.indexOf(key), 1);
            }
        }

        let content = original_content;
        if (includeKeys.length > 0 || configKeys.length > 0) {
            content = "\n\n#.....................\n#Snakefile:\n" + content;
        }
        if (configKeys.length > 0) {
            content = "\n\n#.....................\n#Included configuration files:\n" + 
                (
                    Object.keys(configPaths).map((key) => {
                        return "#Config file name: " + key + ":\n" + configPaths[key];
                    }).join("\n")
                ) + 
                content; 
        }
        if (includeKeys.length > 0) {
            content = "Included rule files:\n" + 
                Object.values(includePaths).join("\n") + 
                content; 
        }

        return new SnakefileContext(
            original_path,
            original_content,
            content,
            configKeys.map((key) => includePath + "/" + key),
            configKeys.map((key) => configPaths[key]),
            includeKeys.map((key) => includePath + "/" + key),
            includeKeys.map((key) => includePaths[key]),
            null,
            null,
            null,
            null,
            []
        );
    }

    static async getCurrentEditorContent():Promise<SnakefileContext|null>{
        const editor = vscode.window.activeTextEditor;
        if (!editor) { 
            return  null; 
        }
        let activeEditorCurrentPath = editor.document.fileName;
        const document = editor.document;
        const content = await OpenedSnakefileContent.manageInclude(
            document.getText(),
            activeEditorCurrentPath
        );
        return content;
    }
    
    static async getFilePathContent(filePath: string): Promise<SnakefileContext> {
        const document = await vscode.workspace.openTextDocument(filePath);
        const content = await OpenedSnakefileContent.manageInclude(
            document.getText(),
            filePath.slice(0, filePath.lastIndexOf("/"))
        );
        return content;
    }
    
    static getCurrentEditorSnakefilePath(): string | null {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { 
            return  ""; 
        }
        let activeEditorCurrentPath = editor.document.fileName;
        if (activeEditorCurrentPath.includes("Snakefile")) {
            return activeEditorCurrentPath;
        }
        return null;
    }

}