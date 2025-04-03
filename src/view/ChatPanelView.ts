import * as vscode from 'vscode';
import { BashCommandViewModel } from '../viewmodel/BashCommandViewmodel';
import { ChatExtension, MarkDownChatResponseStream } from '../utils/ChatExtension';
import { request } from 'http';
import { ChatExtensionNotebook } from '../utils/ChatExtensionNotebook';
const markdown = require('markdown-it')

class CustomChatResponseStream implements MarkDownChatResponseStream {
	acc: string = "";
	cancelled: boolean = false;
	constructor(private readonly callback: (value: string) => void) {
	}
	markdown(value: string | vscode.MarkdownString): void {
		this.acc += typeof value === 'string' ? value : value.value;
		if (!this.cancelled) {
			this.callback(this.acc);
		}
	}
	cancel(): void {
		this.cancelled = true;
	}
}

export class ChatPanelView implements vscode.WebviewViewProvider {

	history: string[] = [];
	private _disposable_stream?:CustomChatResponseStream = undefined;

	public static readonly viewType = 'snakemaker-chat';

	private _view?: vscode.WebviewView;

	public resetChat(){
		this._disposable_stream?.cancel();
		this._disposable_stream = undefined;
		this.history = [];
		this._view?.webview.postMessage({ type: 'reset_chat' });
	}

	private userPrompt(prompt: string) {
		//In history, first message is always the user message
		const md = markdown()
		const stream = new CustomChatResponseStream((value) => {
			const result = md.render(value);
			this._view?.webview.postMessage({ type: 'model_response_part', response: result });
		});
		this._disposable_stream = stream;
		this.chatExtension.process_chat_tab(prompt, this.history, this.viewModel.llm, stream).then((response) => {
			if (stream.cancelled) {
				return;
			}
			//Remove plaintext from the response - it breaks commands
			const regex = /```plaintext([\s\S]*?)```/g;
			const result = md.render(stream.acc);
			//const result = md.render(`ciao\n[Set new history](command:history-set?{"history":[{"commands":[{"command":"cat%20index.html.1%20|%20wc%20-l%20>%20temp/w_count.txt","exitStatus":0,"output":"temp/w_count.txt","inputs":"index.html.1","important":true,"rule_name":"MEAWWWW","manually_changed":true}],"index":277,"rule_name":"","manually_changed":false}]});`)
			//const result = md.render([Set new history](command:history-set?{"history":[{"commands":[{"command":"cat%20index.html.1%20|%20wc%20-l%20>%20temp/w_count.txt","exitStatus":0,"output":"temp/w_count.txt","inputs":"index.html.1","important":true,"rule_name":"ciao","manually_changed":true}],"index":289,"rule_name":"","manually_changed":false}]});)
			this._view?.webview.postMessage({ type: 'model_response_end', response: result });
			this.history.push(prompt);
			this.history.push(stream.acc);
		}).catch((error) => {
			if (stream.cancelled) {
				return;
			}
			this._view?.webview.postMessage({ type: 'model_error' });
		});
	}

	currentMode: "bash" | "notebook" = "bash";

	constructor(
		private readonly _extensionUri: vscode.Uri,
        private readonly viewModel: BashCommandViewModel,
		private readonly chatExtension: ChatExtension,
		private readonly notebookChatExtension: ChatExtensionNotebook,
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
			switch (data.type) {
				case 'user_submit':
					this.userPrompt(data.prompt);
					break;
				case 'command':
					//TODO validate the commands
					const command_and_args = decodeURIComponent(data.command).split('?');
					const command = command_and_args[0];
					if (this.chatExtension.getEnabledCommands().indexOf(command) === -1) {
						return;
					}
					let args = (command_and_args[1] ? command_and_args[1] : "")
						.replace(/^"|"$/g, '');
					if (args.startsWith("{") && args.endsWith("}")) {
						args = JSON.parse(args);
					}
					vscode.commands.executeCommand(
						command,
						args
					);
					break;
				case 'switch_mode':
					if (this.currentMode === "bash") {
						this.currentMode = "notebook";
						this._view?.webview.postMessage({ type: 'switch_to_notebook' });
					} else {
						this.currentMode = "bash";
						this._view?.webview.postMessage({ type: 'switch_to_bash' });
					}
					break;
			}
		});
	}

	private _getHtmlForWebview(webview: vscode.Webview) {

		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'chat_panel_main.js'));
		const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
        const style = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'chat_panel_style.css'));
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));
		const snakemakerIcon = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'icon.png'));
		const snakemakerIconSvg = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'icon.svg'));
        // Use a nonce to only allow a specific script to be run.
		const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; font-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleVSCodeUri}" rel="stylesheet">
                <link href="${style}" rel="stylesheet">
                <link href="${codiconsUri}" rel="stylesheet">
                <title>Cat Colors</title>
            </head>
            <body>
				<div id="templates">
					<!-- Example user message -->
					<div class="chat-user-container">
						<p><strong>User</strong></p>
						<p>Hello, how are you?</p>
					</div>

					<!-- Example bot message -->
					<div class="chat-bot-container" id="chat-bot-container-template">
						<div class="bot-header">
							<img src="${snakemakerIcon}" class="bot-icon"></img>
							<strong>Snakemaker</strong>
							<p class="loading_text"><em> (Loading...)</em></p>
						</div>
						<div class="response-text-container">I'm fine, thank you!</div>
					</div>
				</div>

				<div id="chat-header">
					<img src="${snakemakerIconSvg}"></img>
					<h4>Snakemaker Chat</h4>
					<p>The chat assistant can help you understand how to use the extension,
					answer queries related to the current history, assist you during the notebook export
					process and perform batch operations.</p>
				</div>

				<div id="chat-messages-container">
					<!-- Chat messages will be added here -->
				</div>

                <div id="chat-textarea-container">
                    <textarea id="input" rows="10" cols="30" laceholder="Type your prompt here..."></textarea>
					<div id="chat-control-area">
						<div id="switch_to_notebook" class="codicon codicon-book" title="Currently in Bash mode \n Switch to Notebook mode"></div>
						<div id="switch_to_bash" class="codicon codicon-terminal" title="Currently in Notebook mode \n Switch to Bash mode"></div>
                    	<div id="send-button" class="codicon codicon-send"></div>
					</div>
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