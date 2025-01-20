
import * as vscode from 'vscode';
import { BashCommandViewModel } from '../viewmodel/BashCommandViewmodel';
import { NotebookRulesCandidates } from '../model/NotebookController';

export interface NotebookViewCallbacks{
    setNotebookCells(cells: string[][]): void;
    setCandidateRules(rules: NotebookRulesCandidates[]): void;
    onError(error: string): void;
}

export class NotebookView implements NotebookViewCallbacks{
    public static readonly viewType = 'NotebookView';
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static create(extensionUri: vscode.Uri, viewModel: BashCommandViewModel, notebookUri: vscode.Uri) {
        const panel = vscode.window.createWebviewPanel(
            NotebookView.viewType,
            'Custom Model Setup',
            (vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn: undefined) || vscode.ViewColumn.One,
            {enableScripts: true,localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]}
        );
        return new NotebookView(panel, extensionUri, viewModel, notebookUri);
    }

    setNotebookCells(cells: string[][]): void {
        console.log(cells);
        this._panel.webview.postMessage({ command: 'set_cells', data: cells });
    }
    setCandidateRules(rules: NotebookRulesCandidates[]): void {
        console.log(rules);
        this._panel.webview.postMessage({ command: 'set_candidates', data: rules });
    }
    onError(error: string): void {
        console.log(error);
        vscode.window.showErrorMessage(error);
        this.disposeDelayed();
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, viewModel: BashCommandViewModel, notebookUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'submit':
                        const data = message.data;
                        viewModel.addModel(data.url, data.model_name, data.max_tokens, data.api_key);
                        panel.dispose();
                        return;
                }
            },
            null,
            this._disposables
        );
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
        const presenter = viewModel.openNotebook(notebookUri, this);
    }


    public dispose() {
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private disposeDelayed(){
        setTimeout(() => {
            this.dispose();
        }, 5000);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'notebook_main.js');
        const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

        //const styleResetPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css');
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
                <div id="mainContainer">
                </div>
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