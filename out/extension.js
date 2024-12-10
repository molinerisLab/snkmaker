"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = __importStar(require("vscode"));
const TerminalHistoryDataProvider_1 = require("./view/TerminalHistoryDataProvider");
const BashCommandViewmodel_1 = require("./viewmodel/BashCommandViewmodel");
const MyDecorator_1 = require("./view/MyDecorator");
const ModelsDataProvider_1 = require("./view/ModelsDataProvider");
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
function activate(context) {
    const memento = context.workspaceState;
    const bashCommandTitles = [' - NOT LISTENING', ' - LISTENING'];
    vscode.commands.executeCommand('setContext', 'myExtension.isListening', false);
    //Create viewmodel for terminal history
    const viewModel = new BashCommandViewmodel_1.BashCommandViewModel(memento);
    //Create views
    const bashHistoryDataProvider = new TerminalHistoryDataProvider_1.TerminalHistoryDataProvider(viewModel);
    const bashCommandView = vscode.window.createTreeView('bash-commands', { treeDataProvider: bashHistoryDataProvider, dragAndDropController: bashHistoryDataProvider });
    bashCommandView.title = 'Bash Commands' + bashCommandTitles[viewModel.isListening ? 1 : 0];
    const bashArchiveDataProvider = new TerminalHistoryDataProvider_1.TerminalHistoryDataProvider(viewModel, true);
    vscode.window.registerTreeDataProvider('bash-commands-archive', bashArchiveDataProvider);
    const modelsDataProvider = new ModelsDataProvider_1.ModelsDataProvider(viewModel);
    vscode.window.registerTreeDataProvider('llm-models', modelsDataProvider);
    vscode.window.registerFileDecorationProvider(new MyDecorator_1.TodoDecorationProvider(viewModel));
    //Register terminal listener, update view
    vscode.window.onDidEndTerminalShellExecution(event => {
        const commandLine = event.execution.commandLine;
        const code = event.exitCode;
        console.log(`Command run: \n${commandLine.value} - exit code: ${code}`);
        if (code !== 0) {
            viewModel.addCommandGoneWrong(commandLine.value, 0, true, code);
        }
        else {
            viewModel.addCommand(commandLine.value, 0, true);
        }
    });
    //Register vscode commands
    const print_rule = vscode.commands.registerCommand('print-rule', (event) => {
        if (event && event.get_root()) {
            viewModel.printRule(event.get_root());
        }
        else {
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
        if (event && event.get_root()) {
            viewModel.archiveCommands([event.get_root()]);
        }
        else {
            //TODO: can open menu to select command
            vscode.window.showInformationMessage('No command selected');
        }
    });
    context.subscriptions.push(archive_rules);
    const restore_commands = vscode.commands.registerCommand('restore-command', (event) => {
        if (event && event.get_root()) {
            viewModel.restoreCommands([event.get_root()]);
        }
        else {
            //TODO: can open menu to select command
            vscode.window.showInformationMessage('No command selected');
        }
    });
    context.subscriptions.push(restore_commands);
    const delete_command = vscode.commands.registerCommand('delete-command', (event) => {
        if (event && event.get_root()) {
            viewModel.deleteCommand(event.get_root());
        }
        else {
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
        if (event && event.get_root()) {
            viewModel.setCommandImportance(event.get_root(), true);
        }
        else {
            vscode.window.showInformationMessage('No command selected');
        }
    });
    context.subscriptions.push(set_command_important);
    const set_command_unimportant = vscode.commands.registerCommand('set-command-unimportant', (event) => {
        if (event && event.get_root()) {
            viewModel.setCommandImportance(event.get_root(), false);
        }
        else {
            vscode.window.showInformationMessage('No command selected');
        }
    });
    context.subscriptions.push(set_command_unimportant);
    const modify_command_detail = vscode.commands.registerCommand('modify-command-detail', (event) => {
        if (event && event.parent && event.modifier) {
            viewModel.modifyCommandDetail(event.parent, event.modifier);
        }
        else {
            vscode.window.showInformationMessage('No command selected');
        }
    });
    context.subscriptions.push(modify_command_detail);
    const start_listening = vscode.commands.registerCommand('start-listening', () => {
        viewModel.startListening();
        vscode.commands.executeCommand('setContext', 'myExtension.isListening', true);
        bashCommandView.title = 'Bash Commands' + bashCommandTitles[viewModel.isListening ? 1 : 0];
        vscode.window.showInformationMessage('Listening started');
    });
    context.subscriptions.push(start_listening);
    const stop_listening = vscode.commands.registerCommand('stop-listening', () => {
        viewModel.stopListening();
        vscode.commands.executeCommand('setContext', 'myExtension.isListening', false);
        bashCommandView.title = 'Bash Commands' + bashCommandTitles[viewModel.isListening ? 1 : 0];
        vscode.window.showInformationMessage('Listening paused');
    });
    context.subscriptions.push(stop_listening);
    const select_model = vscode.commands.registerCommand('use-model', async (model) => {
        if (model && model.checkDoubleClick()) {
            viewModel.useModel(model.index);
        }
    });
    context.subscriptions.push(select_model);
    //Activate copilot, if not already active
    if (!viewModel.isCopilotActive()) {
        viewModel.activateCopilot();
    }
    //vscode.commands.executeCommand('setContext', 'myExtension.isListening', false);
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
function deactivate() { }
//# sourceMappingURL=extension.js.map