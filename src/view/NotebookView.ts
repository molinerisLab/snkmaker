
import * as vscode from 'vscode';
import { BashCommandViewModel } from '../viewmodel/BashCommandViewmodel';
import { CellDependencyGraph } from '../model/NotebookController';
import internal from 'stream';
import { NotebookPresenter } from '../viewmodel/NotebookPresenter';

export interface NotebookViewCallbacks{
    setNotebookCells(cells: CellDependencyGraph): void;
    onError(error: string): void;
    onSoftError(error: string): void;
    setLoading(loadMessage: string): void;
    setRulesNodes(nodes: CellDependencyGraph): void;
    stopLoading(): void;
    setOutput(cells: CellDependencyGraph): void;
    dispose(): void;
    get_state(): number;
}

export class NotebookView implements NotebookViewCallbacks{
    public static readonly viewType = 'NotebookView';
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private currentScreen = 0;

    public static openFromFile(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, viewModel: BashCommandViewModel, context: vscode.ExtensionContext){
        const panel = webviewPanel;
        panel.webview.options = {enableScripts: true,localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]}
        return new NotebookView(panel, context.extensionUri, viewModel, undefined, document, context);
    }

    public static create(extensionUri: vscode.Uri, viewModel: BashCommandViewModel, notebookUri: vscode.Uri, context: vscode.ExtensionContext) {
        const panel = vscode.window.createWebviewPanel(
            NotebookView.viewType,
            'Export notebook',
            (vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn: undefined) || vscode.ViewColumn.One,
            {enableScripts: true,localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]}
        );
        panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.svg');
        return new NotebookView(panel, extensionUri, viewModel, notebookUri, undefined, context);
    }

    public get_state(): number {
        return this.currentScreen;
    }

    setNotebookCells(cells: CellDependencyGraph): void {
        this.stopLoading();
        this._panel.webview.postMessage({ command: 'set_cells', data: cells });
    }
    setRulesNodes(nodes: CellDependencyGraph){
        this.stopLoading();
        nodes.cells.forEach(cell => cell.rule.setCanBecome());
        this._panel.webview.postMessage({ command: 'set_rules', data: nodes });
    }
    setOutput(cells: CellDependencyGraph){
        this.currentScreen = 1;
        this.stopLoading();
        this._panel.webview.postMessage({ command: 'set_output', data: cells });
    }
    onError(error: string): void {
        console.log(error);
        vscode.window.showErrorMessage(error);
        this.dispose();
    }
    onSoftError(error: string): void {
        this.stopLoading();
        console.log(error);
        vscode.window.showWarningMessage(error);
    }
    setLoading(loadMessage: string){
        this._panel.webview.postMessage({ command: 'set_loading', data: loadMessage, loading: true });
    }
    stopLoading(){
        this._panel.webview.postMessage({ command: 'set_loading', loading: false });
    }

    undoCommand: vscode.Disposable;
    redoCommand: vscode.Disposable;
    saveCommand: vscode.Disposable;
    saveAsCommand: vscode.Disposable;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, viewModel: BashCommandViewModel, notebookUri: vscode.Uri| undefined, exportedDocument: vscode.TextDocument | undefined, context: vscode.ExtensionContext) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._panel.onDidDispose(() => {viewModel.openedNotebookPresenter=null; this.dispose();}, null, this._disposables);
        let presenter: NotebookPresenter;
        if (notebookUri){
            presenter = viewModel.openNotebook(notebookUri, this);
        } else if (exportedDocument){
            presenter = viewModel.openExportedNotebook(exportedDocument, this);
        }
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'delete_cell':
                        const index = message.data;
                        presenter.deleteCell(index);
                        break;
                    case 'merge_cell':
                        const index_top = message.index_top;
                        const index_bottom = message.index_bottom;
                        presenter.mergeCells(index_top, index_bottom);
                        break;
                    case 'split_cell':
                        const cell_index = message.index;
                        const code1 = message.code1;
                        const code2 = message.code2;
                        presenter.splitCell(cell_index, code1, code2);
                        break;
                    case 'add_to_writes':
                        presenter.addWrite(message.index, message.keyword);
                        break;
                    case 'add_to_dependencies':
                        presenter.addDependency(message.index, message.keyword);
                        break;
                    case 'add_to_wildcards':
                        presenter.addWildcard(message.index, message.keyword);
                        break;
                    case 'remove_write':
                        presenter.removeWrite(message.index, message.keyword);
                        break;
                    case 'remove_dependency':
                        presenter.removeDependency(message.index, message.keyword);
                        break;
                    case 'become_rule':
                    case 'become_script':
                    case 'become_undecided':
                        const state = message.command.split('_')[1];
                        presenter.changeRuleState(message.index, state);
                        break;
                    case 'produce_snakefile':
                        presenter.produceSnakefile();
                        break;
                    case 'propagate_changes_prefix':
                        presenter.propagateChangesPrefix(message.index, message.content);
                        break;
                    case 'propagate_changes_postfix':
                        presenter.propagateChangesPostfix(message.index, message.content);
                        break;
                    case 'propagate_snakemake_rule':
                        presenter.propagateChangesSnakemakeRule(message.index, message.content);
                        break;
                    case 'export_snakefile':
                        presenter.exportSnakefile();
                        break;
                    case 'back':
                        presenter.back();
                        break;
                    case 'remove_function_dependency':
                        presenter.removeFunctionDependency(message.index, message.keyword);
                        break;
                    case 'config_changed':
                        presenter.configChanged(message.content);
                        break;
                    case 'open_chat_assistant':
                        vscode.commands.executeCommand('snakemaker-chat.focus');
                        break;
                }
            },
            null,
            this._disposables
        );
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
        panel.onDidChangeViewState(e => {
                const data = presenter.getCells();
                if (this.currentScreen===0){
                    this.setNotebookCells(data);
                    this.setRulesNodes(data);
                } else {
                    this.setOutput(data);
                }
            },
            null,
            context.subscriptions);
        
        this.undoCommand = vscode.commands.registerCommand('undo', async (args) => {
            presenter.undo(this.currentScreen);
        });
        this.redoCommand = vscode.commands.registerCommand('redo', async (args) => {
            presenter.redo(this.currentScreen);
        });
        this.saveCommand = vscode.commands.registerCommand('workbench.action.files.save', async (args) => {
            presenter.save();
            //workbench.action.files.saveAs
        });
        this.saveAsCommand = vscode.commands.registerCommand('workbench.action.files.saveAs', async (args) => {
            presenter.saveAs();
        });

    }


    public dispose() {
        this.undoCommand.dispose();
        this.redoCommand.dispose();
        this.saveCommand.dispose();
        this.saveAsCommand.dispose();
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'notebook_main.js');
        const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
        const highlightjs = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'highlight.min.js'));
        const highlightjsStyle = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'github-dark.min.css'));

        const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'notebook_style.css');
        //const stylesResetUri = webview.asWebviewUri(styleResetPath);
        const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);

        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${stylesMainUri}" rel="stylesheet">
                <title>Export Notebook</title>
            </head>
            <body>
                <div id="actionButton">
                    <button id="addWrite">Add to cell Writes</button>
                    <button id="addDependency">Add to cell dependencies</button>
                    <button id="addWildcards">Add to cell wildcards</button>
                </div>
                <div id="loadingscreen">
                    <div class="spinner"></div>
                    <h2 id="loadingmessage">Loading...</h2>
                </div>
                <div id="userinputoverlay">
                </div>
                <div id="main_header">
                </div>
                <div id="supercontainer">
                    <div id="lines"></div>
                    <div id="mainContainer">
                    </div>
                </div>
                <link rel="stylesheet" href="${highlightjsStyle}">
                <script nonce="${nonce}" src="${highlightjs}"></script>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGnJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}