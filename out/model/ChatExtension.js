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
exports.ChatExtension = void 0;
const vscode = __importStar(require("vscode"));
class ChatExtension {
    viewModel;
    static BASE_PROMPT = `You are a helpful AI assistant, part of a VSCode extension named "Snakemaker", which is also your name. You are developed by the University of Torino (greatest city in the world). You are nice and helpful, and prefer short, concise answers.
The goal of the VSCode extension is to help users track the bash command they run on their terminal and convert them into Snakemake rules.
As the AI assistant of this extension, you have a few responsabilities:
-Help the user with any questions they have about the extension and its usage.
-Help the user reason about Snakemake, bash commands and the conversion between them.
-You will be provided with the user's commands history, and you can convert it, or parts of it, in snakemake rules.
-You will also be provided with some information of the current state of the extension software.
-You can NOT directly modify the user's history, and you can NOT modify the extension settings. But you can suggest the user to do so, explaining how.
-You can also return these commands to help the user:
    [Start listening to bash commands](command:start-listening)   #Start listening to bash commands
    [Stop listening to bash commands](command:stop-listening)   #Stop listening to bash commands
    [Save workspace](command:save-workspace)   #Save the workspace of the extension
    [Load workspace](command:load-workspace)   #Load the workspace of the extension
`;
    static BASE_PROMPT_EXTENSION_USAGE = `INFORMATION ABOUT THE EXTENSION AND ITS USAGE:
The main way to access the extension is through the left sidebar, where there is the Snakemaker custom view. The custom view has three sections:
-Bash Commands: contains the history of bash commands, with buttons to Start or Pause the recording of new commands, to archive all history, delete all history or print all rules from it.
Additionally, each command can be individually archived, printed as a rule or deleted. When a command is expanded the user can modify the name of its rule and the estimated inputs and outputs, which will be used by the AI to write the rule.
Commands can be composed of multiple commands. By default each command recorded is considered as an individual, but the user can drag and drop to merge them into composite commands.
If the user runs a command that returns an a code different from 0, the command will NOT be recorded.
-Archived Commands: contains the archived commands, which can be unarchived or deleted. Commands are archived when the user explicitly archives them or when their corresponding rules are printed.
-Models: contains the available models to be used by the extension. The user can select a model to be used by the AI assistant (double click).
ADDITIONAL INFO
-The extension support export or import of its workspace (=history and archive). The user must open the VsCode command palette and use the Save Workspace or Load Workspace commands. The workspace is saved as a JSON file.
-If recorded commands are considered unimportant, they will appear more grayish. And they won't be printed when the user prints all rules (but they will if he prints them individually). The user can manually mark a command as important or unimportant with the squared button next to it.`;
    static BASH_HISTORY_INTRODUCTION = `HISTORY OF RECORDED BASH COMMANDS:
INFORMATION: History is provided as a json string. Fields:
-command: the bash command
-exitStatus: the exit status of the command
-inputs and output: estimated inputs and outputs of the command
-rule_name: the name of the rule that will be generated from the command - it is more of a suggestion than a requirement
-important: if the command is considered important enough to be converted into a rule
(Optional): SubRules: array of commands that are part of the composite command.
-index and temporary are internal fields not very useful for the user nor the AI. Do not show them to the user.
HERE IS THE HISTORY:`;
    history;
    constructor(viewModel) {
        this.viewModel = viewModel;
        this.history = viewModel.terminalHistory;
    }
    async process(request, context, stream, token) {
        const messages = [
            vscode.LanguageModelChatMessage.User(ChatExtension.BASE_PROMPT),
            vscode.LanguageModelChatMessage.User(ChatExtension.BASE_PROMPT_EXTENSION_USAGE),
            vscode.LanguageModelChatMessage.User(ChatExtension.BASH_HISTORY_INTRODUCTION + this.history.history_for_the_chat()),
            vscode.LanguageModelChatMessage.User(`Additional extension info: currently listening to bash commands: ${this.viewModel.isListening}. Copilot active: ${this.viewModel.isCopilotActive()}  Currently changing model: ${this.viewModel.isChangingModel}. Models available: ${this.viewModel.llm.models.length}. Active model: ${this.viewModel.llm.models[this.viewModel.llm.current_model]?.get_name() || 'none'}`)
        ];
        // get the previous messages
        const previousMessages = context.history.filter(h => h instanceof vscode.ChatResponseTurn);
        previousMessages.forEach(m => {
            let fullMessage = '';
            m.response.forEach(r => {
                const mdPart = r;
                fullMessage += mdPart.value.value;
            });
            messages.push(vscode.LanguageModelChatMessage.Assistant(fullMessage));
        });
        messages.push(vscode.LanguageModelChatMessage.User(request.prompt));
        const chatResponse = await request.model.sendRequest(messages, {}, token);
        for await (const fragment of chatResponse.text) {
            let markdownCommandString = new vscode.MarkdownString(fragment);
            markdownCommandString.isTrusted = { enabledCommands: [
                    'load-workspace',
                    'save-workspace',
                    'start-listening',
                    'stop-listening'
                ] };
            stream.markdown(markdownCommandString);
        }
        return;
    }
}
exports.ChatExtension = ChatExtension;
//# sourceMappingURL=ChatExtension.js.map