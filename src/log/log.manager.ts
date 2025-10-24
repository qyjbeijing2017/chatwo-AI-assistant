import { Config } from "../config";
import { Singleton } from "../utils/singleton";
import * as fs from 'fs-extra';
import * as path from 'path';
import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc';

// 扩展dayjs的UTC插件
dayjs.extend(utc);

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    FATAL = 4
}

export interface LogMessage {
    level: LogLevel;
    levelName: string;
    timestamp: string;
    message: string;
    category?: string;
    source?: string;
}

export class LogManager extends Singleton {
    private _config = Config.getInstance();
    private _logLevel: LogLevel = LogLevel.INFO;
    private _logDir: string = './logs';
    private _cache: LogMessage[] = [];
    private _maxCacheSize: number = 1000;
    private _flushInterval: NodeJS.Timeout | null = null;
    private _flushIntervalMs: number = 10000;
    private _enableConsole: boolean = true;
    private _enableFile: boolean = true;

    public static getInstance(): LogManager {
        return super._getInstance(LogManager);
    }

    protected override initialize(): void {
        // 配置日志级别
        const level = this._config.getText('LOG_LEVEL', 'info').toLowerCase();
        this._logLevel = this.parseLogLevel(level);
        
        // 配置日志目录
        this._logDir = this._config.getText('LOG_DIR', './logs');
        fs.ensureDirSync(this._logDir);
        
        // 配置缓存大小
        this._maxCacheSize = this._config.getInt('LOG_CACHE_SIZE', 1000);
        
        // 配置刷新间隔（毫秒）
        this._flushIntervalMs = this._config.getInt('LOG_FLUSH_INTERVAL', 10000);
        
        // 配置输出选项
        this._enableConsole = this._config.getText('LOG_CONSOLE', 'true') === 'true';
        this._enableFile = this._config.getText('LOG_FILE', 'true') === 'true';
        
        // 启动定时刷新
        this.startFlushTimer();
        
        this.info('Logger initialized', 'LOGGER');
    }

    /**
     * 解析日志级别
     */
    private parseLogLevel(level: string): LogLevel {
        switch (level.toLowerCase()) {
            case 'debug': return LogLevel.DEBUG;
            case 'info': return LogLevel.INFO;
            case 'warn': return LogLevel.WARN;
            case 'error': return LogLevel.ERROR;
            case 'fatal': return LogLevel.FATAL;
            default: return LogLevel.INFO;
        }
    }

    /**
     * 启动刷新计时器
     */
    private startFlushTimer(): void {
        // 确保之前的定时器已停止
        this.stopFlushTimer();
        
        // 使用配置的刷新间隔
        this._flushInterval = setInterval(() => {
            // 检查是否已被dispose
            if (this.isDisposed()) {
                this.stopFlushTimer();
                return;
            }
            this.flushLogs();
        }, this._flushIntervalMs);
    }

    /**
     * 停止刷新计时器
     */
    private stopFlushTimer(): void {
        if (this._flushInterval) {
            clearInterval(this._flushInterval);
            this._flushInterval = null;
        }
    }

    /**
     * 记录调试信息
     */
    public debug(message: string, category?: string): void {
        this.log(LogLevel.DEBUG, message, category);
    }

    /**
     * 记录一般信息
     */
    public info(message: string, category?: string): void {
        this.log(LogLevel.INFO, message, category);
    }

    /**
     * 记录警告信息
     */
    public warn(message: string, category?: string): void {
        this.log(LogLevel.WARN, message, category);
    }

    /**
     * 记录错误信息
     */
    public error(message: string, category?: string): void {
        this.log(LogLevel.ERROR, message, category);
    }

    /**
     * 记录致命错误
     */
    public fatal(message: string, category?: string): void {
        this.log(LogLevel.FATAL, message, category);
    }

    /**
     * 通用日志记录方法
     */
    private log(level: LogLevel, message: string, category?: string): void {
        // 检查日志级别
        if (level < this._logLevel) {
            return;
        }

        const logMessage: LogMessage = {
            level,
            levelName: LogLevel[level],
            timestamp: dayjs().utc().toISOString(),
            message,
            category: category || 'GENERAL',
            source: this.getCallerInfo()
        };

        // 添加到缓存
        this._cache.push(logMessage);

        // 输出到控制台
        if (this._enableConsole) {
            this.outputToConsole(logMessage);
        }

        // 检查缓存大小，如果满了则刷新
        if (this._cache.length >= this._maxCacheSize) {
            this.flushLogs();
        }
    }

    /**
     * 获取调用者信息
     */
    private getCallerInfo(): string {
        const stack = new Error().stack;
        if (stack) {
            const lines = stack.split('\n');
            // 跳过当前方法和log方法的堆栈
            for (let i = 3; i < lines.length; i++) {
                const line = lines[i];
                if (line && !line.includes('Logger.') && !line.includes('node_modules')) {
                    const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
                    if (match) {
                        const [, func, file, lineNum] = match;
                        return `${path.basename(file || 'unknown')}:${lineNum}`;
                    }
                }
            }
        }
        return 'unknown';
    }

    /**
     * 输出到控制台
     */
    private outputToConsole(logMessage: LogMessage): void {
        const time = logMessage.timestamp;
        const level = logMessage.levelName.padEnd(5);
        const category = (logMessage.category || '').padEnd(10);
        const source = (logMessage.source || '').padEnd(15);
        
        let output = `[${time}] [${level}] [${category}] [${source}] ${logMessage.message}`;

        // 根据级别选择输出方法
        switch (logMessage.level) {
            case LogLevel.DEBUG:
                console.debug(output);
                break;
            case LogLevel.INFO:
                console.info(output);
                break;
            case LogLevel.WARN:
                console.warn(output);
                break;
            case LogLevel.ERROR:
            case LogLevel.FATAL:
                console.error(output);
                break;
        }
    }

    /**
     * 刷新日志到文件
     */
    private async flushLogs(): Promise<void> {
        if (!this._enableFile || this._cache.length === 0) {
            return;
        }

        try {
            // 检查是否已被dispose
            if (this.isDisposed()) {
                return;
            }

            const today = dayjs().format('YYYY-MM-DD');
            const logFile = path.join(this._logDir, `${today}.log`);
            
            const logs = this._cache.splice(0); // 清空缓存并获取所有日志
            const logLines = logs.map(log => {
                let line = `[${log.timestamp}] [${log.levelName}] [${log.category}] [${log.source}] ${log.message}`;
                return line;
            });

            await fs.outputFile(logFile, logLines.join('\n') + '\n', { encoding: 'utf8', flag: 'a' });
        } catch (error) {
            // 只在没有被dispose的情况下输出错误
            if (!this.isDisposed()) {
                console.error('Failed to flush logs to file:', error);
            }
        }
    }

    /**
     * 获取最近的日志
     */
    public getRecentLogs(count: number = 50): LogMessage[] {
        return this._cache.slice(-count);
    }

    /**
     * 按级别过滤日志
     */
    public getLogsByLevel(level: LogLevel): LogMessage[] {
        return this._cache.filter(log => log.level === level);
    }

    /**
     * 按分类过滤日志
     */
    public getLogsByCategory(category: string): LogMessage[] {
        return this._cache.filter(log => log.category === category);
    }

    /**
     * 清空缓存
     */
    public clearCache(): void {
        this._cache = [];
        this.info('Log cache cleared', 'LOGGER');
    }

    /**
     * 强制刷新日志
     */
    public async flush(): Promise<void> {
        await this.flushLogs();
    }

    /**
     * 设置日志级别
     */
    public setLogLevel(level: LogLevel): void {
        this._logLevel = level;
        this.info(`Log level changed to ${LogLevel[level]}`, 'LOGGER');
    }

    /**
     * 创建分类日志器
     */
    public createCategoryLogger(category: string) {
        return {
            debug: (msg: string) => this.debug(msg, category),
            info: (msg: string) => this.info(msg, category),
            warn: (msg: string) => this.warn(msg, category),
            error: (msg: string) => this.error(msg, category),
            fatal: (msg: string) => this.fatal(msg, category),
        };
    }

    /**
     * 获取日志统计
     */
    public getStats(): Record<string, number> {
        const stats: Record<string, number> = {};
        
        // 按级别统计
        for (const [key, value] of Object.entries(LogLevel)) {
            if (typeof value === 'number') {
                stats[key] = this._cache.filter(log => log.level === value).length;
            }
        }

        stats.TOTAL = this._cache.length;
        return stats;
    }

    /**
     * 清理资源
     */
    public async dispose(): Promise<void> {
        this.info('Logger disposing...', 'LOGGER');
        
        // 停止刷新计时器
        this.stopFlushTimer();
        
        // 最后一次刷新日志
        await this.flushLogs();
        
        // 清空缓存
        this._cache = [];
        
        console.log('🧹 Logger disposed');
    }
}