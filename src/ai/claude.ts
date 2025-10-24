import Anthropic from "@anthropic-ai/sdk";
import { AI } from "./AI";

export class Claude extends AI {
    private _ai = new Anthropic();
    override async ask(question: string): Promise<string> {
        const response = await this._ai.messages.create({
            model: "claude-sonnet-4-5",
            max_tokens: 1000,
            tools: [
                {
                    type: "web_search_20250305",
                    name: "web_search",
                    max_uses: 3
                },
            ],
            messages: [
                { role: "user", content: question }
            ]
        });
        return response.content.map(item => item.type === "text" ? item.text : "").join("");
    }
}