import { GoogleGenAI, type GenerateContentConfig } from "@google/genai";
import { AI } from "./AI";
import { Config } from "../config";

export class Gemini extends AI {
    private _ai = new GoogleGenAI({
        apiKey: Config.getInstance().getText('GEMINI_API_KEY'),
    });
    override async ask(question: string): Promise<string> {
        const response = await this._ai.models.generateContent({
            model: Config.getInstance().getText('GEMINI_MODEL', 'gemini-2.5-flash-lite'),
            contents: question,
            config: {
                tools: [
                    {
                        googleSearch: {}
                    }
                ],
                temperature: 0.1,
                // systemInstruction: Config.getInstance().getText('SYSTEM_PROMPT', 'You are a discord helpful bot. Answer like a real human, be concise and clear.'),
            }
        });
        return response.text || '';
    }
}