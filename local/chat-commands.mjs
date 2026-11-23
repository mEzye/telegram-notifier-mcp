import { win32 } from 'node:path';
import { stat } from 'node:fs/promises';

export const DEFAULT_CHAT_CWD='D:/Assistant';
const help='Команди:\n/new — новий чат Full Access у D:/Assistant\n/new D:/Projects/MyApp — новий чат Full Access у вказаній папці\n/archive — архівувати чат, відповівши на його повідомлення\n/archive UUID — архівувати чат за його ID';

export function parseCommand(text, botUsername) {
  const match=/^\s*\/([a-z_]+)(?:@([a-z0-9_]+))?(?:\s+([\s\S]*))?\s*$/i.exec(text??'');
  if(!match)return null;
  if(match[2]&&match[2].toLowerCase()!==botUsername?.toLowerCase())return {name:'other-bot',argument:''};
  return {name:match[1].toLowerCase(),argument:(match[3]??'').trim()};
}
export async function resolveChatCwd(argument, inspect=stat) {
  let cwd=argument.trim()||DEFAULT_CHAT_CWD;
  if((cwd.startsWith('"')&&cwd.endsWith('"'))||(cwd.startsWith("'")&&cwd.endsWith("'")))cwd=cwd.slice(1,-1);
  if(!/^[a-z]:[\\/]/i.test(cwd)||/[\x00-\x1f]/.test(cwd))throw new Error('Вкажи повний шлях до папки, наприклад /new D:/Projects/MyApp');
  cwd=win32.normalize(cwd).replaceAll('\\','/');
  let info;try{info=await inspect(cwd);}catch{throw new Error(`Папка не існує або недоступна: ${cwd}`);}
  if(!info.isDirectory())throw new Error(`Це не папка: ${cwd}`);
  return cwd;
}
export function chatAlias(cwd, threadId) {
  const word=win32.basename(cwd).replace(/[^\p{L}\p{N}]/gu,'').slice(0,20)||'Чат';
  return `${word}${threadId.replaceAll('-','').slice(-4)}`;
}

export async function handleChatCommand(update, deps, command) {
  const m=update.message;
  if(command.name==='other-bot')return;
  const finish=async(text,route)=>{
    const record={status:'command-result',text,route};
    await deps.writeJournal(update.update_id,record);
    await deps.notify(m,text,route);
    await deps.writeJournal(update.update_id,{status:'command-complete'});
  };
  const previous=await deps.readJournal(update.update_id);
  if(previous){
    if(previous.status==='command-result')await finish(previous.text,previous.route);
    else if(['creating-chat','archiving-chat'].includes(previous.status))await finish('Не можу підтвердити результат команди після перезапуску. Автоматично повторювати її не буду.');
    return;
  }
  if(command.name==='new'){
    let cwd;
    try{cwd=await resolveChatCwd(command.argument,deps.inspectDirectory);}catch(error){await finish(error.message);return;}
    await deps.writeJournal(update.update_id,{status:'creating-chat',cwd});
    let thread;
    try{thread=await deps.createThread(cwd);}catch{await finish('Codex не підтвердив створення нового чату. Автоматично повторювати створення не буду.');return;}
    const alias=chatAlias(cwd,thread.id);
    await finish(`[${alias}] Новий чат готовий.\nПапка: ${cwd}\nРежим: Full Access\nID: ${thread.id}\n\nНапиши завдання через «Відповісти» на це повідомлення.`,{threadId:thread.id,alias});
    return;
  }
  if(command.name==='archive'){
    let route;
    if(command.argument){
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(command.argument)){await finish('Вкажи ID чату після /archive або надішли /archive через Reply на повідомлення потрібного агента.');return;}
      route={threadId:command.argument,alias:'Чат'};
    }else{
      if(m.reply_to_message?.from?.id!==deps.botId){await finish('Надішли /archive через «Відповісти» на повідомлення чату, який хочеш архівувати.');return;}
      route=await deps.loadRoute(deps.chatId,m.reply_to_message.message_id);
      if(!route){await finish('Не знайшов чат для цього повідомлення. Використай новіше повідомлення агента або /archive UUID.');return;}
    }
    if(await deps.isArchived(route.threadId)){await finish(`[${route.alias}] Цей чат уже архівований.`,route);return;}
    await deps.writeJournal(update.update_id,{status:'archiving-chat',threadId:route.threadId});
    try{await deps.archiveThread(route.threadId);await deps.markArchived(route.threadId);}catch{await finish('Codex не підтвердив архівацію. Перевір, чи цей чат існує і чи доступний сервер.');return;}
    await finish(`[${route.alias}] Чат архівовано. Історія збережена.\nДля нового чату: /new`,route);
    return;
  }
  await finish(help);
}
