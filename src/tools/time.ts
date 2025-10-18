import { tool } from '@langchain/core/tools';

const time = tool(
    async (): Promise<string> => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    },
    {
        name: 'time',
        description: '获取当前的时间，返回格式为YYYY-MM-DD HH:mm:ss',
    }
);
export { time };