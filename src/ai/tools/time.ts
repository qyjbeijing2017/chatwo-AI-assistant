import { tool } from '@langchain/core/tools';
import dayjs from 'dayjs';

export const timeTool = tool(async () => {
    return dayjs().format('YYYY-MM-DD HH:mm:ss');
}, {
    name: "time",
    description: "获取当前的时间信息，返回格式为YYYY-MM-DD HH:mm:ss",
});