import { ChannelType, Client, Events, GatewayIntentBits, Message, Partials, REST, Routes, SlashCommandBuilder, type Interaction, type OmitPartialGroupDMChannel, type VoiceBasedChannel } from "discord.js";
import { Config } from "./config";
import { Singleton } from "./singleton";
import { Agent } from "./agent";
import { EndBehaviorType, entersState, joinVoiceChannel, VoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';
import fs from "fs-extra";
import { pipeline } from 'node:stream/promises';
import dayjs from "dayjs";
import prism from 'prism-media';
import { Listener } from "./listener";

export class Bot extends Singleton {
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
    private _appId: string = '';

    public static getInstance(): Bot {
        return super._getInstance(Bot);
    }

    protected override initialize(): void {
    }

    async run(): Promise<void> {
        if (this.client.isReady()) {
            console.log('Bot is already running');
            return;
        }
        const config = Config.getInstance();
        const discordToken = config.getText('DISCORD_TOKEN');
        if (!discordToken) {
            throw new Error('未找到Discord Token！请设置环境变量 DISCORD_BOT_TOKEN 或 DISCORD_TOKEN');
        }

        this._appId = config.getText('APPLICATION_ID');
        if (!this._appId) {
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

        process.on('SIGINT', this.stop);
        process.on('SIGTERM', this.stop);

        this.connectWithRetry(discordToken);
        console.log('Opus implementation:', prism.opus.Encoder.name);
        console.log('Bot initialized');
    }

    readonly stop = async (): Promise<void> => {
        if (!this.client.isReady()) {
            console.log('Bot is not running');
        }
        await Listener.getInstance().leave();
        await this.client.destroy();
        this.client.off(Events.ClientReady, this.onClientReady.bind(this));
        this.client.off(Events.Error, this.onClientError.bind(this));
        this.client.off(Events.Warn, this.onClientWarning.bind(this));
        this.client.off(Events.InteractionCreate, this.onInteractionCreate.bind(this));
        console.log('Bot stopped');
    }

    public override dispose(): void {

    }

    private async testNetworkConnectivity() {
        console.log('🔍 测试网络连接...');
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
                console.log('✅ Discord API连接正常');
                console.log('Gateway URL:', data.url);
                return true;
            } else {
                console.error('❌ Discord API响应错误:', response.status, response.statusText);
                return false;
            }
        } catch (error: any) {
            console.error('❌ 网络连接测试失败:', error.message);

            // 如果是证书错误，提供解决方案
            if (error.message.includes('certificate')) {
                console.log('🔧 检测到证书问题，可能的解决方案:');
                console.log('   1. 如果在公司网络，请联系IT部门');
                console.log('   2. 检查系统时间是否正确');
                console.log('   3. 暂时设置 NODE_TLS_REJECT_UNAUTHORIZED=0 (不安全，仅用于测试)');
            }

            return false;
        }
    }

    private async connectWithRetry(discordToken: string, maxRetries = 3) {
        // 先测试网络连接
        const networkOk = await this.testNetworkConnectivity();
        if (!networkOk) {
            console.warn('⚠️ 网络连接测试失败，但仍会尝试连接Discord...');
            console.log('💡 可能的解决方案:');
            console.log('   1. 检查防火墙设置');
            console.log('   2. 检查代理设置');
            console.log('   3. 尝试使用VPN');
            console.log('   4. 检查系统时间是否正确');
        }

        for (let i = 0; i < maxRetries; i++) {
            try {
                await this.client.login(discordToken);
                console.log('✅ Discord连接成功！');
                return;
            } catch (error: any) {
                console.error(`❌ Discord登录失败 (尝试 ${i + 1}/${maxRetries}):`, error.message);

                if (error.code === 'TokenInvalid') {
                    console.error('Token无效，请检查你的DISCORD_BOT_TOKEN');
                    process.exit(1);
                }

                if (i < maxRetries - 1) {
                    console.log(`⏳ ${3}秒后重试...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
        }
        throw new Error('❌ 所有重试都失败了，请检查网络连接或Token设置');
    }

    protected onClientReady = (client: Client) => {
        console.log(`🤖 已登录为 ${client.user?.tag}`);
    }

    protected onClientError = (error: Error) => {
        console.error('❌ Discord客户端错误:', error);
    }

    protected onClientWarning = (info: string) => {
        console.warn('⚠️ Discord客户端警告:', info);
    }

    protected onInteractionCreate = async (interaction: Interaction) => {
        if (!interaction.isChatInputCommand()) return;
        console.log(`💬 收到命令: ${interaction.commandName} 来自 ${interaction.user.tag}`);
        if (interaction.commandName === 'join') {
            const channel = interaction.options.getChannel('channel');
            const listener = Listener.getInstance();
            if (channel && channel.type === ChannelType.GuildVoice) {
                await interaction.reply({ content: `Joining voice channel: ${channel.name} (stub)` });
                await listener.listen(channel as VoiceBasedChannel);
                await interaction.followUp({ content: `Joined voice channel: ${channel.name}` });
            } else {
                await interaction.reply({ content: '❌ Please specify a valid voice channel.', ephemeral: true });
            }
        } else if (interaction.commandName === 'ping') {
            await interaction.reply('Pong!');
        } else if (interaction.commandName === 'leave') {
            const listener = Listener.getInstance();
            await listener.leave();
            await interaction.reply('Left the voice channel (stub).');
        }
    }

    protected onMessageCreate = async (message: OmitPartialGroupDMChannel<Message<boolean>>) => {
        if (message.author.id === this._appId) return; // 忽略自己的消息
        if (message.content.includes(`<@${this._appId}>`) || message.channel.type === ChannelType.DM) {
            // 处理消息
            const context = await message.channel.messages.fetch({ limit: 5 });
            context.reverse();
            const history = context.map(msg => ` - [${msg.author.id}]: ${msg.content}`).join('\n');
            await Agent
                .getInstance()
                .ask(message.content, history, message.channel.id, (part) => {
                    message.channel.send({ content: part })
                });
        }
    }
}