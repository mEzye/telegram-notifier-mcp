import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const stateDir = join(homedir(), '.telegram-notifier-mcp');
export interface MessageRoute { threadId: string; alias: string; text: string; createdAt: string }
export async function atomicJson(path: string, value: unknown) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value), 'utf8');
  await rename(tmp, path);
}
export async function saveRoute(chatId: string, messageId: number, threadId: string, text: string) {
  if (!/^-?\d+$/.test(chatId) || !Number.isSafeInteger(messageId) || !/^[0-9a-f-]{36}$/i.test(threadId)) throw new Error('Invalid route identity');
  await mkdir(join(stateDir, 'routes'), {recursive: true});
  const alias = text.match(/^\[([^\]\r\n]+)\]/)?.[1] ?? 'Агент';
  await atomicJson(join(stateDir, 'routes', `${chatId}_${messageId}.json`), {threadId, alias, text, createdAt: new Date().toISOString()});
}
export async function loadRoute(chatId: string, messageId: number): Promise<MessageRoute | null> {
  if (!/^-?\d+$/.test(chatId) || !Number.isSafeInteger(messageId)) return null;
  try { return JSON.parse(await readFile(join(stateDir, 'routes', `${chatId}_${messageId}.json`), 'utf8')); }
  catch (error: any) { if (error.code === 'ENOENT') return null; throw error; }
}
