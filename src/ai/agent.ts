import { Logger } from "../log/logger";
import { Singleton } from "../utils/singleton";
import { Claude } from "./claude";
import { DeepSeek } from "./deep-seek";
import { Gemini } from "./gemini";

export class Agent extends Singleton {
    private _gimini: Gemini | null = null;
    private _deepSeek: DeepSeek | null = null;
    private _claude: Claude | null = null;
    private logger = new Logger(Agent);

    public override dispose(): Promise<void> | void {
    }
    public static getInstance(): Agent {
        return super._getInstance(Agent);
    }
    protected override initialize(): void {
        this._gimini = new Gemini();
        this._deepSeek = new DeepSeek();
        this._claude = new Claude();
    }

    async ask(question: string): Promise<string> {
        if(question.includes("use deepseek")){
            return `with deepseek: ${await this._deepSeek!.ask(question.replace("use deepseek",""))}`;
        }
        if(question.includes("use claude")){
            return `with claude: ${await this._claude!.ask(question.replace("use claude",""))}`;
        }
        return `with gemini: ${await this._gimini!.ask(question)}`;
    }
}