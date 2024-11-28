// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { TerminalShellExecutionCommandLine } from 'vscode';
import { TerminalHistoryDataProvider } from './view/TerminalHistoryDataProvider';
import { TerminalHistory } from './model/TerminalHistory';
import { BashCommandViewModel } from './viewmodel/BashCommandViewmodel';
import { TodoDecorationProvider } from './view/MyDecorator';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Extension "prova" is now active!');

	//Create base model for terminal history
	const model = new TerminalHistory();
	//Create viewmodel for terminal history
	const viewModel = new BashCommandViewModel(model);
	//Create views
	const bashHistoryDataProvider = new TerminalHistoryDataProvider(viewModel);
	vscode.window.registerTreeDataProvider('bash-commands',bashHistoryDataProvider);
	const bashArchiveDataProvider = new TerminalHistoryDataProvider(viewModel, true);
	vscode.window.registerTreeDataProvider('bash-commands-archive',bashArchiveDataProvider);
	vscode.window.registerFileDecorationProvider(new TodoDecorationProvider());
	//Register terminal listener, update view
	vscode.window.onDidEndTerminalShellExecution(event => {
		const commandLine = event.execution.commandLine;
		console.log(`Command run: \n${commandLine.value}`);
		viewModel.addCommand(commandLine.value, 0, true);
  	});

	//Register vscode commands
	const print_rule = vscode.commands.registerCommand('print-rule', (event) => {
		if (event && event.bashCommand){
			viewModel.printRule(event.bashCommand);
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
		if (event && event.bashCommand){
			viewModel.archiveCommands([event.bashCommand]);
		} else {
			//TODO: can open menu to select command
			vscode.window.showInformationMessage('No command selected');
		}
	});
	context.subscriptions.push(archive_rules);
	const restore_commands = vscode.commands.registerCommand('restore-command', (event) => {
		if (event && event.bashCommand){
			viewModel.restoreCommands([event.bashCommand]);
		} else {
			//TODO: can open menu to select command
			vscode.window.showInformationMessage('No command selected');
		}
	});
	context.subscriptions.push(restore_commands);
	const delete_command = vscode.commands.registerCommand('delete-command', (event) => {
		if (event && event.bashCommand){
			viewModel.deleteCommand(event.bashCommand);
		} else {
			//TODO: can open menu to select command
			vscode.window.showInformationMessage('No command selected');
		}
	});
	context.subscriptions.push(delete_command);
	const delete_all_commands = vscode.commands.registerCommand('delete-all-commands', () => {
		viewModel.deleteAllCommmands();
	});
	context.subscriptions.push(delete_all_commands);
	const archive_all_commands = vscode.commands.registerCommand('archive-all-commands', () => {
		viewModel.archiveCommands([]);
	});
	context.subscriptions.push(archive_all_commands);
	const set_command_important = vscode.commands.registerCommand('set-command-important', (event) => {
		if (event && event.bashCommand){
			viewModel.setCommandImportance(event.bashCommand, true);
		} else {
			vscode.window.showInformationMessage('No command selected');
		}
	});
	context.subscriptions.push(set_command_important);
	const set_command_unimportant = vscode.commands.registerCommand('set-command-unimportant', (event) => {
		if (event && event.bashCommand){
			viewModel.setCommandImportance(event.bashCommand, false);
		} else {
			vscode.window.showInformationMessage('No command selected');
		}
	});
	context.subscriptions.push(set_command_unimportant);


	//Stupid examples:

	//1-Command from palette example
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	/*const disposable = vscode.commands.registerCommand('prova.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from prova!');
	});
	context.subscriptions.push(disposable);
	*/
	//2- Terminal change callback + execute command example
	/*vscode.window.onDidChangeActiveTerminal(async e => {
		console.log(`Active terminal changed, name=${e ? e.name : 'undefined'}`);
		vscode.window.showInformationMessage('Terminal changed! ' + (e ? e.name : 'undefined'));
		const command = e?.shellIntegration?.executeCommand('echo "Hello world"' );
		const stream = command?.read();
		if (stream){
			for await (const data of stream) {
				console.log(data);
				vscode.window.showInformationMessage(data);
			}
		}
	});*/

	// 3- Callback when command is run, not after
	/*vscode.window.onDidStartTerminalShellExecution(event => {
		const commandLine = event.execution.commandLine;
		console.log(`Command started\n${summarizeCommandLine(commandLine)}`);
	});*/
}

// This method is called when your extension is deactivated
export function deactivate() {}
