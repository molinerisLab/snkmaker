import * as vscode from 'vscode';
import { BashCommandViewModel } from '../viewmodel/BashCommandViewmodel';

export class ChatPanelView implements vscode.WebviewViewProvider {

	public static readonly viewType = 'snakemaker-chat';

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
        private readonly viewModel: BashCommandViewModel
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				this._extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(data => {
			/*switch (data.type) {
				case 'colorSelected':
					{
						vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(`#${data.value}`));
						break;
					}
			}*/
		});
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		// Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'chat_panel_main.js'));

		// Do the same for the stylesheet.
		const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
        const style = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'chat_panel_style.css'));
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));
		const snakemakerIcon = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'icon.png'))
        // Use a nonce to only allow a specific script to be run.
		const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; font-src ${webview.cspSource}; style-src ${webview.cspSource};">

                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleVSCodeUri}" rel="stylesheet">
                <link href="${style}" rel="stylesheet">
                <link href="${codiconsUri}" rel="stylesheet">
                <title>Cat Colors</title>
            </head>
            <body>

                <!-- Example user message -->
                <div class="chat-user-container">
                    <p><strong>User</strong></p>
                    <p>Hello, how are you?</p>
                </div>

                <!-- Example bot message -->
                <div class="chat-bot-container">
                    <div class="bot-header">
                        <img src="${snakemakerIcon}" class="bot-icon"></img>
                        <strong>Snakemaker</strong>
                    </div>
                    <p>I'm fine, thank you!</p>
                </div>

                <div id="chat-textarea-container">
                    <textarea id="input" rows="10" cols="30"></textarea>
                    <div id="send-button" class="codicon codicon-send"></div>
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