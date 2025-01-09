import OpenAI from 'openai';
import * as vscode from 'vscode';
import { SnkmakerLogger } from '../utils/SnkmakerLogger';
import { randomInt } from 'crypto';

export class LLM{
    models: ModelComms[];
    current_model: number;
    current_model_id: string | undefined = undefined;
    copilot_active = false;
    is_copilot_waiting = true;
    constructor(private memento: vscode.Memento){
        this.current_model = -1;
        this.models = this.loadModels();
    }
    async run_query(query: string): Promise<string>{
        if (this.is_copilot_waiting){
            while (this.current_model === -1){
                //Sleep until a model is selected
                await new Promise(r => setTimeout(r, 5000));
                SnkmakerLogger.instance()?.log("User tried running query but no model selected - sleeping");
            }
        }
        if (this.current_model === -1){
            SnkmakerLogger.instance()?.log("User tried running query but no model selected:\n"+query);
            throw new Error("No model currently selected - please select a model to use Snakemaker");
        }
        
        return this.models[this.current_model].run_query(query).then(response => {
            SnkmakerLogger.instance()?.query(this.models[this.current_model].get_name(), query, response);
            return response;
        });
    }

    async useModel(id: string, skip_message: boolean = false){
        const index = this.models.findIndex(model => model.get_id() === id);
        if (index === -1 || index === this.current_model){
            throw new Error("Model not found");
        }
        if (!skip_message){
		    vscode.window.showInformationMessage('Activating model: ' + this.models[index].get_name() + "...");
        }
        const hi = await this.models[index].run_query("You are part of a vscode extension that helps users write snakemake (or Make) rules from bash prompts - the user just selected you as the model of choice. Say Hi to the user! :) (please keep very short, you are in a small window - please do not ask questions to the user, he cannot respond)");
        this.current_model = index;
        this.memento.update('current_model', id);
        return hi;
    }
        
    isCopilotActive(){
        return this.copilot_active;
    }
    activateCopilot(models: vscode.LanguageModelChat[]){
        if (models.length === 0 || this.copilot_active===true){
            return -1;
        }
        models = models.filter(model => model.id.indexOf("gpt-3.5") === -1);
        const copilot_models: ModelComms[] = models.map(_model => 
            new CopilotModel(_model)
        );
        this.models = this.models.concat(copilot_models);
        this.copilot_active = true;
    }

    addModel(url: string, apiKey: string, model:string, max_tokens: number){
        const new_model: ModelComms = new OpenAI_Models(url, apiKey, model, max_tokens);
        this.models = [new_model].concat(this.models);
        this.current_model += 1;
        this.exportModels();
    }

    exportModels(){
        const exported = this.models.filter(model => model.is_user_added()).map(model => {
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
            return new OpenAI_Models(parsed.url, parsed.apiKey, parsed.model, parsed.max_tokens);
        }).filter(model => model !== undefined) as ModelComms[];
    }

    deleteModel(id: string){
        const index = this.models.findIndex(model => model.get_id() === id);
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

export interface ModelParameters{
    key: string; value: string;
}

export interface ModelComms{
    run_query(query: string): Promise<string>;
    get_name(): string;
    get_id(): string;
    get_params(): ModelParameters[];
    set_param(key: string, value: string): void;
    is_user_added(): boolean;
    export(): string;
}

class CopilotModel implements ModelComms{
    userPrompt: string = "You are part of a vscode extension that records user bash commands and help producing snakemake (or Make) rules.";
    model: vscode.LanguageModelChat;
    constructor(model: vscode.LanguageModelChat){
        this.model = model;
    }
    async run_query(query: string): Promise<string> {
        const craftedPrompt = [
            vscode.LanguageModelChatMessage.User(this.userPrompt),
            vscode.LanguageModelChatMessage.User(query)
        ];
        const request = await this.model.sendRequest(craftedPrompt, {});
        var response = "";
        for await (const fragment of request.text) {
            response += fragment;
          }
        //Response might contain ```python because copilot is a special kid. Must remove them
        response = response.replace(/```python/g, '');
        response = response.replace(/```/g, '');
        return response;
    }
    is_user_added(): boolean {
        return false;
    }
    get_name(): string{
        return "Copilot - " + this.model.id;
    }
    get_params(): ModelParameters[]{
        return [];
    }
    set_param(key: string, value: string){
        return;
    }
    get_id(): string{
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
        this.name = model + "-t"+max_tokens;
        this.max_tokens = max_tokens;
        this.id = new Date().getTime() + model;
    }
    get_name(): string{
        return this.name;
    }
    get_params(): ModelParameters[]{
        return [];
    }
    set_param(key: string, value: string){
        return;
    }
    get_id(): string{
        return this.id;
    }
    is_user_added(): boolean {
        return true;
    }
    export(): string {
        return JSON.stringify({
            url: this.url,
            apiKey: this.apiKey,
            model: this.model,
            max_tokens: this.max_tokens
            });
    }

    async run_query(query: string): Promise<string>{
        const openai = new OpenAI({
            apiKey: this.apiKey,
            baseURL: this.url,
        });
        const completion = await openai.chat.completions.create({
            model: this.model,
            messages: [{"role":"user","content":query}],
            temperature: 0.5,
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
}