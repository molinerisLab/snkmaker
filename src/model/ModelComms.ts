import OpenAI from 'openai';
import * as vscode from 'vscode';
import { SnkmakerLogger } from '../utils/SnkmakerLogger';
import { Stream } from 'openai/streaming.mjs';
import { ExtensionSettings } from '../utils/ExtensionSettings';
const { jsonrepair } = require('jsonrepair')

export class ModelNotReadyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ModelNotReadyError";
    }
}

export enum PromptTemperature{
    GREEDY_DECODING = 0,
    DAG_GEN = 0.1, //DAG is kept with its own enum because it's sensible and needs experimenting on its own.
    RULE_OUTPUT = 0.2, //Low t. for code, rules generation
    CREATIVE = 0.5, //Creative t. used for hello messages, documentation...
    MEDIUM_DETERMINISTIC = 0.3 //Medium t. for things like guessing rules names...
}

export class LLM{
    models: ModelComms[];
    current_model: number;
    current_model_id: string | undefined = undefined;
    copilotActive = false;
    isCopilotWaiting = true;

    constructor(private memento: vscode.Memento){
        this.current_model = -1;
        this.models = this.loadModels();
    }

    private parseJsonFromResponse(response: string): any{
        let start = response.indexOf("{");
        let end = response.lastIndexOf("}");
        if (start !== -1 && end !== -1){
            response = response.substring(start, end + 1);
        }
        try{
            return JSON.parse(response);
        } catch (e:any){
            try{
                console.log("Trying to repair json");
                response = jsonrepair(response);
                return JSON.parse(response);
            } catch (e:any){
                console.log("Error parsing json: ", e.message);
                throw e;
            }
        }
    }

    async runQueryAndParse(prompt: string, t: PromptTemperature,
         validate:((r: any)=>string|null)|undefined=undefined, skip_iterations: boolean=false): Promise<any>{
        const original_prompt = prompt;
        let response = "";
        let suggestion = " Remember, your response is parsed by a script, so it must be in the correct format.\n"+
        "The script searches for a JSON using the first { and the last }, so you can add reasonings, but the symbols { and } must be used only in the response JSON. "+
        "If you add an example JSON, or use a { or } in the response before the actual JSON, it will break the parser.\n"+
        "JSON also must be valid, must not contain triple-quote strings and must escape special characters.";
        const limit = ExtensionSettings.instance.getNumberParsingErrorTries();
        const stepBackLimit = ExtensionSettings.instance.getNumberParsingErrorActivateStepBack();
        for (let i=0; i<limit; i++){
            const response = await this.runQuery(prompt, t);
            try{
                const parsed = this.parseJsonFromResponse(response);
                if (validate){
                    const validationError = validate(parsed);
                    if (validationError) {
                        console.log("Validation error: ", validationError);
                        prompt = "I sent you this request:\n\`\`\`request\n" + original_prompt + "\n\`\`\`"+
                        "Your response was:\n\`\`\`response\n" + response + "\n\`\`\`" +
                        "Your response is not valid:\n\`\`\`validation error\n" + validationError + "\n\`\`\`" +
                        "Please try to fix your previous response.";
                        continue;
                    }
                }
                return parsed;
            } catch (e:any){
                if (skip_iterations){
                    break;
                }
                console.log("Error parsing LLM response");
                let error_message = `Error type: ${e.name}, Message: ${e.message}`;
                if (i>=stepBackLimit){
                    //Prompt the model itself for a solution
                    const p = "I sent you this request:\n\`\`\`request\n" + original_prompt + "\n\`\`\`\n"+
                    "Your response was:\n\`\`\`response\n" + response + "\n\`\`\`\n" +
                    "When trying to parse your response in JSON format, I get this error:\n\`\`\`error\n" + error_message + "\n\`\`\`\n" +
                    "Analyze your request, your previous response and this error, and give me a review of what went wrong, "+
                    "and suggestions on how to fix it. Write only the review and suggestions, not the fixed response.";
                    suggestion = await this.runQuery(p, PromptTemperature.MEDIUM_DETERMINISTIC);
                    suggestion = "\nAnalysis on what went wrong:\n" + suggestion;
                }
                prompt = "I sent you this request:\n\`\`\`request\n" + original_prompt + "\n\`\`\`"+
                "Your response was:\n\`\`\`response\n" + response + "\n\`\`\`" +
                "When trying to parse your response in JSON format, I get this error:\n\`\`\`error\n" + error_message + "\n\`\`\`\n" +
                "Please try to fix your previous response. Here are some suggestions:\n"+suggestion;
            }
        }
        console.log("Error parsing LLM response");
    }

    async runQuery(query: string, t: PromptTemperature): Promise<string>{
        let tries = 0;
        if (this.isCopilotWaiting){
            while (this.current_model === -1){
                await new Promise(r => setTimeout(r, 3000));
                SnkmakerLogger.instance()?.log("User tried running query but copilot still unactive and no model selected - sleeping");
            }
        }
        while(this.current_model === -1 && tries < 15){
            await new Promise(r => setTimeout(r, 1000));
            tries += 1;
        }
        if (this.current_model === -1){
            SnkmakerLogger.instance()?.log("User tried running query but no model selected:\n"+query);
            throw new ModelNotReadyError("No model currently selected - please select a model to use Snakemaker");
        }
        return this.models[this.current_model].runQuery(query, t).then(response => {
            SnkmakerLogger.instance()?.query(this.models[this.current_model].getName(), query, response);
            return response;
        });
    }

    async runChatQuery(queries: vscode.LanguageModelChatMessage[]): Promise<ChatResponseIterator>{
        let tries = 0;
        if (this.isCopilotWaiting){
            while (this.current_model === -1){
                await new Promise(r => setTimeout(r, 3000));
                SnkmakerLogger.instance()?.log("User tried running query but copilot still unactive and no model selected - sleeping");
            }
        }
        while(this.current_model === -1 && tries < 15){
            await new Promise(r => setTimeout(r, 1000));
            tries += 1;
        }
        if (this.current_model === -1){
            throw new Error("No model currently selected - please select a model to use Snakemaker");
        }
        return this.models[this.current_model].runChatQuery(queries).then(response => {
            return response;
        });
    }

    async useModel(id: string | null, skip_message: boolean = false): Promise<string>{
        let index = -1;
        if (id === null){
            const index_4o_mini = this.models.findIndex(model => model.getId().indexOf("gpt-4o-mini") !== -1);
            const index_4o = this.models.findIndex(model => model.getId().indexOf("gpt-4o") !== -1 && model.getId().indexOf("mini") === -1);
            if (index_4o !== -1){
                index = index_4o;
            } else if (index_4o_mini !== -1){
                index = index_4o_mini;
            } else {
                index = this.models.length - 1;
            }
        } else {
            index = this.models.findIndex(model => model.getId() === id);
        }
        if (index === -1 || index === this.current_model){
            throw new Error("Model not found");
        }
        if (!skip_message){
		    vscode.window.showInformationMessage('Activating model: ' + this.models[index].getName() + "...");
        }
        const hi = await this.models[index].runQuery(
            "You are part of a vscode extension that helps users write snakemake (or Make) rules from bash prompts - the user just selected you as the model of choice. Say Hi to the user! :) (please keep very short, you are in a small window. Please only say hi, the user cannot answer you)",
            PromptTemperature.CREATIVE
        );
        this.current_model = index;
        this.memento.update('current_model', id);
        return hi;
    }
        
    isCopilotActive(){
        return this.copilotActive;
    }

    filterModels(models: vscode.LanguageModelChat[]){
        //Some copilot models cause errors constantly, or simply refuse to follow the prompt's instructions.
        const FILTER_OUT: string[] = ["gpt-3.5"]; //gemini
        return models.filter(model => {
            for (const filter of FILTER_OUT){
                if (model.id.indexOf(filter) !== -1){
                    return false;
                }
            }
            return true;
        });
    }

    activateCopilot(models: vscode.LanguageModelChat[]){
        if (models.length === 0){
            return -1;
        }
        const copilot_models: ModelComms[] = models.map(_model => 
            new CopilotModel(_model)
        );
        this.models = this.models.concat(copilot_models);
        this.copilotActive = true;
    }

    async testModel(url: string, apiKey: string, model: string, max_tokens: number){
        const new_model: ModelComms = new OpenAI_Models(url, apiKey, model, max_tokens);
        const query = "Please say hi to the user!";
        return new_model.runQuery(query, PromptTemperature.RULE_OUTPUT);
    }

    addModel(url: string, apiKey: string, model:string, max_tokens: number){
        const new_model: ModelComms = new OpenAI_Models(url, apiKey, model, max_tokens);
        this.models = [new_model].concat(this.models);
        this.current_model += 1;
        this.exportModels();
    }

    exportModels(){
        const exported = this.models.filter(model => model.isUserAdded()).map(model => {
            return model.export();
        });
        this.memento.update('models', exported);
    }
    
    loadModels(): ModelComms[]{
        return this.memento.get<string[]>('models', []).map(model => {
            const parsed = JSON.parse(model);
            if (!parsed){
                return;
            }
            const m = new OpenAI_Models(parsed.url, parsed.apiKey, parsed.model, parsed.max_tokens);
            m.id = parsed.id;
            return m;
        }).filter(model => model !== undefined) as ModelComms[];
    }

    deleteModel(id: string){
        const index = this.models.findIndex(model => model.getId() === id);
        if (index === -1){
            return false;
        }
        this.models.splice(index, 1);
        if (index === this.current_model){
            this.current_model = -1;
        } else if (index < this.current_model){
            this.current_model -= 1;
        }
        this.exportModels();
    }

}

export interface ChatResponseIterator {
    text: AsyncIterable<string>;
}

class OpenAiChatResponseIterator implements ChatResponseIterator {
    text: AsyncIterable<string>;
    constructor(completion: Stream<OpenAI.Chat.Completions.ChatCompletionChunk> & {_request_id?: string | null;}){
        const iterator = completion[Symbol.asyncIterator]();
        this.text = {
            [Symbol.asyncIterator]: () => {
                return {
                    next: async () => {
                        const chunk = await iterator.next();
                        if (chunk.done) {
                            return { done: true, value: "" };
                        } else {
                            const text = chunk.value.choices[0]?.delta?.content || '';
                            return { done: false, value: text };
                        }
                    }
                }
            }
        };
    }
}

export interface ModelParameters{
    key: string; value: string;
}

export interface ModelComms{
    runQuery(query: string, t: PromptTemperature): Promise<string>;
    getName(): string;
    getId(): string;
    getParams(): ModelParameters[];
    setParams(key: string, value: string): void;
    isUserAdded(): boolean;
    export(): string;
    runChatQuery(queries: vscode.LanguageModelChatMessage[]): Promise<ChatResponseIterator>;
}

class CopilotModel implements ModelComms{
    userPrompt: string = "You are part of a vscode extension that records user bash commands and help producing snakemake (or Make) rules.";
    model: vscode.LanguageModelChat;
    constructor(model: vscode.LanguageModelChat){
        this.model = model;
    }
    async runQuery(query: string, t: PromptTemperature): Promise<string> {
        const craftedPrompt = [
            vscode.LanguageModelChatMessage.User(this.userPrompt),
            vscode.LanguageModelChatMessage.User(query)
        ];
        const request = await this.model.sendRequest(
            craftedPrompt, 
            {
                modelOptions: {
                    temperature: t as number,
                }
            }
        );
        var response = "";
        for await (const fragment of request.text) {
            response += fragment;
          }
        response = response.replace(/```/g, '');
        return response;
    }
    async runChatQuery(queries: vscode.LanguageModelChatMessage[]): Promise<vscode.LanguageModelChatResponse> {
        return this.model.sendRequest(queries, {});
    }
    isUserAdded(): boolean {
        return false;
    }
    getName(): string{
        return "Copilot - " + this.model.id;
    }
    getParams(): ModelParameters[]{
        return [];
    }
    setParams(key: string, value: string){
        return;
    }
    getId(): string{
        return this.model.id;
    }
    export(): string{
        return "";
    }
}

class OpenAI_Models implements ModelComms{
    url: string; apiKey: string; model: string;
    name: string; id:string;
    max_tokens: number;
    constructor(url: string, apiKey: string, model: string, max_tokens: number){
        this.url = url;
        this.apiKey = apiKey;
        this.model = model;
        this.name = model + "-max_t_"+max_tokens;
        this.max_tokens = max_tokens;
        this.id = new Date().getTime() + model;
    }
    getName(): string{
        return this.name;
    }
    getParams(): ModelParameters[]{
        return [];
    }
    setParams(key: string, value: string){
        return;
    }
    getId(): string{
        return this.id;
    }
    isUserAdded(): boolean {
        return true;
    }
    export(): string {
        return JSON.stringify({
            url: this.url,
            apiKey: this.apiKey,
            model: this.model,
            max_tokens: this.max_tokens,
            id: this.id
            });
    }

    async runQuery(query: string, t: PromptTemperature): Promise<string>{
        const openai = new OpenAI({
            apiKey: this.apiKey,
            baseURL: this.url,
        });
        const completion = await openai.chat.completions.create({
            model: this.model,
            messages: [{"role":"user","content":query}],
            temperature: t as number,
            top_p: 1,
            max_tokens: this.max_tokens,
            stream: true,
        });
        var response: string = "";
        for await (const chunk of completion) {
            response += chunk.choices[0]?.delta?.content || '';
        }
        return response;
    }

    private static chatContentToString(content: (vscode.LanguageModelTextPart | vscode.LanguageModelToolResultPart | vscode.LanguageModelToolCallPart)[]){
        return content.map((part)=>{
            if (part instanceof vscode.LanguageModelTextPart){
                return part.value;
            }
            return "";
        }).join("");
    }

    async runChatQuery(queries: vscode.LanguageModelChatMessage[]): Promise<ChatResponseIterator>{ 
        const openai = new OpenAI({
            apiKey: this.apiKey,
            baseURL: this.url,
        });
        const completion = await openai.chat.completions.create({
            model: this.model,
            messages: queries.map(
                (query: vscode.LanguageModelChatMessage) => {
                    return {
                        "role": query.role === vscode.LanguageModelChatMessageRole.User ? "user" : "assistant",
                        "content": OpenAI_Models.chatContentToString(query.content)
                    }
                }
            ),
            temperature: 0.5,
            top_p: 1,
            max_tokens: this.max_tokens,
            stream: true,
        });
        return new OpenAiChatResponseIterator(completion);
    }
}