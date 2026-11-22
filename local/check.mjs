import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'local-install-check', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: 'D:/Assistant/.tools/node-v24.22.3-win-x64/node.exe',
  args: ['D:/Assistant/telegram-notifier-mcp/local/launch.mjs'],
});
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  console.log('MCP tools:', tools.map(t => t.name).join(', '));
  for (const tool of tools.filter(t => t.name.startsWith('send_'))) {
    if (!tool.inputSchema.properties?.agentThreadId) throw new Error(`Missing route parameter on ${tool.name}`);
  }
  const inbox = await client.callTool({name:'get_updates',arguments:{}});
  if (!inbox.isError) throw new Error('Agent inbox polling must be disabled while router is installed');
  if (process.argv.includes('--send') || process.argv.includes('--routed')) {
    const result = await client.callTool({name: 'send_message', arguments: {
      text: process.argv.includes('--routed')
        ? '[Телеграм] Перевірка Reply. Натисни «Відповісти» саме на це повідомлення та напиши «пінг». Я отримаю твій текст і це повідомлення у поточному треді.'
        : 'Telegram підключено до агентів на ноутбуці. Тестове повідомлення через готовий telegram-notifier-mcp.',
      ...(process.argv.includes('--routed') ? {agentThreadId:process.env.CODEX_THREAD_ID} : {})
    }});
    console.log(JSON.stringify(result));
    if (result.isError) process.exitCode = 1;
  }
} finally {
  await client.close();
}
