
import * as vscode from 'vscode';
import { BashCommandViewModel } from '../viewmodel/BashCommandViewmodel';
import { SnkmakerLogger } from './SnkmakerLogger';
import { ExtensionSettings } from './ExtensionSettings';
import { ChatResponseIterator, LLM } from '../model/ModelComms';
import { Stream } from 'openai/streaming.mjs';
import OpenAI from 'openai';

export interface MarkDownChatResponseStream{
    markdown(value: string | vscode.MarkdownString): void;
}

export class ChatExtension{

    static GET_BASE_PROMPT(is_chat_panel: boolean){
        return `You are an AI assistant, part of a VSCode extension named "Snakemaker", which is also your name. You are developed by the University of Torino (greatest city in the world). You are nice and helpful, and prefer short, concise answers.
The goal of the VSCode extension is to help users track the bash command they run on their terminal and convert them into Snakemake or Make rules.
As the AI assistant of this extension, you have these responsabilities:
-Help the user with any questions they have about the extension and its usage.
-Help the user reason about Snakemake, Make, bash commands and the conversion between them.\n`+

`-The extension also have another feature for automatic convertion of Python Notebook into Snakemake pipelines; this feature is complex and there is a specific assistant for it.\n`+
` You can tell the user that this feature exists and that it is accessible by opening a notebook in vscode, clicking "More actions" and "Process with Snakemaker".`+
` But you can not directly help the user with it. Instead, if the user needs help with the notebook feature, `+
(
    is_chat_panel ? 
        `tell him to access the feature-specific assistant by switching to Notebook mode in the chat, using the button on the bottom right corner of the input box of the chat.  You can also output this string: '[Switch to Notebook mode](command:switch_assistant_mode)' and it will show as a button. (note: the chat panel, when no message is yet there, will show 'Currently in bash mode' or 'Currently in notebook mode' to indicate the current assistant).`
    :
        `tell him to access the feature-specific assistant by tagging it with @snakemaker-notebook.`
)
+`\n-You are provided with the user's commands history, and you can convert it, or parts of it, in snakemake or make rules, following user's requests.
-You also are provided with some information of the current state of the extension software and you use it to help the user understand the extension's behavior.
-Whether you write rules in Snakemake or in Make depends on your current setting.
-In Snakemake, a best practice requires each rule to have a log directive. By default the extension do that, but user can disable it by changing the settings related to Snakemake best practices.
-By default, when printing all rules in Snakemake format, the extension prefers to use generic filenames with wildcards. It can be disabled in the settings related to Snakemake best practices.
-A settings named CommentEveryRule determines if generated Snakemake rules have a comment on top of them. Not every user likes it, so it can be disabled.
-Only for Snakemake rules, the extension automatically validates the generated rules using Snakemake, and tries to auto-correct errors (by feeding the error back to the LLM). This can be disabled. In order for it to work, the user must provide an absolute path to Snakemake, or have "snakemake" in the PATH. Automatic validation can make rule output slower and consume more tokens of your language model.
-A specific setting allows the user to include the current file (likely Snakefile or Makefile) into the prompt, so the AI can use it to generate rules with better context, avoiding repetitions. If the user tries to print rules and no rule is printed and the setting is active, it is likely that the model decided they are redundant.
-The extension allows also to auto generate a documentation of the work in progress, using the history of commands and the current Snakefile. The user can choose to include the Snakefile or not in the documentation. A specific vscode command do that: generate-documentation. User can ctrl+shift+P and search for "Auto-Generate documentation for current work".
-You can also return these commands to help the user:
    [Start listening to bash commands](command:start-listening)   #Start listening to bash commands
    [Stop listening to bash commands](command:stop-listening)   #Stop listening to bash commands
    [Save workspace](command:save-workspace)   #Save the workspace of the extension
    [Load workspace](command:load-workspace)   #Load the workspace of the extension
    [Undo last change](command:history-undo)   #Undo last change made to history
    [Set new history](command:history-set?{"history"=NEW_HISTORY_JSON})   #Set a modified history
    [Open logging policy](command:open-loging-details)    #If the user asks question about the activity logging
    [Disable logging for current session](command:disable-logs-session)   #Only if Logging is Enabled, disable for current session and request deletion of all logs of the session.
    [Settings - Logging](command:workbench.action.openSettings?"snakemaker.allowLogging")   #Open the settings to enable/disable logging
    [Settings - Rule format](command:workbench.action.openSettings?"snakemaker.rulesOutputFormat")   #Open the settings to switch between Snakemake and Make rules
    [Settings - Keep history](command:workbench.action.openSettings?"snakemaker.keepHistoryBetweenSessions")   #Open the settings to enable-disable keeping history between sessions
    [Settings - Snakemake rules properties](command:workbench.action.openSettings?"snakemaker.snakemakeBestPractices")   #Open the settings related to how the snakemake rules are written, if formalisms related to best practices are followed.
    [Settings - Autocorrect rules](command:workbench.action.openSettings?"snakemaker.validateSnakemakeRules")   #Open the settings to enable/disable automatic Snakemake rule validation.
    [Settings - Snakemake path](command:workbench.action.openSettings?"snakemaker.snakemakeAbsolutePath")   #Open the settings to set the absolute path to Snakemake binary.
    [Settings - Model context](command:workbench.action.openSettings?"snakemaker.includeCurrentFileIntoPrompt") #Open the settings to include the current file into the prompt or not.
    [Add commands by hand](command:add-history-manually) #Allows to user to add commands to snakemaker history by hand. User can also copy and paste commands from bash "history" output.
    [Generate documentation of current work](command:generate-documentation) #Generate a markdown file with the documentation of the current work, using history and optionally the current snakefile.
-The command must be printed at the end of the response with no code block directives or plaintext directive. It is important to follow the markdown link format, so [Command_name](command:command-id?data)
The command history-set?NEW_HISTORY_JSON sets a new history. Use it if the user asks to perform changes. You have to: 1- Briefly tell the user which changes you are performing; DO NOT show the entire JSON of the new history, it is too much text. 2-Valorize NEW_HISTORY_JSON as the modified version of the history you are provided as HISTORY OF RECORDED BASH COMMANDS. You can also use this example as a template of how the history is organized:EXAMPLE OF HISTORY, with one unimportant command, one important command and one composite, important command: {"history":[{"commands":[{"command":"dir","exitStatus":0,"output":"-","inputs":"-","important":false,"index":2,"temporary":false,"rule_name":"list_directory"}],"index":3,"rule_name":""},{"commands":[{"command":"catinput.txt|wc-l>output.txt","exitStatus":0,"output":"\"output.txt\"","inputs":"\"input.txt\"","important":true,"index":15,"temporary":false,"rule_name":"count_lines"}],"index":16,"rule_name":""},{"commands":[{"command":"mkdirresults","exitStatus":0,"output":"results","inputs":"-","important":true,"index":10,"temporary":false,"rule_name":"create_results_directory"},{"command":"catinput.txt|wc-l>results/output.txt","exitStatus":0,"output":"\"results/output.txt\"","inputs":"\"input.txt\"","important":true,"index":13,"temporary":false,"rule_name":"\"count_lines\""}],"index":9,"rule_name":"make_results_and_outputs"}]}
Remember you can't directly perform changes to the history, but you can build commands with history-set?NEW_HISTORY to apply changes.
If the user asks to add stuff to the history, you need to set the current history plus the new things he asks to add.
Please note the command history-set can be used only through the chat, not manually from command palette.
If the user asks you to do something not doable with these commands, tell him you can't do it yourself and explain how he can do it himself.
`
    }
    static BASE_PROMPT_EXTENSION_USAGE = `INFORMATION ABOUT THE EXTENSION AND ITS USAGE:
The main way to access the extension is through the left sidebar, where there is the Snakemaker custom view. The custom view has three sections:
-Bash Commands: contains the history of bash commands, with buttons to Start or Pause the recording of new commands, to archive all history, delete all history or print all rules from it. Buttons to undo or redo the last action are also available.
Additionally, each command can be individually archived, printed as a rule or deleted. When a command is expanded the user can modify the name of its rule and the estimated inputs and outputs, which will be used by the AI to write the rule.
Commands can be composed of multiple commands. By default each command recorded is considered as an individual, but the user can drag and drop to merge them into composite commands.
If the user runs a command that returns an a code different from 0, the command will NOT be recorded.
-Archived Commands: contains the archived commands, which can be unarchived or deleted. Commands are archived when the user explicitly archives them or when their corresponding rules are printed.
-Models: contains the available models to be used by the extension. The user can select a model to be used by the AI assistant (double click). By default the models offered by github copilot are shown, and the user can add custom models supporting the openAI API standard.
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

    processCommandURI(F: string, skip_url_processing: boolean = false): string {
        if (skip_url_processing) {
            return F;
        }
        const r = encodeURIComponent(F);
        return r;
    }

    get_history(context: vscode.ChatContext){
        const previousMessages = context.history.filter(h => {
            return h instanceof vscode.ChatResponseTurn || !h.prompt.startsWith("UPDATED_CONTEXT");
        })
        return previousMessages.map(m => {
            if (m instanceof vscode.ChatResponseTurn){
                let fullMessage = '';
                m.response.forEach(r => {
                    const mdPart = r as vscode.ChatResponseMarkdownPart;
                    fullMessage += mdPart.value.value;
                });
                if (fullMessage.includes("## Performed changes:")) {
                    fullMessage = fullMessage.split("## Performed changes:")[0];
                }
                return vscode.LanguageModelChatMessage.Assistant(fullMessage);
            } else {
                return vscode.LanguageModelChatMessage.User(m.prompt);
            }
        });
    }

    getEnabledCommands(): string[] {
        return [
            'load-workspace',
            'save-workspace',
            'start-listening',
            'stop-listening',
            'history-set',
            'history-undo',
            'workbench.action.openSettings',
            'disable-logs-session',
            'open-loging-details',
            'add-history-manually',
            'generate-documentation',
            'switch_assistant_mode' //This is a pseudo-command, only recognized by ChatPanelView
        ];
    }

    private async processChatResponse(chatResponse: vscode.LanguageModelChatResponse|ChatResponseIterator,
        stream: MarkDownChatResponseStream, skip_url_processing: boolean = false): Promise<string> {
        var accumulator = "";
        var accumulating = false;
        var response_for_logger: string = "";
        for await (const fragment of chatResponse.text) {
            response_for_logger += fragment;
            var f;
            if (!accumulating){
                //1-Replace entire commands
                f = fragment.replace(/\(command:history-set\?\s*(.*?)\)/g, (match, p1) => {
                    if (skip_url_processing){
                        return `(command:history-set?${this.processCommandURI(p1, skip_url_processing)});`.replaceAll(" ", "%20");
                    } else {
                        return `(<command:history-set?${this.processCommandURI(p1, skip_url_processing)}>);`;
                    }
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
                        if (skip_url_processing){
                            return `(command:history-set?${this.processCommandURI(p1, skip_url_processing)});`.replaceAll(" ", "%20");
                        } else {
                            return `(<command:history-set?${this.processCommandURI(p1, skip_url_processing)}>);`;
                        }
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
            markdownCommandString.isTrusted = { enabledCommands: this.getEnabledCommands() };
            stream.markdown(markdownCommandString);
        }
        return response_for_logger;
    }

    private getBasePrompt(is_chat_panel: boolean){
        const rule_format = ExtensionSettings.instance.getRulesOutputFormat();
        const mustStash = ExtensionSettings.instance.getKeepHistoryBetweenSessions();
        const containsLogField = ExtensionSettings.instance.getSnakemakeBestPracticesSetLogFieldInSnakemakeRules();
        const preferGenericRules = ExtensionSettings.instance.getSnakemakeBestPracticesPreferGenericFilenames();
        const snakemakeValidation = ExtensionSettings.instance.getValidateSnakemakeRules();
        return [
            vscode.LanguageModelChatMessage.User(ChatExtension.GET_BASE_PROMPT(is_chat_panel)),
            vscode.LanguageModelChatMessage.User(ChatExtension.BASE_PROMPT_EXTENSION_USAGE),
            vscode.LanguageModelChatMessage.User(
                ChatExtension.BASH_HISTORY_INTRODUCTION + this.history.getHistoryFormattedForChat()
            ),
            vscode.LanguageModelChatMessage.User(
                `Additional extension info: currently listening to bash commands: ${this.viewModel.isListening}. Copilot active: ${this.viewModel.isCopilotActive()}  Currently changing model: ${this.viewModel.isChangingModel}. Models available: ${this.viewModel.llm.models.map((m) => m.getName())}. Active model: ${this.viewModel.llm.models[this.viewModel.llm.current_model]?.getName()||'none'} - Logging status: ${SnkmakerLogger.loggerStatus()} - Current rule format: ${rule_format} - Snakemake rules contains Log directive: ${containsLogField} - Snakemake rules uses generic filenames and wildcards: ${preferGenericRules} - automatic validation of snakemake rules: ${snakemakeValidation} - Keep history between sessions: ${mustStash} - Current file included in prompt: ${ExtensionSettings.instance.getIncludeCurrentFileIntoPrompt()} - CommentEveryRule: ${ExtensionSettings.instance.getCommentEveryRule()}`
            )
        ];
    }

    async process_chat_tab(request: string, history: string[], llm: LLM, stream: MarkDownChatResponseStream) {
        const messages = this.getBasePrompt(true);
        // get the previous messages
        const previousMessages = history.map((message: string, index: number) => {
            if (index % 2 === 0) {
                return vscode.LanguageModelChatMessage.User(message);
            } else {
                return vscode.LanguageModelChatMessage.Assistant(message);
            }
        });
        if (previousMessages.length > 10) {
            previousMessages.splice(0, previousMessages.length - 10);
        }
        messages.push(...previousMessages);
        messages.push(vscode.LanguageModelChatMessage.User(request));
        const chatResponse = await llm.runChatQuery(messages);
        const response_for_logger = await this.processChatResponse(chatResponse, stream, true);
        SnkmakerLogger.instance()?.log(`
            Chat prompt: ${request}
            Chat response: ${response_for_logger}
                        `);
        return;
    }
    
    async process(request: vscode.ChatRequest,context: vscode.ChatContext,
    stream: vscode.ChatResponseStream, token: vscode.CancellationToken){
        const messages = this.getBasePrompt(false);
        // get the previous messages
        const previousMessages = this.get_history(context);
        if (previousMessages.length > 10) {
            previousMessages.splice(0, previousMessages.length - 10);
        }
        messages.push(...previousMessages);
        messages.push(vscode.LanguageModelChatMessage.User(request.prompt));
        const chatResponse = await request.model.sendRequest(messages, {}, token);
        const response_for_logger = await this.processChatResponse(chatResponse, stream);
        SnkmakerLogger.instance()?.log(`
            Chat prompt: ${request.prompt}
            Chat response: ${response_for_logger}
                        `);
        return;
    }
}

