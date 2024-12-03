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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLM = void 0;
const openai_1 = __importDefault(require("openai"));
const vscode = __importStar(require("vscode"));
class LLM {
    models;
    current_model;
    copilot_active = false;
    constructor() {
        this.current_model = 0;
        this.models = [new OpenAI_Models('https://integrate.api.nvidia.com/v1', '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', "meta/llama3-70b-instruct", "(default) NVD Llama3-70b-instruct"),
            new OpenAI_Models('https://integrate.api.nvidia.com/v1', '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', "meta/llama-3.1-405b-instruct", "(default) NVD Llama3-405b-instruct")
        ];
    }
    run_query(query) {
        return this.models[this.current_model].run_query(query);
    }
    async useModel(index) {
        console.log("Activating model: " + this.models[index].get_name() + "...");
        vscode.window.showInformationMessage('Activating model: ' + this.models[index].get_name() + "...");
        const hi = await this.models[index].run_query("You are part of a vscode extension that helps users write snakemake rules from bash prompts - the user just selected you as the model of choice. Say Hi to the user! :) (please keep very short, you are in a small window - please do not ask questions to the user, he cannot respond)");
        this.current_model = index;
        return hi;
    }
    isCopilotActive() {
        return this.copilot_active;
    }
    activateCopilot(models) {
        if (models.length === 0 || this.copilot_active === true) {
            return;
        }
        //If one model in models has id = 'gpt-4o' set as the first
        const index_4o = models.findIndex(model => model.id === 'gpt-4o');
        if (index_4o !== -1) {
            const model = models.splice(index_4o, 1);
            models.unshift(model[0]);
        }
        const copilot_models = models.map(_model => new CopilotModel(_model));
        this.models = copilot_models.concat(this.models);
        this.current_model += copilot_models.length;
        this.copilot_active = true;
    }
}
exports.LLM = LLM;
class CopilotModel {
    userPrompt = "You are the AI inside a vscode extension that records user bash commands and help producing snakemake rules.";
    model;
    constructor(model) {
        this.model = model;
    }
    async run_query(query) {
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
    get_name() {
        return "Copilot - " + this.model.id;
    }
    get_params() {
        return [];
    }
    set_param(key, value) {
        return;
    }
}
class OpenAI_Models {
    url;
    apiKey;
    model;
    name;
    constructor(url, apiKey, model, name) {
        this.url = url;
        this.apiKey = apiKey;
        this.model = model;
        this.name = name;
    }
    get_name() {
        return this.name;
    }
    get_params() {
        return [];
    }
    set_param(key, value) {
        return;
    }
    async run_query(query) {
        const openai = new openai_1.default({
            apiKey: this.apiKey,
            baseURL: this.url,
        });
        const completion = await openai.chat.completions.create({
            model: this.model,
            messages: [{ "role": "user", "content": query }],
            temperature: 0.5,
            top_p: 1,
            max_tokens: 1024,
            stream: true,
        });
        var response = "";
        for await (const chunk of completion) {
            response += chunk.choices[0]?.delta?.content || '';
        }
        return response;
    }
}
//# sourceMappingURL=ModelComms.js.map