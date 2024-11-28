import OpenAI from 'openai';

export interface ModelComms{
    run_query(query: string): Promise<string>;
}

export class LLAMA_ModelComms{
    async run_query(query: string): Promise<string>{
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
        const data: any = await response.json();
        console.log(data.choices[0].message.content);
        return data.choices[0].message.content;
    }
}

export class NVIDIA_ModelComms{
    async run_query(query: string): Promise<string>{
        const openai = new OpenAI({
        apiKey: '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',
        baseURL: 'https://integrate.api.nvidia.com/v1',
        });

        const completion = await openai.chat.completions.create({
            model: "meta/llama3-70b-instruct",
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
        console.log(response);
        return response;
    }
}