import { spawn } from 'node:child_process';
import lockfile from 'proper-lockfile';
import { mkdir, readFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadCredentials } from './credentials.mjs';
import { handleUpdate } from './reply-handler.mjs';
import { classifyQueueResult } from './queue-result.mjs';
import { stateDir, atomicJson, saveRoute, loadRoute } from '../build/reply-routing.js';
import { replyReceipts, acknowledgeReply } from '../build/reply-receipts.js';
import {withCodex,startTelegramThread} from './codex-client.mjs';

const credentials = loadCredentials();
await mkdir(join(stateDir, 'reply-journal'), {recursive: true});
await mkdir(join(stateDir, 'archived-threads'), {recursive: true});
const release = await lockfile.lock(stateDir, {
  lockfilePath: join(stateDir, 'reply-router-singleton.lock'), stale: 30000, update: 5000,
  onCompromised: () => process.exit(1),
});
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => {await release().catch(()=>{}); process.exit(0);});
const log = async event => appendFile(join(stateDir, 'reply-router.log'), `${new Date().toISOString()} ${event}\n`);
async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function api(method, body, timeout = 15000) {
  const response = await fetch(`https://api.telegram.org/bot${credentials.token}/${method}`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout)
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`Telegram ${method} failed (${response.status})`);
  return data.result;
}
export function dispatch(threadId, prompt) {
  return new Promise(resolve => {
    const child = spawn('C:/Users/Admin/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe',
      ['queue', '--remote', 'unix://' + join(homedir(), '.codex/app-server-control/app-server-control.sock').replaceAll('\\', '/'), '--thread', threadId, '--message', prompt, '--resume'], {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '', errors = '', settled = false;
    const finish = status => { if (settled) return; settled = true; clearTimeout(timer); resolve({status}); };
    const timer = setTimeout(() => { child.kill(); finish('uncertain'); }, 45000);
    child.stdout.on('data', data => { output = (output + data).slice(-16000); });
    child.stderr.on('data', data => { errors = (errors + data).slice(-16000); });
    child.on('error', () => finish('unavailable'));
    child.on('close', code => {
      finish(classifyQueueResult(code, output, errors));
    });
  });
}
const bot = await api('getMe', {});
await api('setMyCommands',{scope:{type:'chat',chat_id:Number(credentials.chatId)},commands:[
  {command:'new',description:'Новий чат Full Access. Типова папка D:/Assistant'},
  {command:'archive',description:'Архівувати чат: надішли команду через Reply'},
  {command:'help',description:'Показати команди та приклади'},
]}).catch(()=>log('command menu registration failed; text commands remain available'));
const deps = {
  chatId: credentials.chatId, botId: bot.id, botUsername:bot.username, loadRoute, dispatch,
  createThread: cwd=>withCodex(async client=>{
    const {thread}=await startTelegramThread(client,cwd);
    return {id:thread.id};
  }),
  archiveThread: threadId=>withCodex(client=>client.call('thread/archive',{threadId})),
  isArchived: async threadId=>{
    if(!/^[0-9a-f-]{36}$/i.test(threadId))return false;
    return !!await readJson(join(stateDir,'archived-threads',`${threadId}.json`));
  },
  markArchived: threadId=>atomicJson(join(stateDir,'archived-threads',`${threadId}.json`),{archivedAt:new Date().toISOString()}),
  registerReceipt: (id, threadId, replyTo) => replyReceipts.register(credentials.chatId, id, threadId, replyTo),
  markReceived: (id, threadId) => acknowledgeReply(credentials.token, credentials.chatId, id, threadId, 'received'),
  readJournal: id => readJson(join(stateDir, 'reply-journal', `${id}.json`)),
  writeJournal: (id, value) => atomicJson(join(stateDir, 'reply-journal', `${id}.json`), value),
  notify: async (m, text, route) => {
    const sent = await api('sendMessage', {chat_id: credentials.chatId, text, reply_parameters: {message_id: m.message_id}});
    if (route) await saveRoute(credentials.chatId, sent.message_id, route.threadId, `[${route.alias}] ${text}`);
  },
};
const offsetPath = join(stateDir, 'reply-router-offset.json');
let offset = (await readJson(offsetPath))?.offset ?? 0;
await atomicJson(join(stateDir, 'reply-router-status.json'), {pid: process.pid, startedAt: new Date().toISOString(), chatId: credentials.chatId});
await log('started');
let failures = 0;
while (true) {
  try {
    const updates = await api('getUpdates', {offset, timeout: 25, allowed_updates: ['message']}, 35000);
    for (const update of updates) {
      await handleUpdate(update, deps);
      offset = update.update_id + 1;
      await atomicJson(offsetPath, {offset});
    }
    failures = 0;
  } catch {
    failures++;
    if (failures === 1 || failures % 10 === 0) await log('poll or delivery failure; retrying without logging private data');
    await sleep(Math.min(30000, 1000 * 2 ** Math.min(failures, 5)));
  }
}
