import OpenAI from 'openai';
import * as vscode from 'vscode';
import { SnkmakerLogger } from '../utils/SnkmakerLogger';

export class LLM{
    models: ModelComms[];
    current_model: number;
    copilot_active = false;
    constructor(private memento: vscode.Memento){
        this.current_model = -1;
        this.models = [];
    }
    async run_query(query: string): Promise<string>{
        while (this.current_model === -1){
            //Sleep until a model is selected
            await new Promise(r => setTimeout(r, 5000));
            SnkmakerLogger.instance()?.log("User tried running query but no model selected - sleeping");
        }
        
        return this.models[this.current_model].run_query(query).then(response => {
            SnkmakerLogger.instance()?.query(this.models[this.current_model].get_name(), query, response);
            return response;
        });
    }

    async useModel(index: number, skip_message: boolean = false): Promise<string>{
        if (!skip_message){
		    vscode.window.showInformationMessage('Activating model: ' + this.models[index].get_name() + "...");
        }
        const hi = await this.models[index].run_query("You are part of a vscode extension that helps users write snakemake rules from bash prompts - the user just selected you as the model of choice. Say Hi to the user! :) (please keep very short, you are in a small window - please do not ask questions to the user, he cannot respond)");
        this.current_model = index;
        this.memento.update('copilot_model', this.models[index].get_id());
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
        //Check if user has saved a model as the first one - otherwise default to gpt-4o
        var model_id = this.memento.get<string>('copilot_model', 'gpt-4o');
        
        var model_index = models.findIndex(model => model.id === model_id);
        if (model_index === -1){
            model_index = 0;
            model_id = models[0].id;
            this.memento.update('copilot_model', model_id);
        }

        const copilot_models: ModelComms[] = models.map(_model => 
            new CopilotModel(_model)
        );
        this.models = copilot_models.concat(this.models);
        if (this.current_model !== -1){
            this.current_model += copilot_models.length;
        }
        this.copilot_active = true;
        return model_index;
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
}

class CopilotModel implements ModelComms{
    userPrompt: string = "You are part of a vscode extension that records user bash commands and help producing snakemake rules.";
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
}

class OpenAI_Models implements ModelComms{
    url: string; apiKey: string; model: string;
    name: string;
    constructor(url: string, apiKey: string, model: string, name: string){
        this.url = url;
        this.apiKey = apiKey;
        this.model = model;
        this.name = name;
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
        return this.model;
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
            max_tokens: 1024,
            stream: true,
        });
        var response: string = "";
        for await (const chunk of completion) {
            response += chunk.choices[0]?.delta?.content || '';
        }
        return response;
    }
}