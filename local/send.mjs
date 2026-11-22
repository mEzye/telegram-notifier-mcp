import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const text = process.argv[2];
const threadId = process.env.CODEX_THREAD_ID;
if (!text || !threadId) throw new Error('Usage: run within the sending agent: node local/send.mjs <message>');
const client = new Client({name:'telegram-agent-sender',version:'1.0.0'});
try {
  await client.connect(new StdioClientTransport({command:process.execPath,args:['D:/Assistant/telegram-notifier-mcp/local/launch.mjs']}));
  const result = await client.callTool({name:'send_message',arguments:{text,agentThreadId:threadId}});
  console.log(JSON.stringify(result));
  if (result.isError) process.exitCode=1;
} finally { await client.close(); }
