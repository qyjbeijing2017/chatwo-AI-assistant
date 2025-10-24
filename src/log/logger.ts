import { LogManager } from "./log.manager";

export class Logger {
    private _className: string;
    private _logManager = LogManager.getInstance();
    constructor(clazz?: new (...args: any[]) => any) {
        this._className = clazz?.name || 'Global';
    }

    public debug(...messages: any[]): void {
        this._logManager.debug(messages.join(' '), this._className);
    }

    public info(...messages: any[]): void {
        this._logManager.info(messages.join(' '), this._className);
    }

    public warn(...messages: any[]): void {
        this._logManager.warn(messages.join(' '), this._className);
    }

    public error(...messages: any[]): void {
        this._logManager.error(messages.join(' '), this._className);
    }

    public fatal(...messages: any[]): void {
        this._logManager.fatal(messages.join(' '), this._className);
    }
}