import { Singleton } from "./singleton";
import { ChatOllama } from "@langchain/ollama";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { TavilySearch } from "@langchain/tavily";
import { MemorySaver } from "@langchain/langgraph";
import { Config } from "./config";
import { HumanMessage } from "@langchain/core/messages";
import { time } from "./tools/time";

export class Agent extends Singleton {
    private config = Config.getInstance();
    agentCheckpointer = new MemorySaver();
    agent = createReactAgent({
        llm: new ChatOllama({
            model: this.config.getText('OLLAMA_MODEL', 'qwen3:8b'),
        }),
        tools: [
            new TavilySearch({ maxResults: this.config.getInt('TAVILY_MAX_RESULTS', 10) }),
            time
        ],
        checkpointSaver: this.agentCheckpointer,
        prompt: `
        你是一个Discord聊天机器人，你可以帮助用户回答问题并提供信息。
        你的ID是${this.config.getText('APPLICATION_ID')}
        你可以使用Tavily搜索工具来查找最新的信息和数据。
        请确保你的回复简洁明了，贴近人类的表达方式。
`
    });

    public static getInstance(): Agent {
        return super._getInstance(Agent);
    }

    protected override initialize(): void {
    }

    public dispose(): void {
    }

    public async ask(
        question: string,
        history: string,
        channel: string,
        onPart: (token: string) => void
    ): Promise<void> {
        const tokens: string[] = [];
        let thinking = false;
        const maxChars = this.config.getInt('DISCORD_REPLY_MAX_CHARS', 2000);

        for await (const chunk of await this.agent.stream(
            {
                messages: [new HumanMessage(`
聊天频道的历史记录：${history}
问题：${question}
`)]
            },
            {
                configurable: { thread_id: channel },
                callbacks: [{
                    handleLLMNewToken(token) {
                        if (token === '<think>') {
                            thinking = true;
                            onPart('*思考中...*');
                        } else if (token === '</think>') {
                            thinking = false;
                            return;
                        }

                        if (!thinking) {
                            tokens.push(token);
                            const length = tokens.reduce((acc, cur) => acc + cur.length, 0);
                            if (length > maxChars) {
                                let text = tokens.join('');
                                let sendIndex = text.lastIndexOf('\n', maxChars);
                                onPart(text.slice(0, sendIndex));
                                text = text.slice(sendIndex);
                                tokens.length = 0;
                                tokens.push(text);
                            }
                        }
                    }
                }]
            }
        )) { }
        if (tokens.length > 0) {
            onPart(tokens.join(''));
        }
    }
}
