import { DiscordBot } from "./discord-bot";


async function main() {
    const bot = DiscordBot.getInstance();
    await bot.exec();
}

main().catch(error => {
    console.error('❌ 启动Bot时出错:', error);
    process.exit(1);
});
