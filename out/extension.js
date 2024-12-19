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
const ChatExtension_1 = require("./model/ChatExtension");
const Logger_1 = require("./utils/Logger");
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
function activate(context) {
    //Initialize logger
    const logging = vscode.workspace.getConfiguration('snakemaker').get('allowLogging', false);
    console.log('Logging is ' + (logging ? 'enabled' : 'disabled'));
    if (logging) {
        Logger_1.Logger.initialize(context.extension.packageJSON.version);
    }
    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration("snakemaker.allowLogging")) {
            const logging = vscode.workspace.getConfiguration('snakemaker').get('allowLogging', false);
            if (logging) {
                Logger_1.Logger.initialize(context.extension.packageJSON.version);
            }
            else {
                Logger_1.Logger.destroy();
                Logger_1.Logger.disabled_in_session = false; //Disabled globally
            }
        }
    });
    //If first time, ask for opt-in to logging
    const currentVersion = context.extension.packageJSON.version;
    const lastVersion = context.globalState.get("version") ?? "0.0.0";
    if (lastVersion !== currentVersion) {
        context.globalState.update("version", currentVersion);
        vscode.window.showInformationMessage("Welcome to Snakemaker! Please consider enabling logging to help us improve the extension.", "Enable logging").then((selection) => {
            if (selection === "Enable logging") {
                //Open VSCode settings
                vscode.commands.executeCommand("workbench.action.openSettings", "snakemaker.allowLogging");
            }
        });
    }
    //Get memento - workspace saved state
    const memento = context.workspaceState;
    // Set context
    const bashCommandTitles = [' - NOT LISTENING', ' - LISTENING'];
    vscode.commands.executeCommand('setContext', 'myExtension.isListening', false);
    vscode.commands.executeCommand('setContext', 'myExtension.canUndo', false);
    vscode.commands.executeCommand('setContext', 'myExtension.canRedo', false);
    /*
    const hiddenTerminal = new HiddenTerminal();
    const commandInference = new CommandInference(hiddenTerminal);*/
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
        const shell = event.shellIntegration;
        const cwd = shell.cwd;
        if (code !== 0) {
            viewModel.addCommandGoneWrong(commandLine.value, 0, true, code);
        }
        else {
            viewModel.addCommand(commandLine.value, 0, true);
        }
    });
    //Register vscode commands
    const set_history = vscode.commands.registerCommand('history-set', (event) => {
        if (event && event.history) {
            viewModel.setHistory(event.history);
        }
    });
    context.subscriptions.push(set_history);
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
    const save_workspace = vscode.commands.registerCommand('save-workspace', () => {
        vscode.window.showSaveDialog({ title: 'Where to export workspace' }).then(fileInfos => {
            const path = fileInfos?.path;
            viewModel.saveWorkspace(path);
        });
    });
    context.subscriptions.push(save_workspace);
    const load_workspace = vscode.commands.registerCommand('load-workspace', () => {
        //Ask user for confirmation before proceeding
        vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: 'Loading a workspace will overwrite the current one. Proceed?' }).then((value) => {
            if (value === 'Yes') {
                vscode.window.showOpenDialog({ canSelectMany: false, title: 'Load workspace from' }).then(fileInfos => {
                    if (fileInfos && fileInfos.length > 0) {
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
    const disableLogging = vscode.commands.registerCommand('disable-logs-session', () => {
        const logger = Logger_1.Logger.instance();
        if (logger) {
            logger.delete_all_logs().then(() => {
                vscode.window.showInformationMessage('Logger disabled, log session deleted');
            }).catch(() => vscode.window.showInformationMessage('Logger disabled, log session not deleted'));
            Logger_1.Logger.destroy();
        }
        else {
            vscode.window.showInformationMessage('Logger already disabled');
        }
    });
    context.subscriptions.push(disableLogging);
    //Activate copilot, if not already active
    if (!viewModel.isCopilotActive()) {
        viewModel.activateCopilot();
    }
    //Register copilot chat extension
    const chatExtension = new ChatExtension_1.ChatExtension(viewModel);
    const chat_handler = async (request, context, stream, token) => {
        await chatExtension.process(request, context, stream, token);
    };
    const snakemaker = vscode.chat.createChatParticipant('chat-snakemaker', chat_handler);
    snakemaker.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources/icon.svg');
}
// This method is called when your extension is deactivated
function deactivate() { }
//# sourceMappingURL=extension.js.map