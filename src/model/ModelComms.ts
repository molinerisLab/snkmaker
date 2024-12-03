import OpenAI from 'openai';
import * as vscode from 'vscode';

export class LLM{
    models: ModelComms[];
    current_model: number;
    copilot_active = false;
    constructor(){
        this.current_model = 0;
        this.models = [new OpenAI_Models('https://integrate.api.nvidia.com/v1', 
            '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',
            "meta/llama3-70b-instruct", 
            "(default) NVD Llama3-70b-instruct"),
            new OpenAI_Models('https://integrate.api.nvidia.com/v1', 
                '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',
                "meta/llama-3.1-405b-instruct", 
                "(default) NVD Llama3-405b-instruct")
        ];
    }
    run_query(query: string): Promise<string>{
        return this.models[this.current_model].run_query(query);
    }

    async useModel(index: number){
        console.log("Activating model: " + this.models[index].get_name() + "...");
		vscode.window.showInformationMessage('Activating model: ' + this.models[index].get_name() + "...");
        const hi = await this.models[index].run_query("You are part of a vscode extension that helps users write snakemake rules from bash prompts - the user just selected you as the model of choice. Say Hi to the user! :) (please keep very short, you are in a small window - please do not ask questions to the user, he cannot respond)");
        this.current_model = index;
        return hi;
    }
        
    isCopilotActive(){
        return this.copilot_active;
    }
    activateCopilot(models: vscode.LanguageModelChat[]){
        if (models.length === 0 || this.copilot_active===true){
            return;
        }
        //If one model in models has id = 'gpt-4o' set as the first
        const index_4o = models.findIndex(model => model.id === 'gpt-4o');
        if (index_4o !== -1){
            const model = models.splice(index_4o, 1);
            models.unshift(model[0]);
        }
        const copilot_models: ModelComms[] = models.map(_model => 
            new CopilotModel(_model)
        );
        this.models = copilot_models.concat(this.models);
        this.current_model += copilot_models.length;
        this.copilot_active = true;
    }

}

export interface ModelParameters{
    key: string; value: string;
}

export interface ModelComms{
    run_query(query: string): Promise<string>;
    get_name(): string;
    get_params(): ModelParameters[];
    set_param(key: string, value: string): void;
}

class CopilotModel implements ModelComms{
    userPrompt: string = "You are the AI inside a vscode extension that records user bash commands and help producing snakemake rules.";
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