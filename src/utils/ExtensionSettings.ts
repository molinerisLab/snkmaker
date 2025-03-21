import * as vscode from 'vscode';
/**
 * This class provides an abstraction to access all the settings and memorized state of the extension.
 * It tries to be efficient by caching the values and only updating them when necessary, instead of calling the
 * vscode API every time.
 * It uses the singleton pattern. Sorry SOLID principles, but I'm not adding npm dependencies to implement d.i.
 */

export class ExtensionSettings{
    static instance = new ExtensionSettings();

    private allowLogging: boolean = false;
    private keepHistoryBetweenSessions: boolean = false;
    private rulesOutputFormat: string = "";
    private snakemakeBestPracticesSetLogFieldInSnakemakeRules: boolean = false;
    private snakemakeBestPracticesPreferGenericFilenames: boolean = false;
    private validateSnakemakeRules: boolean = false;
    private snakemakeAbsolutePath: string = "";
    private includeCurrentFileIntoPrompt: boolean = false;
    private commentEveryRule: boolean = false;
    
    public getAllowLogging(): boolean {
        return this.allowLogging;
    }
    public getKeepHistoryBetweenSessions(): boolean {
        return this.keepHistoryBetweenSessions;
    }
    public getRulesOutputFormat(): string {
        return this.rulesOutputFormat;
    }
    public getSnakemakeBestPracticesSetLogFieldInSnakemakeRules(): boolean {
        return this.snakemakeBestPracticesSetLogFieldInSnakemakeRules;
    }
    public getSnakemakeBestPracticesPreferGenericFilenames(): boolean {
        return this.snakemakeBestPracticesPreferGenericFilenames;
    }
    public getValidateSnakemakeRules(): boolean {
        return this.validateSnakemakeRules;
    }
    public getSnakemakeAbsolutePath(): string {
        return this.snakemakeAbsolutePath;
    }
    public getIncludeCurrentFileIntoPrompt(): boolean {
        return this.includeCurrentFileIntoPrompt;
    }
    public getCommentEveryRule(): boolean {
        return this.commentEveryRule;
    }

    private constructor(){
        this.allowLogging = vscode.workspace.getConfiguration('snakemaker').get('allowLogging', false);
        this.keepHistoryBetweenSessions = vscode.workspace.getConfiguration('snakemaker').get('keepHistoryBetweenSessions', false);
        this.rulesOutputFormat = vscode.workspace.getConfiguration('snakemaker').get('rulesOutputFormat', "Snakemake");
        this.snakemakeBestPracticesSetLogFieldInSnakemakeRules = vscode.workspace.getConfiguration('snakemaker').get('snakemakeBestPractices.SetLogFieldInSnakemakeRules', false);
        this.snakemakeBestPracticesPreferGenericFilenames = vscode.workspace.getConfiguration('snakemaker').get('snakemakeBestPractices.PreferGenericFilenames', false);
        this.validateSnakemakeRules = vscode.workspace.getConfiguration('snakemaker').get('validateSnakemakeRules', false);
        this.snakemakeAbsolutePath = vscode.workspace.getConfiguration('snakemaker').get('snakemakeAbsolutePath', "");
        this.includeCurrentFileIntoPrompt = vscode.workspace.getConfiguration('snakemaker').get('includeCurrentFileIntoPrompt', false);
        this.commentEveryRule = vscode.workspace.getConfiguration('snakemaker').get('snakemakeBestPractices.CommentEveryRule', false);

        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration("snakemaker.allowLogging")) {
                this.allowLogging = vscode.workspace.getConfiguration('snakemaker').get('allowLogging', false);
            } else if (event.affectsConfiguration("snakemaker.keepHistoryBetweenSessions")) {
                this.keepHistoryBetweenSessions = vscode.workspace.getConfiguration('snakemaker').get('keepHistoryBetweenSessions', false);
            } else if (event.affectsConfiguration("snakemaker.rulesOutputFormat")) {
                this.rulesOutputFormat = vscode.workspace.getConfiguration('snakemaker').get('rulesOutputFormat', "Snakemake");
            } else if (event.affectsConfiguration("snakemaker.snakemakeBestPractices.SetLogFieldInSnakemakeRules")) {
                this.snakemakeBestPracticesSetLogFieldInSnakemakeRules = vscode.workspace.getConfiguration('snakemaker').get('snakemakeBestPractices.SetLogFieldInSnakemakeRules', false);
            } else if (event.affectsConfiguration("snakemaker.snakemakeBestPractices.PreferGenericFilenames")) {
                this.snakemakeBestPracticesPreferGenericFilenames = vscode.workspace.getConfiguration('snakemaker').get('snakemakeBestPractices.PreferGenericFilenames', false);
            } else if (event.affectsConfiguration("snakemaker.validateSnakemakeRules")) {
                this.validateSnakemakeRules = vscode.workspace.getConfiguration('snakemaker').get('validateSnakemakeRules', false);
            } else if (event.affectsConfiguration("snakemaker.snakemakeAbsolutePath")) {
                this.snakemakeAbsolutePath = vscode.workspace.getConfiguration('snakemaker').get('snakemakeAbsolutePath', "");
            } else if (event.affectsConfiguration("snakemaker.includeCurrentFileIntoPrompt")){
                this.includeCurrentFileIntoPrompt = vscode.workspace.getConfiguration('snakemaker').get('includeCurrentFileIntoPrompt', false);
            } else if (event.affectsConfiguration("snakemaker.snakemakeBestPractices.CommentEveryRule")){
                this.commentEveryRule = vscode.workspace.getConfiguration('snakemaker').get('snakemakeBestPractices.CommentEveryRule', false);
            }
        });
    }
}