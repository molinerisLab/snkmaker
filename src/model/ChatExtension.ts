
import * as vscode from 'vscode';
import { TerminalHistory } from './TerminalHistory';
import { BashCommandViewModel } from '../viewmodel/BashCommandViewmodel';

export class ChatExtension{

    static BASE_PROMPT = `You are an AI assistant, part of a VSCode extension named "Snakemaker", which is also your name. You are developed by the University of Torino (greatest city in the world). You are nice and helpful, and prefer short, concise answers.
The goal of the VSCode extension is to help users track the bash command they run on their terminal and convert them into Snakemake rules.
As the AI assistant of this extension, you have these responsabilities:
-Help the user with any questions they have about the extension and its usage.
-Help the user reason about Snakemake, bash commands and the conversion between them.
-You are provided with the user's commands history, and you can convert it, or parts of it, in snakemake rules, following user's requests.
-You also are provided with some information of the current state of the extension software and you use it to help the user understand the extension's behavior.
-You can also return these commands to help the user:
    [Start listening to bash commands](command:start-listening)   #Start listening to bash commands
    [Stop listening to bash commands](command:stop-listening)   #Stop listening to bash commands
    [Save workspace](command:save-workspace)   #Save the workspace of the extension
    [Load workspace](command:load-workspace)   #Load the workspace of the extension
    [Undo last change](command:history-undo)   #Undo last change made to history
    [Set new history](command:history-set?{"history"=NEW_HISTORY_JSON})   #Set a modified history
The command history-set?NEW_HISTORY_JSON sets a new history. Use it if the user asks to perform changes. You have to: 1- Tell the user which changes you are performing - do not show the entire JSON with the new history but explain which things you're modifying. 2-Valorize NEW_HISTORY_JSON as the modified version of the history you are provided as HISTORY OF RECORDED BASH COMMANDS
If the user asks you to do something not doable with these commands, tell him you can't do it yourself and explain how he can do it himself.
`;
    static BASE_PROMPT_EXTENSION_USAGE = `INFORMATION ABOUT THE EXTENSION AND ITS USAGE:
The main way to access the extension is through the left sidebar, where there is the Snakemaker custom view. The custom view has three sections:
-Bash Commands: contains the history of bash commands, with buttons to Start or Pause the recording of new commands, to archive all history, delete all history or print all rules from it. Buttons to undo or redo the last action are also available.
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

    private history;

    constructor(private viewModel: BashCommandViewModel) {
        this.history = viewModel.terminalHistory;
    }

    async processT(request: vscode.ChatRequest,context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,token: vscode.CancellationToken){
        
        const T = [
            "[Start listening to bash commands](command:start-listening) \n",
            `\n [Set new history](command:history-set?%7B%22history%22%3A%5B%7B%22commands%22%3A%5B%7B%22command%22%3A%22ls%20-lh%22%2C%22exitStatus%22%3A0%2C%22output%22%3A%22-%22%2C%22inputs%22%3A%22-%22%2C%22important%22%3Atrue%2C%22index%22%3A4%2C%22temporary%22%3Afalse%2C%22rule_name%22%3A%22list_files%22%7D%5D%2C%22index%22%3A5%2C%22rule_name%22%3A%22%22%7D%5D%7D)`,
            //`\n [Set new history](command:history-set?{"history":[{"commands":[{"command":"dir","exitStatus":0,"output":"-","inputs":"-","important":true,"index":13,"temporary":false,"rule_name":"CIAO"}],"index":14,"rule_name":""},{"commands":[{"command":"ls -lh","exitStatus":0,"output":"-","inputs":"-","important":false,"index":16,"temporary":false,"rule_name":"list_files"},{"command":"cd DO_STUFF/","exitStatus":0,"output":"-","inputs":"-","important":false,"index":18,"temporary":false,"rule_name":"change_directory"},{"command":"clear","exitStatus":0,"output":"-","inputs":"-","important":true,"index":15,"temporary":false,"rule_name":"clear_screen"}],"index":17,"rule_name":"list_and_change_directory"}]})`
        ];
        for (const fragment of T){
            let markdownCommandString: vscode.MarkdownString = new vscode.MarkdownString(fragment);
                markdownCommandString.isTrusted = { enabledCommands: [
                    'load-workspace',
                    'save-workspace',
                    'start-listening',
                    'stop-listening',
                    'history-set',
                ] };
                stream.markdown(markdownCommandString);
        }
    }

    findUnmatchedCommand(F: string):number {
        const command = "(command:history-set?";
        for (let i = 1; i <= command.length; i++) {
          if (F.endsWith(command.slice(0, i))) {
            return F.length - i;
          }
        }
        const regex = /\(command:history-set\?/g;
        let match;
        while ((match = regex.exec(F)) !== null) {
          const startIndex = match.index + match[0].length;
          let depth = 1;
          for (let i = startIndex; i < F.length; i++) {
            if (F[i] === '(') {depth++;}
            else if (F[i] === ')') {depth--;}
            if (depth === 0) {break;}
          }
          if (depth !== 0) {
            return match.index;
          }
        }
        return -1;
      }

    processCommandURI(F: string){
        console.log(F);
        const r = encodeURIComponent(F);
        console.log(r);
        return r;
    }
    
    async process(request: vscode.ChatRequest,context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,token: vscode.CancellationToken){

        const messages = [
            vscode.LanguageModelChatMessage.User(ChatExtension.BASE_PROMPT),
            vscode.LanguageModelChatMessage.User(ChatExtension.BASE_PROMPT_EXTENSION_USAGE),
            vscode.LanguageModelChatMessage.User(
                ChatExtension.BASH_HISTORY_INTRODUCTION + this.history.history_for_the_chat()
            ),
            vscode.LanguageModelChatMessage.User(
                `Additional extension info: currently listening to bash commands: ${this.viewModel.isListening}. Copilot active: ${this.viewModel.isCopilotActive()}  Currently changing model: ${this.viewModel.isChangingModel}. Models available: ${this.viewModel.llm.models.length}. Active model: ${this.viewModel.llm.models[this.viewModel.llm.current_model]?.get_name()||'none'}`
            )
        ];
        // get the previous messages
        const previousMessages = context.history.filter(h => h instanceof vscode.ChatResponseTurn);
        previousMessages.forEach(m => {
            let fullMessage = '';
            m.response.forEach(r => {
                const mdPart = r as vscode.ChatResponseMarkdownPart;
                fullMessage += mdPart.value.value;
            });
            messages.push(vscode.LanguageModelChatMessage.Assistant(fullMessage));
        });

        messages.push(vscode.LanguageModelChatMessage.User(request.prompt));
        const chatResponse = await request.model.sendRequest(messages, {}, token);
        var accumulator = "";
        var accumulating = false;
        
        for await (const fragment of chatResponse.text) {
            var f;
            if (!accumulating){
                //1-Replace entire commands
                f = fragment.replace(/\(command:history-set\?\s*(.*?)\)/g, (match, p1) => {
                  return `(command:history-set?${this.processCommandURI(p1)});`;
                }); 
                //Check if there is a substring of the command
                const unmatched = this.findUnmatchedCommand(f);
                if (unmatched !== -1) {
                  accumulator = f.slice(unmatched);
                  f = f.slice(0, unmatched);
                  accumulating = true;
                }
            } else {
                accumulator += fragment;
                if (/\(command:history-set\?\s*(.*?)\)/g.test(accumulator)) {
                    f = accumulator.replace(/\(command:history-set\?\s*(.*?)\)/g, (match, p1) => {
                        return `(command:history-set?${this.processCommandURI(p1)});`;
                    }); 
                    //Check if there is a substring of the command
                    const unmatched = this.findUnmatchedCommand(f);
                    if (unmatched !== -1) {
                        accumulator = f.slice(unmatched);
                        f = f.slice(0, unmatched);
                        accumulating = true;
                    } else {
                        accumulating = false;
                        accumulator = "";
                    }
                } else if (this.findUnmatchedCommand(accumulator) === -1) {
                    f = accumulator;
                    accumulating = false;
                    accumulator = "";
                } else {
                    continue;
                }
            }

            let markdownCommandString: vscode.MarkdownString = new vscode.MarkdownString(f);
            markdownCommandString.isTrusted = { enabledCommands: [
                'load-workspace',
                'save-workspace',
                'start-listening',
                'stop-listening',
                'history-set',
                'history-undo'
            ] };
            stream.markdown(markdownCommandString);
        }
        return;
    }
}

