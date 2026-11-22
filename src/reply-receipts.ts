import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicJson, loadRoute, stateDir } from './reply-routing.js';

type Stage = 'received' | 'started' | 'completed';
interface Receipt { threadId: string; replyToMessageId: number; stage: 'queued' | Stage; receivedAt?: string; startedAt?: string; completedAt?: string }
export class ReplyReceipts {
  constructor(private root = stateDir) {}
  private path(chatId: string, messageId: number) {
    if (!/^-?\d+$/.test(chatId) || !Number.isSafeInteger(messageId) || messageId < 1) throw new Error('Invalid receipt identity');
    return join(this.root, 'reply-receipts', `${chatId}_${messageId}.json`);
  }
  async read(chatId: string, messageId: number): Promise<Receipt | null> {
    try { return JSON.parse(await readFile(this.path(chatId, messageId), 'utf8')); }
    catch (error: any) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async register(chatId: string, messageId: number, threadId: string, replyToMessageId: number) {
    const existing = await this.read(chatId, messageId);
    if (existing) {
      if (existing.threadId !== threadId || existing.replyToMessageId !== replyToMessageId) throw new Error('Receipt binding mismatch');
      return existing;
    }
    await mkdir(join(this.root, 'reply-receipts'), {recursive: true});
    const receipt: Receipt = {threadId, replyToMessageId, stage: 'queued'};
    await atomicJson(this.path(chatId, messageId), receipt);
    return receipt;
  }
  async acknowledge(chatId: string, messageId: number, threadId: string, stage: Stage, react: (emoji: string) => Promise<void>) {
    const receipt = await this.read(chatId, messageId);
    if (!receipt || receipt.threadId !== threadId) throw new Error('This reply is not bound to the sending agent');
    const rank = {queued: 0, received: 1, started: 2, completed: 3};
    if (rank[receipt.stage] >= rank[stage]) return receipt.stage;
    if (stage === 'completed' && receipt.stage === 'queued') throw new Error('Acknowledge received or started before completed');
    if (stage === 'completed' || receipt.stage === 'queued') await react(stage === 'completed' ? '👍' : '👀');
    const field = stage === 'received' ? 'receivedAt' : stage === 'started' ? 'startedAt' : 'completedAt';
    const next = {...receipt, stage, [field]: new Date().toISOString()};
    await atomicJson(this.path(chatId, messageId), next);
    return stage;
  }
}
export const replyReceipts = new ReplyReceipts();
export async function acknowledgeReply(token: string, chatId: string, messageId: number, threadId: string, stage: Stage, replyToMessageId?: number) {
  // Allows the agent to acknowledge a pre-upgrade reply only after checking the original message's stored route.
  if (!await replyReceipts.read(chatId, messageId) && replyToMessageId) {
    const route = await loadRoute(chatId, replyToMessageId);
    if (!route || route.threadId !== threadId) throw new Error('Original message belongs to a different or missing agent');
    await replyReceipts.register(chatId, messageId, threadId, replyToMessageId);
  }
  return replyReceipts.acknowledge(chatId, messageId, threadId, stage, async emoji => {
    const response = await fetch(`https://api.telegram.org/bot${token}/setMessageReaction`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({chat_id: chatId, message_id: messageId, reaction: [{type: 'emoji', emoji}]}), signal: AbortSignal.timeout(15000),
    });
    const result = await response.json() as {ok: boolean; description?: string};
    if (!result.ok) throw new Error(`Telegram reaction failed: ${result.description ?? response.status}`);
  });
}
