import { loadCredentials } from './credentials.mjs';

try {
  const {token, chatId} = loadCredentials();
  process.env.TELEGRAM_BOT_TOKEN = token;
  process.env.TELEGRAM_CHAT_ID = chatId;
  process.env.TELEGRAM_REPLY_ROUTER = '1';
} catch {
  console.error('Unable to load local Telegram credentials or paired chat.');
  process.exit(1);
}
await import('../build/index.js');
