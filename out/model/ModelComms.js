"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NVIDIA_ModelComms = exports.LLAMA_ModelComms = void 0;
const openai_1 = __importDefault(require("openai"));
class LLAMA_ModelComms {
    async run_query(query) {
        //Fetch
        const url = "https://api.groq.com/openai/v1/chat/completions";
        const apiKey = "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";
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "llama3-8b-8192",
                messages: [
                    {
                        role: "user",
                        content: query,
                    },
                ],
            }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        console.log(data.choices[0].message.content);
        return data.choices[0].message.content;
    }
}
exports.LLAMA_ModelComms = LLAMA_ModelComms;
class NVIDIA_ModelComms {
    async run_query(query) {
        const openai = new openai_1.default({
            apiKey: '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',
            baseURL: 'https://integrate.api.nvidia.com/v1',
        });
        const completion = await openai.chat.completions.create({
            model: "meta/llama3-70b-instruct",
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
        console.log(response);
        return response;
    }
}
exports.NVIDIA_ModelComms = NVIDIA_ModelComms;
//# sourceMappingURL=ModelComms.js.map