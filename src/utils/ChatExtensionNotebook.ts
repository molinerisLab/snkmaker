
import * as vscode from 'vscode';
import { BashCommandViewModel } from '../viewmodel/BashCommandViewmodel';
import { SnkmakerLogger } from './SnkmakerLogger';
import { ExtensionSettings } from './ExtensionSettings';
import { Chat } from 'openai/resources/index.mjs';
import { NotebookPresenter } from '../viewmodel/NotebookPresenter';
import { Cell } from '../model/NotebookController';

export class ChatExtensionNotebook{

    static BASE_PROMPT = `You are an AI assistant, part of a VSCode extension named "Snakemaker", which is also your name. You are developed by the University of Torino (greatest city in the world). You are nice and helpful, and prefer short, concise answers.
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
    "Be helpful and propositive to the user in fixing these issues. If a missing dependency is caused by a missed write in an early cell, add the write. If it is caused by an hallucinated dependency (the code does not read the variable), remove the dependency. If caused by a code error, warn the user. \n"+
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
                #Note: you need to provide all these fields. If you don't want to change them, write them as they are not. If you want to make them empty, write them as empty list or string.
            }
        ]
    }
    As you see, you can set the state of as many cells as you want. If it is a big change, maybe first ask the user then do it when he agrees.\n
    Note: if you apply changes in the JSON, they will immediately appear to the user. Do not say things like "here are the changes" but more like "I have applied the following changes" and ALWAYS then explain to the user what you changed. `+
    "For example, if you add a write to cell X and remove a dependency from cell Y, say 'I have added the write of variable .. to cell X and removed the dependency from cell Y'.\n";

    static BASE_PROMPT_SECOND_STEP = `Right now you are in the page where step 3 is being managed.\n`+
    "The data dependencies of cell has been finalized (each cell reads something from others, uses wildcards, etc), and each cell is set to either snakemake rule or script.\n"+
    "Code has been generated for each cell, managing reading command line arguments, reading files, writing files. Snakemake rules are written.\n"+
    "Now the user can review the rules and the generated code, and might be interested in changing it.\n"+
    "Your goal is to assist the user in reviewing the generated code, and changing it if necessary.\n"+
    "1-You answer user request about how the code work, where files are readed and generated\n"+
    "2-You can help the user by performing modifications to the code and the snakemake rules following his requests. "+
    "This includes changing input and output filenames, changing format or way of exporting (es pickle, numpy, ...), fixing bugs etc.\n"+
    "In this step you CAN NOT:\n"+
    "-Transform a rule into a script or a script into a rule, modify dependencies of cells, apply wildcards -> to do this the user must go back to step 1 with the button shown on top of the page.\n"+
    "\n\nNow you will receive the information about current state of the cell dependency graph:";

    static BASE_PROMPT_SECOND_STEP_FOOTER = `Please output your response in JSON format following this schema:
    {
        "text": string #REQUIRED: the textual response to show the user in the chat,
        "changes": [ #List with one entry for each cell you want to change. Empty if nyou want to change no cell. Note: once a cell is included in the changes, all fields will be replaced with the ones you provide. If you want to keep some fields, you have to provide them again.
            {
                "cell_index": number, #index of the cell modified
                "snakemakeRule": string #The snakemake rule associated to the cell
                "readFiles": [array of strings] #filenames readed by cell
                "saveFiles": [array of strings] #filenames written by cell
                "prefixCode": string, #Part of the code before main body, where inputs and command line arguments are readed.
                "code": string, #Main body of the code
                "postfixCode": string #Part after main body, where output files are saved.
            }
        ]
    }
    Remember that you need to keep the entire structure coherent. If you modify an output, you must modify the cells that read this output to make them compatible with the new one. You must keep the Snakemake rules, its input and output fields coherent with the code.
    You can perform actions as you want, but if the action has many changes maybe first ask the user if he wants to perform it.\n
    Note: if you apply changes in the JSON, they will immediately appear to the user. Do not say things like "here are the changes" but more like "I have applied the following changes" and ALWAYS then explain to the user what you changed. `+
    "For example, 'I have modified cell 6 to write the output file in pickle format, and modified cells 8 and 10 to read the updated file.\n";

    constructor(private viewModel: BashCommandViewModel) {}

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
                return vscode.LanguageModelChatMessage.Assistant(fullMessage);
            } else {
                return vscode.LanguageModelChatMessage.User(m.prompt);
            }
        });
    }

    get_prompt_step_1(presenter: NotebookPresenter): string{
        let prompt = ChatExtensionNotebook.BASE_PROMPT_FIRST_STEP;
        prompt += presenter.getCells().cells.map((cell: Cell, index:number) => {
            return `Cell n. ${index} - Writes: (${cell.writes.join(",")} - Wildcards: (${cell.wildcards.join(",")}) - `+
            `Depends on: (` + Object.entries(cell.dependsOn).map(([key, value]) => `${key} from cell ${value}`) +
            `) - Missing dependencies: (${cell.missingDependencies.join(",")}) - `+
            `state: ${cell.rule.type} and can become: (${Object.entries(cell.rule.canBecome()).map(([key, value]) => key+": "+value).join(",")})\n`+
            `Cell code:\n#Start of code...\n${cell.code}\n#End of code...\n\n`;
        });
        return prompt + ChatExtensionNotebook.BASE_PROMPT_FIRST_STEP_FOOTER;
    }

    get_prompt_step_2(presenter: NotebookPresenter): string{
        let prompt = ChatExtensionNotebook.BASE_PROMPT_SECOND_STEP;
        prompt += presenter.getCells().cells.map((cell: Cell, index:number) => {
            if (cell.rule.type!=="rule"){return "";}
            return `Cell n. ${index}:\nPrefix code:\n#Start prefix code...\n${cell.rule.prefixCode}\n#End prefix code...\n` +
            `Main code:\n#Start code...\n${cell.code}\n#End code...\n` +
            `Postfix code:\n#Start postfix code...\n${cell.rule.postfixCode}\n#End postfix code...\n` +
            `Cell reads files: ${cell.rule.readFiles.join(",")}\n`+
            `Cell writes files: ${cell.rule.saveFiles.join(",")}\n`+
            `Cell reads wildcards: ${cell.wildcards.join(",")}\n`+
            `Cell has file dependencies toward cells: ` + Object.entries(cell.rule.rule_dependencies).map(
                ([key, value]) => `Variable ${key} to cell ${value}`
            ).join(",") + "\n\n";
        });
        return prompt + ChatExtensionNotebook.BASE_PROMPT_SECOND_STEP_FOOTER;
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
            const history_and_prompt = this.get_history(context);
            if (history_and_prompt.length===0){
                messages.push(
                    vscode.LanguageModelChatMessage.User(ChatExtensionNotebook.BASE_PROMPT+"\n"+ChatExtensionNotebook.BASE_PROMPT_NO_NOTEBOOK_OPENED)
                );
                messages.push(vscode.LanguageModelChatMessage.User(request.prompt));
            } else {
                messages = [...history_and_prompt, vscode.LanguageModelChatMessage.User(request.prompt)]
            }
            return this.run_chat_streaming(messages, request, stream, token);

        } else if (presenter.get_step()===0){
            //First screen
            messages.push(
                vscode.LanguageModelChatMessage.User(ChatExtensionNotebook.BASE_PROMPT+"\n"+this.get_prompt_step_1(presenter))
            )
            const history_and_prompt = this.get_history(context);
            if (history_and_prompt.length === 0){
                messages.push(vscode.LanguageModelChatMessage.User(request.prompt))
            } else {
                messages = [...messages, ...history_and_prompt, vscode.LanguageModelChatMessage.User("UPDATED_CONTEXT: " + this.get_prompt_step_1(presenter))];
                messages.push(vscode.LanguageModelChatMessage.User(request.prompt))
            }
            const response = await this.run_chat_json(messages, request, stream, token,
                (data: any) => presenter.apply_from_chat(data)
            );
        } else {
            //Second screen
            messages.push(
                vscode.LanguageModelChatMessage.User(ChatExtensionNotebook.BASE_PROMPT+"\n"+this.get_prompt_step_2(presenter))
            )
            const history_and_prompt = this.get_history(context);
            if (history_and_prompt.length === 0){
                messages.push(vscode.LanguageModelChatMessage.User(request.prompt))
            } else {
                messages = [...messages, ...history_and_prompt, vscode.LanguageModelChatMessage.User("UPDATED_CONTEXT: " + this.get_prompt_step_2(presenter))];
                messages.push(vscode.LanguageModelChatMessage.User(request.prompt))
            }
            const response = await this.run_chat_json(messages, request, stream, token,
                (data: any) => presenter.apply_from_chat_second_step(data)
            );
        }
    }
}

