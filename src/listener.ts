import { Config } from "./config";
import { Singleton } from "./singleton";
import { Model, Recognizer, setLogLevel } from 'vosk';
import { EndBehaviorType, entersState, joinVoiceChannel, VoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';
import type { VoiceBasedChannel } from "discord.js";
import prism from "prism-media";

export class Listener extends Singleton {
    private _config = Config.getInstance();
    private _model = new Model(this._config.getText('VOSK_MODEL_PATH', './models/vosk-model-small-en-us-0.15'));
    private _recognizer = new Recognizer({ model: this._model, sampleRate: 16000 });
    private _connections: VoiceConnection | null = null;

    public static getInstance(): Listener {
        return super._getInstance(Listener);
    }

    protected override initialize(): void {
        setLogLevel(0);
    }

    async listen(channel: VoiceBasedChannel) {
        await this.leave();
        this._connections = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false,
        });

        this._connections.on(VoiceConnectionStatus.Disconnected, this.leave);
        await entersState(this._connections, VoiceConnectionStatus.Ready, 30_000);

        this._connections.receiver.speaking.on('start', this.onUserSpeaking);

    }

    protected onUserSpeaking = async (userId: string) => {
        if (!this._connections) return;
        const receiver = this._connections.receiver;
        const opusStream = receiver.subscribe(userId, {
            end: {
                behavior: EndBehaviorType.AfterSilence,
                duration: 1000,
            },
        });
        const pcmStream = opusStream.pipe(
            new prism.opus.Decoder({
                rate: 16000,
                channels: 1,
                frameSize: 960,
            })
        );
        
    };

    leave = async () => {
        if (this._connections) {
            this._connections.removeAllListeners();
            this._connections.destroy();
            this._connections = null;
        }
    }

    public dispose(): void {
    }
}