// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { TerminalHistoryDataProvider } from './view/TerminalHistoryDataProvider';
import { BashCommandViewModel } from './viewmodel/BashCommandViewmodel';
import { TodoDecorationProvider } from './view/MyDecorator';
import { ModelsDataProvider } from './view/ModelsDataProvider';
import { ChatExtension } from './utils/ChatExtension';
import { SnkmakerLogger } from './utils/SnkmakerLogger';
import { ExtensionSettings } from './utils/ExtensionSettings';
import { AddModelView } from './view/AddModelView';
import { AddHistoryView } from './view/AddHistoryView';
import { NotebookView } from './view/NotebookView';
import { ChatExtensionNotebook } from './utils/ChatExtensionNotebook';
import { ChatPanelView } from './view/ChatPanelView';
import * as http from 'http';
import { RStudioController } from './model/RStudioHistory';


export function activate(context: vscode.ExtensionContext) {
	
	//Initialize logger and logics to enable-disable it.
	SnkmakerLogger.initialize(context.extension.packageJSON.version);

	//Get memento - workspace saved state
	const memento = context.workspaceState;
	// Set context
	let bashCommandTitles = [' - NOT LISTENING', ' - LISTENING'];
	vscode.commands.executeCommand('setContext', 'myExtension.isListening', false);
	vscode.commands.executeCommand('setContext', 'myExtension.canUndo', false);
	vscode.commands.executeCommand('setContext', 'myExtension.canRedo', false);

	//Create viewmodel for terminal history
	const viewModel = new BashCommandViewModel(memento);

	//Create views
	const bashHistoryDataProvider = new TerminalHistoryDataProvider(viewModel);
	const bashCommandView = vscode.window.createTreeView('bash-commands', { treeDataProvider: bashHistoryDataProvider, dragAndDropController: bashHistoryDataProvider });
	bashCommandView.title = 'Bash Commands' + bashCommandTitles[viewModel.isListening?1:0];
	const bashArchiveDataProvider = new TerminalHistoryDataProvider(viewModel, true);
	vscode.window.registerTreeDataProvider('bash-commands-archive',bashArchiveDataProvider);
	const modelsDataProvider: ModelsDataProvider = new ModelsDataProvider(viewModel);
	vscode.window.registerTreeDataProvider('llm-models', modelsDataProvider);
	vscode.window.registerFileDecorationProvider(new TodoDecorationProvider(viewModel));
	
	//Unstash state if enabled - must be done after view creation
	if (ExtensionSettings.instance.getKeepHistoryBetweenSessions()){
		viewModel.unstashHistory();
	}

	//Register terminal listener, update view
	vscode.window.onDidEndTerminalShellExecution(event => {
		const commandLine = event.execution.commandLine;
		const code = event.exitCode;
		const shell = event.shellIntegration;
		const cwd = shell.cwd;
		if (code !== 0){
			viewModel.addCommandGoneWrong(commandLine.value, 0, true, code);
		} else {
			viewModel.addCommand(commandLine.value, 0, true, false, event.terminal);
		}
  	});

	//Register vscode commands
	const set_history = vscode.commands.registerCommand('history-set', (event) => {
		if (event && event.history){
			viewModel.setHistory(event.history);
		}
	});
	context.subscriptions.push(set_history);
	const print_rule = vscode.commands.registerCommand('print-rule', (event) => {
		if (event && event.getRoot()){
			viewModel.printRule(event.getRoot());
		} else {
			//TODO: can open menu to select command
			vscode.window.showInformationMessage('No command selected');
		}
	});
	context.subscriptions.push(print_rule);
	const print_all_rules = vscode.commands.registerCommand('print-all-rules', (event) => {
		viewModel.printAllRules();
	});
	context.subscriptions.push(print_all_rules);
	const archive_rules = vscode.commands.registerCommand('archive-command', (event) => {
		if (event && event.getRoot()){
			viewModel.archiveCommands([event.getRoot()]);
		} else {
			//TODO: can open menu to select command
			vscode.window.showInformationMessage('No command selected');
		}
	});
	context.subscriptions.push(archive_rules);
	const restore_commands = vscode.commands.registerCommand('restore-command', (event) => {
		if (event && event.getRoot()){
			viewModel.restoreCommands([event.getRoot()]);
		} else {
			//TODO: can open menu to select command
			vscode.window.showInformationMessage('No command selected');
		}
	});
	context.subscriptions.push(restore_commands);
	const delete_command = vscode.commands.registerCommand('delete-command', (event) => {
		if (event && event.getRoot()){
			viewModel.deleteCommand(event.getRoot());
		} else {
			vscode.window.showInformationMessage('No command selected');
		}
	});
	context.subscriptions.push(delete_command);
	const delete_all_commands = vscode.commands.registerCommand('delete-all-commands', () => {
		viewModel.deleteAllCommmands();
	});
	context.subscriptions.push(delete_all_commands);
	const delete_all_archived_commands = vscode.commands.registerCommand('delete-all-archived-commands', () => {
		viewModel.deleteAllArchivedCommands();
	});
	context.subscriptions.push(delete_all_archived_commands);
	const archive_all_commands = vscode.commands.registerCommand('archive-all-commands', () => {
		viewModel.archiveCommands([]);
	});
	context.subscriptions.push(archive_all_commands);
	const set_command_important = vscode.commands.registerCommand('set-command-important', (event) => {
		if (event && event.getRoot()){
			viewModel.setCommandImportance(event.getRoot(), true);
		} else {
			vscode.window.showInformationMessage('No command selected');
		}
	});
	context.subscriptions.push(set_command_important);
	const set_command_unimportant = vscode.commands.registerCommand('set-command-unimportant', (event) => {
		if (event && event.getRoot()){
			viewModel.setCommandImportance(event.getRoot(), false);
		} else {
			vscode.window.showInformationMessage('No command selected');
		}
	});
	context.subscriptions.push(set_command_unimportant);
	const modify_command_detail = vscode.commands.registerCommand('modify-command-detail', (event) => {
		if (event && event.parent && event.modifier){
			viewModel.modifyCommandDetail(event.parent, event.modifier);
		} else {
			vscode.window.showInformationMessage('No command selected');
		}
	});
	context.subscriptions.push(modify_command_detail);
	const start_listening = vscode.commands.registerCommand('start-listening', () => {
		viewModel.startListening();
		vscode.commands.executeCommand('setContext', 'myExtension.isListening', true);
		bashCommandView.title = 'Bash Commands' + bashCommandTitles[viewModel.isListening?1:0];
		vscode.window.showInformationMessage('Listening started');
	});
	context.subscriptions.push(start_listening);
	const stop_listening = vscode.commands.registerCommand('stop-listening', () => {
		viewModel.stopListening();
		vscode.commands.executeCommand('setContext', 'myExtension.isListening', false);
		bashCommandView.title = 'Bash Commands' + bashCommandTitles[viewModel.isListening?1:0];
		vscode.window.showInformationMessage('Listening paused');
	});
	context.subscriptions.push(stop_listening);
	const select_model = vscode.commands.registerCommand('use-model', async (model) => {
		if (model && model.checkDoubleClick()){
			viewModel.useModel(model.model.getId());
		}
	});
	context.subscriptions.push(select_model);
	const save_workspace = vscode.commands.registerCommand('save-workspace', () => {
		vscode.window.showSaveDialog({title:'Where to export workspace'}).then(fileInfos => {
			const path = fileInfos?.path;
			viewModel.saveWorkspace(path);
		});
	});
	context.subscriptions.push(save_workspace);
	const load_workspace = vscode.commands.registerCommand('load-workspace', () => {
		//Ask user for confirmation before proceeding
		vscode.window.showQuickPick(['Yes', 'No'], {placeHolder: 'Loading a workspace will overwrite the current one. Proceed?'}).then((value) => {
			if (value === 'Yes'){
				vscode.window.showOpenDialog({canSelectMany:false,title:'Load workspace from'}).then(fileInfos => {
					if (fileInfos && fileInfos.length > 0){
						viewModel.loadWorkspace(fileInfos[0].path);
					}
				});
			}
		});
	});
	context.subscriptions.push(load_workspace);
	const undo = vscode.commands.registerCommand('history-undo', () => {
		viewModel.undo();
	});
	context.subscriptions.push(undo);
	const redo = vscode.commands.registerCommand('history-redo', () => {
		viewModel.redo();
	});
	context.subscriptions.push(redo);
	const logDetailsScreen = vscode.commands.registerCommand('open-loging-details', () => {
		const uri = vscode.Uri.joinPath(context.extensionUri, 'resources', 'log_details.md');
		vscode.commands.executeCommand('markdown.showPreview', uri);
	  });
	context.subscriptions.push(logDetailsScreen);

	const helpScreen = vscode.commands.registerCommand('snkmaker-open-readme', () => {
		const uri = vscode.Uri.joinPath(context.extensionUri, 'resources', 'README.md');
		vscode.commands.executeCommand('markdown.showPreview', uri);
	  });
	context.subscriptions.push(helpScreen);

	const disableLogging = vscode.commands.registerCommand('disable-logs-session', () => {
		const logger = SnkmakerLogger.instance();
		if (logger){
			logger.disableInSession().then((success: boolean) => {
				if (success){
					vscode.window.showInformationMessage('Logger disabled, log session deleted');
				} else {
					vscode.window.showInformationMessage('Logger disabled, log session not deleted');
				}
			});
		} else {
			vscode.window.showInformationMessage('Logger already disabled');
		}
	});
	context.subscriptions.push(disableLogging);
	let modelAddingPanel: vscode.WebviewPanel | undefined = undefined;
	const addNewModel = vscode.commands.registerCommand('add-model', () => {
		AddModelView.createOrShow(context.extensionUri, viewModel);
	});
	context.subscriptions.push(addNewModel);
	const addHistory = vscode.commands.registerCommand("add-history-manually", () => {
		AddHistoryView.createOrShow(context.extensionUri, viewModel);
	});
	const deleteModel = vscode.commands.registerCommand('delete-model', (model) => {
		if (model){
			viewModel.deleteModel(model.model.getId());
		}
	});
	context.subscriptions.push(deleteModel);
	const openSettings = vscode.commands.registerCommand('open-snakemaker-settings', () => {
		vscode.commands.executeCommand('workbench.action.openSettings', 'snakemaker');
	});
	context.subscriptions.push(openSettings);
	const exportDocs = vscode.commands.registerCommand('generate-documentation', () => {
		viewModel.generateDocumentation();
	});
	context.subscriptions.push(exportDocs);
	const processNotebook = vscode.commands.registerCommand("process-notebook", (notebook) => {
		if (notebook){
			const view = NotebookView.create(context.extensionUri, viewModel, notebook.notebookEditor.notebookUri, context);
		}
	});


	//Copilot
	viewModel.listenToModelAvailability();


	//Register copilot chat extension
	const chatExtension: ChatExtension = new ChatExtension(viewModel);
	const chat_handler: vscode.ChatRequestHandler = async (request: vscode.ChatRequest,context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,token: vscode.CancellationToken) => {
			await chatExtension.process(request, context, stream, token);
		};
	const snakemaker = vscode.chat.createChatParticipant('chat-snakemaker', chat_handler);
	snakemaker.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources/icon.svg');

	const notebookChatExtension: ChatExtensionNotebook = new ChatExtensionNotebook(viewModel);
	const notebook_chat_handler: vscode.ChatRequestHandler = async (request: vscode.ChatRequest,context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,token: vscode.CancellationToken) => {
			await notebookChatExtension.process(request, context, stream, token);
		};
	const nb_snakemaker = vscode.chat.createChatParticipant('chat-snakemaker-notebook', notebook_chat_handler);
	nb_snakemaker.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources/icon.svg');

	//Register the customEditor for opening exported notebooks
	class NotebookExportEditorProvider implements vscode.CustomTextEditorProvider{
		public static register(context: vscode.ExtensionContext): vscode.Disposable {
			const provider = new NotebookExportEditorProvider();
			const providerRegistration = vscode.window.registerCustomEditorProvider(NotebookView.viewType, provider);
			return providerRegistration;
		}
		resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): Thenable<void> | void {
			NotebookView.openFromFile(document, webviewPanel, viewModel, context);
		}

	}
	context.subscriptions.push(NotebookExportEditorProvider.register(context));
	
	const provider = new ChatPanelView(
		context.extensionUri, 
		viewModel,
		chatExtension,
		notebookChatExtension
	);
	context.subscriptions.push(vscode.window.registerWebviewViewProvider(ChatPanelView.viewType, provider));

	const resetChat = vscode.commands.registerCommand('chat-new-chat', () => {
		provider.resetChat();
	});
	context.subscriptions.push(resetChat);
	const setNotebookmode = vscode.commands.registerCommand('chat-set-notebook-mode', () => {
		if (provider.currentMode === "bash"){
			provider.switchMode();
		}
	});
	context.subscriptions.push(setNotebookmode);

	


	const rStudioController = new RStudioController();
	const serverPorts = [
		7007, 6512, 8321, 6812, 8924, 7235, 8521, 7442, 7621, 7006
	];
	let serverPort = serverPorts[0];
	let portIndex = 0;
	let serverActive = false;
	const server = http.createServer((req, res) => {
		
	});
	const listen = (port:number) => {
		server.listen(port, 'localhost', () => {
			serverActive = true;
			vscode.window.showInformationMessage(`Snakemaker server is listening on port ${port}`);
			bashCommandTitles = [' - NOT LISTENING', ' - LISTENING - port ' + port];
			bashCommandView.title = 'Bash Commands' + bashCommandTitles[viewModel.isListening?1:0];
		});
		server.on('request', (req, res) => {
			if (req.method === 'POST'){
				let body = '';
				req.on('data', chunk => {
					body += chunk.toString(); // Convert Buffer to string
				});
				req.on('end', () => {
					if (viewModel.isListening === false){
						res.writeHead(400, {'Content-Type': 'text/plain'});
						res.end('Snakemaker is not listening\n');
						return;
					}
					try{
						const parsed = JSON.parse(body);
						if (parsed.command == "push_r"){
							viewModel.newRCommandsToExport(parsed.data);
							res.writeHead(200, {'Content-Type': 'text/plain'});
						}
					} catch (error) {
						console.error('Error parsing POST data:', error);
						res.writeHead(400, {'Content-Type': 'text/plain'});
						res.end('Invalid JSON\n');
					}
				});
				return;
			} else if (req.method === 'GET' && req.url === '/ping'){
				//Handle ping request
				res.writeHead(200, {'Content-Type': 'text/plain'});
				res.end('pong');
				return;
			}
		});
		server.on('error', (err:any) => {
			if (err.code === 'EADDRINUSE') {
				portIndex++;
				if (portIndex < serverPorts.length) {
					serverPort = serverPorts[portIndex];
					listen(serverPort);
				} else {
					vscode.window.showErrorMessage(`Snakemaker: could not start server, all supported ports are busy. Please free one of these ports and restart VSCode: ${serverPorts}.`);
				}
			}
		});
	}
	listen(serverPort);

	context.subscriptions.push({ dispose: () => server.close() });

	//If first time extension opened, ask for opt-in to logging
	const currentVersion = context.extension.packageJSON.version as string;
	const lastVersion = context.globalState.get("version") as string ?? "0.0.0";
	if (lastVersion !== currentVersion) {
		context.globalState.update("version", currentVersion);
		vscode.commands.executeCommand('snkmaker-open-readme');
		vscode.window.showInformationMessage(
			"Welcome to Snakemaker! Please consider enabling logging to help us improve the extension.",
			"Enable logging" 
		).then((selection) => {
			if (selection === "Enable logging") {
				//Open VSCode settings
				vscode.commands.executeCommand("workbench.action.openSettings", "snakemaker.allowLogging");
			}
		});
	}


}

// This method is called when your extension is deactivated
export function deactivate() {
	
}
