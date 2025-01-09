
import * as vscode from 'vscode';
import { TerminalHistory } from './TerminalHistory';
import { BashCommandViewModel } from '../viewmodel/BashCommandViewmodel';
import { SnkmakerLogger } from '../utils/SnkmakerLogger';

export class ChatExtension{

    static BASE_PROMPT = `You are an AI assistant, part of a VSCode extension named "Snakemaker", which is also your name. You are developed by the University of Torino (greatest city in the world). You are nice and helpful, and prefer short, concise answers.
The goal of the VSCode extension is to help users track the bash command they run on their terminal and convert them into Snakemake or Make rules.
As the AI assistant of this extension, you have these responsabilities:
-Help the user with any questions they have about the extension and its usage.
-Help the user reason about Snakemake, Make, bash commands and the conversion between them.
-You are provided with the user's commands history, and you can convert it, or parts of it, in snakemake or make rules, following user's requests.
-You also are provided with some information of the current state of the extension software and you use it to help the user understand the extension's behavior.
-Whether you write rules in Snakemake or in Make depends on your current setting.
-In Snakemake, a best practice requires each rule to have a log directive. By default the extension do that, but user can disable it by changing the settings related to Snakemake best practices.
-You can also return these commands to help the user:
    [Start listening to bash commands](command:start-listening)   #Start listening to bash commands
    [Stop listening to bash commands](command:stop-listening)   #Stop listening to bash commands
    [Save workspace](command:save-workspace)   #Save the workspace of the extension
    [Load workspace](command:load-workspace)   #Load the workspace of the extension
    [Undo last change](command:history-undo)   #Undo last change made to history
    [Set new history](command:history-set?{"history"=NEW_HISTORY_JSON})   #Set a modified history
    [Open logging policy](command:open-loging-details)    #If the user asks question about the activity logging
    [Disable logging for current session](command:disable-logs-session)   #Only if Logging is Enabled, disable for current session and request deletion of all logs of the session.
    [Open settings](command:workbench.action.openSettings?"snakemaker.allowLogging")   #Open the settings to enable/disable logging
    [Open settings](command:workbench.action.openSettings?"snakemaker.rulesOutputFormat")   #Open the settings to switch between Snakemake and Make rules
    [Open settings](command:workbench.action.openSettings?"snakemaker.keepHistoryBetweenSessions")   #Open the settings to enable-disable keeping history between sessions
    [Open settings](command:workbench.action.openSettings?"snakemaker.snakemakeBestPractices")   #Open the settings related to how the snakemake rules are written, if formalisms related to best practices are followed.

The command history-set?NEW_HISTORY_JSON sets a new history. Use it if the user asks to perform changes. You have to: 1- Briefly tell the user which changes you are performing (DO NOT show the entire JSON with the new history, explain briefly which things you're modifying). 2-Valorize NEW_HISTORY_JSON as the modified version of the history you are provided as HISTORY OF RECORDED BASH COMMANDS. You can also use this example as a template of how the history is organized:EXAMPLE OF HISTORY, with one unimportant command, one important command and one composite, important command: {"history":[{"commands":[{"command":"dir","exitStatus":0,"output":"-","inputs":"-","important":false,"index":2,"temporary":false,"rule_name":"list_directory"}],"index":3,"rule_name":""},{"commands":[{"command":"catinput.txt|wc-l>output.txt","exitStatus":0,"output":"\"output.txt\"","inputs":"\"input.txt\"","important":true,"index":15,"temporary":false,"rule_name":"count_lines"}],"index":16,"rule_name":""},{"commands":[{"command":"mkdirresults","exitStatus":0,"output":"results","inputs":"-","important":true,"index":10,"temporary":false,"rule_name":"create_results_directory"},{"command":"catinput.txt|wc-l>results/output.txt","exitStatus":0,"output":"\"results/output.txt\"","inputs":"\"input.txt\"","important":true,"index":13,"temporary":false,"rule_name":"\"count_lines\""}],"index":9,"rule_name":"make_results_and_outputs"}]}
Please note the command history-set can be used only through the chat, not manually from command palette.
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
-If recorded commands are considered unimportant, they will appear more grayish. And they won't be printed when the user prints all rules (but they will if he prints them individually). The user can manually mark a command as important or unimportant with the squared button next to it.
-The extension logs activity to a server to help developers improve it, if the user gave consent. There are 3 possible states of the logger: Enabled (user gave consent, it is sending logs), Disabled (user did not gave consent, not sending logs) and Disabled_in_current_session (user gave consent in the settings but manually disabled logs for current session). Moreover, even if logger is Enabled, if the extension is not recording new commands, it will not send logs.
-The extension support persistent history between sessions. Can be enabled or disabled in settings.`;
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
        const r = encodeURIComponent(F);
        return r;
    }

    async process_TEST(request: vscode.ChatRequest,context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,token: vscode.CancellationToken){
            const prompt = request.prompt;
            const llm = this.viewModel.llm;
            console.log("Prompt: ", prompt);
            const response = await llm.run_query(prompt);
            console.log("Response: ", response);
            let markdownCommandString: vscode.MarkdownString = new vscode.MarkdownString(response);
            stream.markdown(markdownCommandString);
    }
    
    async process(request: vscode.ChatRequest,context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,token: vscode.CancellationToken){
        const rule_format = vscode.workspace.getConfiguration('snakemaker').get('rulesOutputFormat', "Snakemake");
        const mustStash = vscode.workspace.getConfiguration('snakemaker').get('keepHistoryBetweenSessions', false);
        const containsLogField = vscode.workspace.getConfiguration('snakemaker').get('snakemakeBestPracticesSetLogFieldInSnakemakeRules', false);
        const messages = [
            vscode.LanguageModelChatMessage.User(ChatExtension.BASE_PROMPT),
            vscode.LanguageModelChatMessage.User(ChatExtension.BASE_PROMPT_EXTENSION_USAGE),
            vscode.LanguageModelChatMessage.User(
                ChatExtension.BASH_HISTORY_INTRODUCTION + this.history.history_for_the_chat()
            ),
            vscode.LanguageModelChatMessage.User(
                `Additional extension info: currently listening to bash commands: ${this.viewModel.isListening}. Copilot active: ${this.viewModel.isCopilotActive()}  Currently changing model: ${this.viewModel.isChangingModel}. Models available: ${this.viewModel.llm.models.map((m) => m.get_name())}. Active model: ${this.viewModel.llm.models[this.viewModel.llm.current_model]?.get_name()||'none'} - Logging status: ${SnkmakerLogger.logger_status()} - Current rule format: ${rule_format} - Snakemake rules contains Log directive: ${containsLogField} - Keep history between sessions: ${mustStash}`
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
        var response_for_logger: string = "";
        for await (const fragment of chatResponse.text) {
            response_for_logger += fragment;
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
                'history-undo',
                'workbench.action.openSettings',
                'disable-logs-session',
                'open-loging-details'
            ] };
            stream.markdown(markdownCommandString);
        }
        SnkmakerLogger.instance()?.log(`
Chat prompt: ${request.prompt}
Chat response: ${response_for_logger}
            `);
        return;
    }
}

