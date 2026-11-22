import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const telegramMessageId = Number(process.argv[2]);
const stage = process.argv[3];
const threadId = process.env.CODEX_THREAD_ID;
const replyToMessageId = process.argv[4] ? Number(process.argv[4]) : undefined;
if (!Number.isSafeInteger(telegramMessageId) || !threadId || !['started','completed'].includes(stage)) throw new Error('Usage within the receiving agent: ack-reply.mjs <message-id> started|completed [old-original-message-id]');
const client = new Client({name:'telegram-reply-receipt',version:'1.0.0'});
try {
  await client.connect(new StdioClientTransport({command:process.execPath,args:['D:/Assistant/telegram-notifier-mcp/local/launch.mjs']}));
  const result = await client.callTool({name:'acknowledge_reply',arguments:{telegramMessageId,stage,agentThreadId:threadId,...(replyToMessageId?{replyToMessageId}:{})}});
  console.log(JSON.stringify(result));
  if (result.isError) process.exitCode=1;
} finally { await client.close(); }
