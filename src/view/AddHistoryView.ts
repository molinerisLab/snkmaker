
import * as vscode from 'vscode';
import { BashCommandViewModel } from '../viewmodel/BashCommandViewmodel';

export class AddHistoryView{
    public static currentPanel: AddHistoryView | undefined;
	public static readonly viewType = 'AddHistoryView';
	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionUri: vscode.Uri, viewModel: BashCommandViewModel) {
		if (AddHistoryView.currentPanel) {
			AddHistoryView.currentPanel._panel.reveal(vscode.window.activeTextEditor? vscode.window.activeTextEditor.viewColumn: undefined);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			AddHistoryView.viewType,
			'Custom Model Setup',
			(vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn: undefined) || vscode.ViewColumn.One,
            {enableScripts: true,localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]}
		);
		AddHistoryView.currentPanel = new AddHistoryView(panel, extensionUri, viewModel);
	}

	private parseCommands(commands: string): string[] {
		return commands.split('\n')
			.map(commands => {
				return commands.trim().replace(/^\d+\s+/, '');
			})
			.filter(command => command.trim().length > 2)
			.map(command => command.trim());
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, viewModel: BashCommandViewModel) {
		this._panel = panel;
		this._extensionUri = extensionUri;
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
		this._panel.webview.onDidReceiveMessage(
			message => {
				let commands: string[];
				switch (message.command) {
					case 'submit':
						this.parseCommands(message.data).forEach(command => 
							viewModel.addCommand(command, 0, true, true)
						);
						panel.dispose();
						return;
					case 'filter':
						commands = this.parseCommands(message.data);
						const filteredData = viewModel.filterCommands(commands).join("\n");
						this._panel.webview.postMessage({ command: 'updateTextField', data: filteredData });
				}
			},
			null,
			this._disposables
		);
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
	}

	public dispose() {
		AddHistoryView.currentPanel = undefined;
		this._panel.dispose();
		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'add_history_view_main.js');
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
				<title>Add commands to Snakemaker history</title>
			</head>
			<body>
                <div id="mainContainer">
                    <h1>Add commands to Snakemaker history</h1>
                    <p>The following commands will be added to the history.</p>
					<p>Commands should be separated by a new line.</p>
					<p>It is possible to paste commands from bash "history" command. The index of the command will be removed.</p>
                    <textarea id="history_commands" name="command" placeholder="Your commands here\n\ngit clone https://github.com/molinerisLab/3plex\ncd 3plex\ndirenv allow\nconda env create --file=local/envs/3plex.yaml\nconda activate 3plex_Env"></textarea>
					<button id="button_filter">Filter and clean-up commands</button>
					<button id="button_submit">Submit</button>
                </div>
				<script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
			</html>`;
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUffVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}