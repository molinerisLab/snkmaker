
import * as vscode from 'vscode';
import { BashCommandViewModel } from '../viewmodel/BashCommandViewmodel';

export class AddModelView{
    public static currentPanel: AddModelView | undefined;
	public static readonly viewType = 'addModelView';
	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionUri: vscode.Uri, viewModel: BashCommandViewModel) {
		if (AddModelView.currentPanel) {
			AddModelView.currentPanel._panel.reveal(vscode.window.activeTextEditor? vscode.window.activeTextEditor.viewColumn: undefined);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			AddModelView.viewType,
			'Custom Model Setup',
			(vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn: undefined) || vscode.ViewColumn.One,
            {enableScripts: true,localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]}
		);
		AddModelView.currentPanel = new AddModelView(panel, extensionUri, viewModel);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, viewModel: BashCommandViewModel) {
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
	}

	public dispose() {
		AddModelView.currentPanel = undefined;
		this._panel.dispose();
		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'add_model_view_main.js');
		const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

		//const styleResetPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css');
		const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'add_viewmodel_view_style.css');
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
				<title>Custom Model Setup</title>
			</head>
			<body>
                <div id="mainContainer">
                    <h1>Setup a custom language model</h1>
                    <p>Custom language models are connected through the OpenAI API standard.</p>
                    <p>Fill in the following form to setup a custom language model:</p>
                    <form id="modelForm">
                        <label for="url">API URL:</label>
                        <input type="url" id="url" name="url" required placeholder="http://localhost:8080"><br><br>

                        <label for="model_name">Model name:</label>
                        <input type="text" id="model_name" name="model_name" required placeholder="meta/llama3-70b-instruct"><br><br>

                        <label for="api_key">(Optional): API Key</label>
                        <input type="text" id="api_key" name="api_key"><br><br>

                        <label for="max_tokens">Max tokens:</label>
                        <input type="number" id="max_tokens" name="max_tokens" value="4096" required placeholder="4096"><br><br>

                        <input type="submit" id="submit" value="Add custom model">
                    </form>
                </div>
				<script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
			</html>`;
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}