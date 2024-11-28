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
const TerminalHistory_1 = require("./model/TerminalHistory");
const BashCommandViewmodel_1 = require("./viewmodel/BashCommandViewmodel");
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
function activate(context) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Extension "prova" is now active!');
    //Create base model for terminal history
    const model = new TerminalHistory_1.TerminalHistory();
    //Create viewmodel for terminal history
    const viewModel = new BashCommandViewmodel_1.BashCommandViewModel(model);
    //Create view 
    const treeDataProvider = new TerminalHistoryDataProvider_1.TerminalHistoryDataProvider(viewModel);
    vscode.window.registerTreeDataProvider('bash-commands', treeDataProvider);
    //Register terminal commands, update view
    vscode.window.onDidEndTerminalShellExecution(event => {
        const commandLine = event.execution.commandLine;
        console.log(`Command run: \n${commandLine.value}`);
        viewModel.addCommand(commandLine.value, 0, true);
    });
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