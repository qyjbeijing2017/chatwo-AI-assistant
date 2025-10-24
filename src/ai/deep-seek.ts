import { AI } from "./AI";
import { TavilySearch } from "@langchain/tavily";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatDeepSeek  } from "@langchain/deepseek";
import { HumanMessage } from "@langchain/core/messages";
import { timeTool } from "./tools/time";

export class DeepSeek extends AI {
    private _ai = createReactAgent({
        llm: new ChatDeepSeek ({
            apiKey: process.env.DEEPSEEK_API_KEY,
            model: 'deepseek-chat',
        }),
        tools: [new TavilySearch({ maxResults: 10 }), timeTool]
    });
    override async ask(question: string): Promise<string> {
        const response = await this._ai.invoke({
            messages: [
                new HumanMessage(question)
            ]
        });
        return response.messages[response.messages.length - 1]?.content.toString() || 'No response';
    }
}