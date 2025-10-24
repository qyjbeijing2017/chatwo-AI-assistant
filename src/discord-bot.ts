import { Config } from "./config";
import { LogManager } from "./log/log.manager";
import { Logger } from "./log/logger";
import { Singleton } from "./utils/singleton";
import { ChannelType, Client, Events, GatewayIntentBits, Message, Partials, REST, Routes, SlashCommandBuilder, type Interaction, type OmitPartialGroupDMChannel, type VoiceBasedChannel } from "discord.js";
import { GoogleGenAI } from "@google/genai";
import { Agent } from "./ai/agent";

export class DiscordBot extends Singleton {
    protected config = Config.getInstance();
    private _appId: string = '';
    private _logger = new Logger(DiscordBot);
    private _agent = Agent.getInstance();

    public static getInstance(): DiscordBot {
        return super._getInstance(DiscordBot);
    }
    protected override initialize(): void {
    }
    public override async dispose(): Promise<void> {
        if (this.client.isReady()) {
            await this.stop();
        }
    }

    rest = new REST();
    client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.GuildVoiceStates,
        ],
        partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember],
    });

    private async testNetworkConnectivity() {
        this._logger.info('🔍 测试网络连接...');
        try {
            // 先尝试正常连接
            let response = await fetch('https://discord.com/api/v10/gateway', {
                method: 'GET',
                headers: {
                    'User-Agent': 'DiscordBot (chatwo-ai-assistant, 1.0.0)'
                }
            });

            if (response.ok) {
                const data: any = await response.json();
                this._logger.info('✅ Discord API连接正常');
                this._logger.info('Gateway URL:', data.url);
                return true;
            } else {
                this._logger.error('❌ Discord API响应错误:', response.status, response.statusText);
                return false;
            }
        } catch (error: any) {
            this._logger.error('❌ 网络连接测试失败:', error.message);

            // 如果是证书错误，提供解决方案
            if (error.message.includes('certificate')) {
                this._logger.info('🔧 检测到证书问题，可能的解决方案:');
                this._logger.info('   1. 如果在公司网络，请联系IT部门');
                this._logger.info('   2. 检查系统时间是否正确');
                this._logger.info('   3. 暂时设置 NODE_TLS_REJECT_UNAUTHORIZED=0 (不安全，仅用于测试)');
            }

            return false;
        }
    }

    private async connectWithRetry(discordToken: string, maxRetries = 3) {
        // 先测试网络连接
        const networkOk = await this.testNetworkConnectivity();
        if (!networkOk) {
            this._logger.warn('⚠️ 网络连接测试失败，但仍会尝试连接Discord...');
            this._logger.info('💡 可能的解决方案:');
            this._logger.info('   1. 检查防火墙设置');
            this._logger.info('   2. 检查代理设置');
            this._logger.info('   3. 尝试使用VPN');
            this._logger.info('   4. 检查系统时间是否正确');
        }

        for (let i = 0; i < maxRetries; i++) {
            try {
                await this.client.login(discordToken);
                this._logger.info('✅ Discord连接成功！');
                return;
            } catch (error: any) {
                this._logger.warn(`❌ Discord登录失败 (尝试 ${i + 1}/${maxRetries}):`, error.message);

                if (error.code === 'TokenInvalid') {
                    this._logger.fatal('Token无效，请检查你的DISCORD_BOT_TOKEN');
                    process.exit(1);
                }

                if (i < maxRetries - 1) {
                    this._logger.info(`⏳ ${3}秒后重试...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
        }
        throw new Error('❌ 所有重试都失败了，请检查网络连接或Token设置');
    }

    protected onClientReady = (client: Client) => {
        this._logger.info(`🤖 已登录为 ${client.user?.tag}`);
    }

    protected onClientError = (error: Error) => {
        this._logger.error('❌ Discord客户端错误:', error);
    }

    protected onClientWarning = (info: string) => {
        this._logger.warn('⚠️ Discord客户端警告:', info);
    }

    protected onInteractionCreate = async (interaction: Interaction) => {
        if (!interaction.isChatInputCommand()) return;
        this._logger.info(`💬 收到命令: ${interaction.commandName} 来自 ${interaction.user.tag}`);
        if (interaction.commandName === 'join') {
            const channel = interaction.options.getChannel('channel');
        } else if (interaction.commandName === 'ping') {
            await interaction.reply('Pong!');
        } else if (interaction.commandName === 'leave') {
            await interaction.reply('Left the voice channel (stub).');
        }
    }

    protected onMessageCreate = async (message: OmitPartialGroupDMChannel<Message<boolean>>) => {
        if (message.author.id === this._appId) return; // 忽略自己的消息
        if (message.content.includes(`<@${this._appId}>`) || message.channel.type === ChannelType.DM) {
            // 处理消息
            const context = await message.channel.messages.fetch({ limit: 5 });
            context.reverse();
            const history = context.map(msg => ` - [${msg.guild?.name || '私聊'}][${msg.author.displayName}]: ${msg.content}`).join('\n');
            this._logger.debug('Message history:', history);
            const response = await this._agent.ask(message.content.replace(`<@${this._appId}>`, '').trim());
            await this.replyLongText(message, response);
        }
    }

    // 处理长文本回复
    private replyLongText = async (message: OmitPartialGroupDMChannel<Message<boolean>>, text: string) => {
        const maxLength = this.config.getInt('DISCORD_REPLY_MAX_CHARS', 2000);
        
        if (text.length <= maxLength) {
            // 文本长度在限制内，直接回复
            await message.reply(text);
            return;
        }

        // 文本太长，需要分割发送
        const chunks = this.splitTextIntoChunks(text, maxLength);
        
        this._logger.info(`📝 长文本回复，共 ${chunks.length} 条消息`);
        
        try {
            // 发送第一条消息作为回复
            if (chunks[0]) {
                await message.reply(chunks[0]);
            }
            
            // 发送后续消息
            for (let i = 1; i < chunks.length; i++) {
                const chunk = chunks[i];
                if (chunk) {
                    // 稍微延迟，避免触发Discord速率限制
                    await new Promise(resolve => setTimeout(resolve, 500));
                    await message.channel.send(chunk);
                    this._logger.debug(`📤 发送第 ${i + 1}/${chunks.length} 条消息`);
                }
            }
            
            this._logger.info('✅ 长文本回复完成');
        } catch (error) {
            this._logger.error('❌ 发送长文本回复失败:', error);
            // 尝试发送错误提示
            try {
                await message.reply('⚠️ 回复消息太长，发送失败。请稍后重试。');
            } catch (fallbackError) {
                this._logger.error('❌ 连错误提示都发送失败:', fallbackError);
            }
        }
    }

    /**
     * 将长文本智能分割成多个块
     * 优先在句号、换行符等自然断点处分割
     */
    private splitTextIntoChunks(text: string, maxLength: number): string[] {
        const chunks: string[] = [];
        let currentChunk = '';
        
        // 定义分割优先级：换行 > 句号 > 感叹号 > 问号 > 逗号 > 分号 > 冒号 > 空格
        const splitPatterns = [
            /\n\n/g,      // 双换行（段落分隔）
            /\n/g,        // 单换行
            /[。！？]/g,   // 中文句号、感叹号、问号
            /[.!?]/g,     // 英文句号、感叹号、问号
            /[，；：、]/g,  // 中文逗号、分号、冒号、顿号
            /[,;:]/g,     // 英文逗号、分号、冒号
            / /g          // 空格
        ];

        const sentences = this.smartSplit(text, splitPatterns);
        
        for (const sentence of sentences) {
            // 如果单个句子就超过限制，强制按字符分割
            if (sentence.length > maxLength) {
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }
                
                // 强制分割超长句子
                const forceSplit = this.forceSplitLongText(sentence, maxLength);
                chunks.push(...forceSplit);
                continue;
            }
            
            // 检查加入当前句子后是否会超长
            if (currentChunk.length + sentence.length > maxLength) {
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk.trim());
                    currentChunk = sentence;
                } else {
                    currentChunk = sentence;
                }
            } else {
                currentChunk += sentence;
            }
        }
        
        // 添加最后一块
        if (currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
        }
        
        return chunks.filter(chunk => chunk.length > 0);
    }

    /**
     * 智能分割文本，优先在自然断点处分割
     */
    private smartSplit(text: string, patterns: RegExp[]): string[] {
        let parts = [text];
        
        for (const pattern of patterns) {
            const newParts: string[] = [];
            
            for (const part of parts) {
                const subParts = part.split(pattern);
                for (let i = 0; i < subParts.length; i++) {
                    const subPart = subParts[i];
                    if (subPart && subPart.length > 0) {
                        newParts.push(subPart);
                    }
                    // 保留分隔符（除了最后一个）
                    if (i < subParts.length - 1) {
                        const match = part.match(pattern);
                        if (match && match[0]) {
                            newParts.push(match[0]);
                        }
                    }
                }
            }
            
            parts = newParts.filter(p => p.length > 0);
        }
        
        return parts;
    }

    /**
     * 强制分割超长文本
     */
    private forceSplitLongText(text: string, maxLength: number): string[] {
        const chunks: string[] = [];
        const safeLength = maxLength - 10; // 留一些安全边距
        
        for (let i = 0; i < text.length; i += safeLength) {
            const chunk = text.slice(i, i + safeLength);
            chunks.push(chunk + (i + safeLength < text.length ? '...' : ''));
        }
        
        return chunks;
    }

    readonly stop = async (): Promise<void> => {
        if (!this.client.isReady()) {
            this._logger.info('Bot is not running');
        }
        await this.client.destroy();
        this.client.off(Events.ClientReady, this.onClientReady.bind(this));
        this.client.off(Events.Error, this.onClientError.bind(this));
        this.client.off(Events.Warn, this.onClientWarning.bind(this));
        this.client.off(Events.InteractionCreate, this.onInteractionCreate.bind(this));
        this._logger.info('Bot stopped');
    }

    async exec(): Promise<void> {
        if (this.client.isReady()) {
            this._logger.info('Bot is already running');
            return;
        }

        const discordToken = this.config.getText('DISCORD_TOKEN');
        if (!discordToken) {
            this._logger.error('未找到Discord Token！请设置环境变量 DISCORD_BOT_TOKEN 或 DISCORD_TOKEN');
            throw new Error('未找到Discord Token！请设置环境变量 DISCORD_BOT_TOKEN 或 DISCORD_TOKEN');
        }
        this._appId = this.config.getText('APPLICATION_ID');
        if (!this._appId) {
            this._logger.error('未找到应用ID！请设置环境变量 APPLICATION_ID');
            throw new Error('未找到应用ID！请设置环境变量 APPLICATION_ID');
        }

        this.rest.setToken(discordToken);
        await this.rest.put(Routes.applicationCommands(this._appId), {
            body: [
                new SlashCommandBuilder()
                    .setName('ping')
                    .setDescription('Replies with Pong!')
                    .toJSON(),
                new SlashCommandBuilder()
                    .setName('join')
                    .setDescription('Join a video call (stub)')
                    .addChannelOption((option) => option.setName('channel').setDescription('The channel to join').setRequired(true))
                    .toJSON(),
                new SlashCommandBuilder()
                    .setName('leave')
                    .setDescription('Leave the voice channel (stub)')
                    .toJSON(),
            ]
        });

        this.client.once(Events.ClientReady, this.onClientReady);
        this.client.on(Events.Error, this.onClientError);
        this.client.on(Events.Warn, this.onClientWarning);
        this.client.on(Events.InteractionCreate, this.onInteractionCreate);
        this.client.on(Events.MessageCreate, this.onMessageCreate);

        await this.connectWithRetry(discordToken);

        this._logger.info('Bot initialized');
    }
}