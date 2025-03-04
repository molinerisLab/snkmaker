
import * as vscode from 'vscode';
import { BashCommandViewModel } from '../viewmodel/BashCommandViewmodel';
import { SnkmakerLogger } from './SnkmakerLogger';
import { ExtensionSettings } from './ExtensionSettings';
import { Chat } from 'openai/resources/index.mjs';
import { NotebookPresenter } from '../viewmodel/NotebookPresenter';
import { Cell } from '../model/NotebookController';

export class ChatExtensionNotebook{

    static BASE_PROMPT = `MAIN_PROMPT: You are an AI assistant, part of a VSCode extension named "Snakemaker", which is also your name. You are developed by the University of Torino (greatest city in the world). You are nice and helpful, and prefer short, concise answers.
    The goal of the extension is to help users automate the process of building Snakemake pipelines. ` +
    `You are actually the assistant to a specific feature of Snakemaker, the one for converting ` + 
    `Python Notebook into Snakemake pipelines. You help only for that. For request related to the general snakemaker extension or bash commands, tell the user to tag @snakemaker instead, this assistant will help them.`+
    `\nGoal of the Notebook feature: semi-automatic conversion of Notebook into a set of scripts connected with a Snakefile.\n`+
    `How to access feature: Open a Notebook, click on the three dots "More action" and select Process with Snakemaker.\n"`+
    `The feature involves the following steps:\n`+
    `1-Resolving data dependencies between cells. Snakemaker parses variables that each cell reads and writes, and creates a dependency graph.\n`+
    `The user can manually fix the dependencies if needed, and split, merge or delete cells.\n`+
    `2-Decide whether to export each cell as a Rule (produces files, stays in the Snakefile) or a script (is simply imported by others).\n`+
    `3-Automatically generate the Snakefile and additional code in each cell, to read/write files, command line arguments, imports.\n`;

    static BASE_PROMPT_NO_NOTEBOOK_OPENED = `Right now no notebook is opened, or at least not in the tab the user is looking at. Once a notebook is opened, you will have access to it and be able to help the user.`;

    static BASE_PROMPT_FIRST_STEP = `Right now you are in the page where steps 1 and 2 are being managed.\n`+
    "The user is watching the cells and the dependencies between them. The user can: \n"+
    "-Delete, Split or Merge cells.\n"+
    "-Set the type of cell: Rule or Script. Some cells can be Undecided, not a script nor a Rule yet. Cells that depends on data produced by rules can not become scripts.\n"+
    "-Observe, for each cell, what the cell writes, what the cell reads from other cells and what reads as wildcards. Keyword are highlighted in code: Red for missing dependencies, Green for dependencies from cells, Blue for wildcards, Underlined for Writes.\n"+
    "-Manually set a keyword as Write, Dependency or Wildcard by simply selecting it in the text and clicking the button.\n"+
    "-Manually removing Writes, Dependencies and Wildcards using the small x-buttons below the cell code.\n"+
    "Note: for Dependencies, a cell that reads a variable is always connected to the closest previous cell that writes it.\n"+
    "Note: Dependencies and Writes could contain errors that the user might have to fix. For example a missing dependency could be caused by a missed Writes that the user have to add manually.\n"+
    "Note: actual code for importing,reading,writing files etc will be generated later, now the user have to check the data dependencies and decide the state of the cells.\n"+
    "Note: functions are managed differently. They are moved into specific cells. They can have no data dependencies: every dependency they have is added to the function arguments, so the cells that call the function have the responsability to provide the data.\n\n" + 
    "In this step, you help help the user by:\n-Answer his questions about what's going on\n"+
    "-Manually add or remove Dependencies, Writes and Wildcards to and from cells, answering his requests.\n"+
    "-Set the state of cells when allowed by the allowed_states.\n"+
    "Note: The most likely problem of the user faces are missing dependencies. A dependency is missing if a cell reads a variable but no cell writes it previous to that. The most likely cause is an error while parsing the code, either the dependency was not a real dependency (the model allucinated a Dependency), or another cell did write it and it was missed (the model did not find the Write). It's also possible that it was an error in the user's code. "+
    "Be helpful and propositive to the user in fixing these issues. If you find a missing write or an hallucinated dependency, tell him and propose to fix it. If you find errors in his code, tell him. \n"+
    "You cannot directly modify cells code (user will be allowed to do next step), split, merge,delete cells (user can do by hand)."+
    "\n\nNow you will receive the information about current state of the cell dependency graph:\n"

    static BASE_PROMPT_FIRST_STEP_FOOTER = `Please output your response in JSON format following this schema:
    {
        "text": string #REQUIRED: the textual response to show the user in the chat,
        "changes": [ #List with one entry for each cell changed by some actions you want performed. Empty if no action required. Note: once a cell is in changes, all fields will be replaced with the ones you provide. If you want to keep some fields, you have to provide them again.
            {
                "cell_index": number #Index of the cell changed,
                "wildcards": [list of strings] #Set the wildcards - every entry in the list is a string corresponding to a variable in the code
                "writes": [list of strings] #As above, but for writes
                "dependencies": [list of strings] #As above. Note: you can specify the variables in the dependency list, not the cell it depends on, this is computed as the closest preceding one and cannot be changed.
                "state": string (either "rule", "script" or "undecided") #Set the state of the cell
            }
        ]
    }
    As you see, you can set the state of as many cells as you want. If it is a big change, maybe first ask the user then do it when he agrees.`


    constructor(private viewModel: BashCommandViewModel) {}

    get_history_and_prompt(context: vscode.ChatContext, prompt: string){
        const previousMessages = context.history.filter(h => {
            return h instanceof vscode.ChatResponseTurn || !h.prompt.startsWith("MAIN_PROMPT");
        })
        return [...previousMessages.map(m => {
            if (m instanceof vscode.ChatResponseTurn){
                let fullMessage = '';
                m.response.forEach(r => {
                    const mdPart = r as vscode.ChatResponseMarkdownPart;
                    fullMessage += mdPart.value.value;
                });
                console.log(fullMessage);
                return vscode.LanguageModelChatMessage.Assistant(fullMessage);
            } else {
                console.log(m.prompt);
                return vscode.LanguageModelChatMessage.User(m.prompt);
            }
        }), vscode.LanguageModelChatMessage.User(prompt)];
    }

    get_prompt_step_1(presenter: NotebookPresenter): string{
        let prompt = ChatExtensionNotebook.BASE_PROMPT_FIRST_STEP;
        prompt += presenter.getCells().cells.map((cell: Cell, index:number) => {
            return `Cell n. ${index} - Writes: (${cell.writes.join(",")} - Wildcards: (${cell.wildcards.join(",")}) - `+
            `Depends on: (` + Object.entries(cell.dependsOn).map(([key, value]) => `${key} from cell ${value}`) +
            `) - Missing dependencies: (${cell.missingDependencies.join(",")}) - `+
            `state: ${cell.rule.type} and can become: ${cell.rule.canBecome()}\n`+
            `Cell code:\n#Start of code...\n${cell.code}\n#End of code...\n\n`;
        });
        return prompt + ChatExtensionNotebook.BASE_PROMPT_FIRST_STEP_FOOTER;
    }


    async run_chat_streaming(messages: vscode.LanguageModelChatMessage[], request: vscode.ChatRequest, 
        stream: vscode.ChatResponseStream, token: vscode.CancellationToken){
        const chatResponse = await request.model.sendRequest(messages, {}, token);
        for await (const fragment of chatResponse.text) {
            let markdownCommandString: vscode.MarkdownString = new vscode.MarkdownString(fragment);
            stream.markdown(markdownCommandString);
        }
    }

    async run_chat_json(messages: vscode.LanguageModelChatMessage[], request: vscode.ChatRequest, 
        stream: vscode.ChatResponseStream, token: vscode.CancellationToken, run_after: (data: any) => void): Promise<any>{
        let response = "";
        for (let i = 0; i < 5; i++){
            try{
                const chatResponse = await request.model.sendRequest(messages, {}, token);
                response = "";
                for await (const fragment of chatResponse.text) {
                    response += fragment;
                }
                let start = response.indexOf("{");
                let end = response.lastIndexOf("}");
                if (start !== -1 && end !== -1){
                    response = response.substring(start, end + 1);
                } else {
                    messages.push(
                        vscode.LanguageModelChatMessage.Assistant(response),
                        vscode.LanguageModelChatMessage.User("Could not find a JSON in your response, try again")
                    );
                    continue;
                }
                const formatted = JSON.parse(response);
                const text_response = formatted.text;
                run_after(formatted);
                let markdownCommandString: vscode.MarkdownString = new vscode.MarkdownString(text_response);
                stream.markdown(markdownCommandString);
                return formatted;
            } catch(e: any){
                messages.push(
                    vscode.LanguageModelChatMessage.Assistant(response),
                    vscode.LanguageModelChatMessage.User("This resulted in an error: " + e.message + "\nTry again.")
                );
            }
        }
    }

    async process(request: vscode.ChatRequest,context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,token: vscode.CancellationToken){
        
        let messages = [];

        const presenter = this.viewModel.getOpenedNotebook();
        if (!presenter){
            //No notebook opened
            messages.push(
                vscode.LanguageModelChatMessage.User(ChatExtensionNotebook.BASE_PROMPT+"\n"+ChatExtensionNotebook.BASE_PROMPT_NO_NOTEBOOK_OPENED)
            );
            messages = [...messages, ...this.get_history_and_prompt(context, request.prompt)]
            return this.run_chat_streaming(messages, request, stream, token);

        } else if (presenter.get_step()===0){
            //First screen
            messages.push(
                vscode.LanguageModelChatMessage.User(ChatExtensionNotebook.BASE_PROMPT+"\n"+this.get_prompt_step_1(presenter))
            );
            messages = [...messages, ...this.get_history_and_prompt(context, request.prompt)]
            const response = await this.run_chat_json(messages, request, stream, token,
                (data: any) => presenter.apply_from_chat(data)
            );
            if (response){
                console.log(response);
            }
        } else {
            //Second screen
        }
    }
}

