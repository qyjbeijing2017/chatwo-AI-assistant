export abstract class AI {
    abstract ask(question: string): Promise<string>;
}