
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
						const max_tokens = parseInt(data.max_tokens);
						if (isNaN(max_tokens)) {
							vscode.window.showErrorMessage('Max tokens must be a number');
							return;
						}

						viewModel.testModel(data.url, data.model_name, max_tokens, data.api_key).then((response) => {
							viewModel.addModel(data.url, data.model_name, max_tokens, data.api_key);
							vscode.window.showInformationMessage(`Model ${data.model_name} added successfully! Use the Snakemaker panel to select and activate it.`);
							panel.dispose();
						}).catch((error) => {
							let parsed = "Error connecting to model: ";
							if (error.code){
								parsed += error.code + " - ";
							}
							if (error.cause){
								if (error.cause.code){
									parsed += error.cause.code + " - ";
								}
								if (error.cause.message){
									parsed += error.cause.message;
								}
							} else {
								parsed += error.message;
							}
							vscode.window.showErrorMessage(parsed);
						});
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
							<p>Custom language models are connected through the OpenAI Chat Completions API.</p>
							<p>OpenAI-compatible APIs are offered by most vendors, included <a href="https://platform.openai.com/docs/overview" target="_blank">OpenAi</a>, <a href="https://docs.perplexity.ai/guides/getting-started" target="_blank">Perplexity</a>, <a href="https://docs.anthropic.com/en/api/openai-sdk" target="_blank">Anthropic</a> and <a href="https://ai.google.dev/gemini-api/docs/openai" target="_blank">Google</a>.</p>
							<p>Local models can be deployed through <a href="https://ollama.com/blog/openai-compatibility" target="_blank">Ollama</a>.</p>
							<br>
							<h3>LLM recommended requirements</h3>
							<p>It is recommended to use models with at minimum:</p>
							<ul>
								<li>70b parameters</li>
								<li>Max tokens: 4k+</li>
							</ul>
							<p>Note: Chain-of-Thought (CoT) models are generally <strong>not</strong> recommended - while they do provide excellent performances,
							their additional cost and slower response times are not worth the trade-off in the context of 
							Snakemaker. The only exception where CoT models can be worth it is the second step of the 
							notebook export process.</p>
							<br>
							<h3>API details</h3>
							<p>Fill the form below to connect to an API endpoint.</p>
							<form id="modelForm">
								<label for="url">API URL:</label>
								<input type="url" id="url" name="url" required placeholder="http://localhost:8080/v1"><br><br>

								<label for="model_name">Model name:</label>
								<input type="text" id="model_name" name="model_name" required placeholder="meta/llama3-70b-instruct"><br><br>

								<label for="api_key">(Optional): API Key</label>
								<input type="text" id="api_key" name="api_key"><br><br>

								<label for="max_tokens">Max tokens:</label>
								<input type="number" id="max_tokens" name="max_tokens" value="4096" required placeholder="4096"><br><br>

								<input type="submit" id="submit" value="Add custom model">
							</form>
							<br>
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