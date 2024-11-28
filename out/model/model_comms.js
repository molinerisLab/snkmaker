"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class ModelComms {
    async run_query(query) {
        //Fetch
        const url = "https://api.groq.com/openai/v1/chat/completions";
        const apiKey = "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";
        try {
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
            console.log(data);
        }
        catch (error) {
            console.error("Error:", error);
        }
    }
}
//# sourceMappingURL=model_comms.js.map