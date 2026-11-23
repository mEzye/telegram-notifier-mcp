import test from 'node:test';
import assert from 'node:assert/strict';
import {handleUpdate} from './reply-handler.mjs';
import {resolveChatCwd,parseCommand} from './chat-commands.mjs';
import {startTelegramThread} from './codex-client.mjs';

function fixture(text='/new'){
  const journal=new Map(), created=[], archived=[], notices=[], dispatched=[], markers=new Set();
  const id='00000000-0000-4000-8000-000000000001';
  const deps={chatId:'123',botId:456,botUsername:'test_bot',
    readJournal:async id=>journal.get(id),writeJournal:async(id,v)=>journal.set(id,v),
    inspectDirectory:async()=>({isDirectory:()=>true}),
    createThread:async cwd=>{created.push(cwd);return {id};},
    archiveThread:async id=>archived.push(id),isArchived:async id=>markers.has(id),markArchived:async id=>markers.add(id),
    loadRoute:async()=>({threadId:id,alias:'Проєкт'}),
    notify:async(m,text,route)=>notices.push({text,route}),dispatch:async(...v)=>dispatched.push(v),
  };
  const update={update_id:91,message:{message_id:90,chat:{id:123,type:'private'},from:{id:123},text}};
  return {deps,update,id,journal,created,archived,notices,dispatched,markers};
}
test('/new creates one blank chat in D:/Assistant and binds its introduction to the new thread',async()=>{
  const f=fixture();await handleUpdate(f.update,f.deps);await handleUpdate(f.update,f.deps);
  assert.deepEqual(f.created,['D:/Assistant']);assert.equal(f.notices[0].route.threadId,f.id);assert.equal(f.dispatched.length,0);
});
test('quoted folder with spaces is passed as one literal working directory',async()=>{
  const f=fixture('/new "D:/My Project"');await handleUpdate(f.update,f.deps);assert.deepEqual(f.created,['D:/My Project']);
});
test('invalid relative path cannot create a thread',async()=>{
  const f=fixture('/new ../other');await handleUpdate(f.update,f.deps);assert.equal(f.created.length,0);assert.equal(f.notices.length,1);
});
test('missing directory is reported without creation',async()=>{
  const f=fixture('/new D:/missing');f.deps.inspectDirectory=async()=>{throw new Error('ENOENT')};await handleUpdate(f.update,f.deps);assert.equal(f.created.length,0);
});
test('a foreign user cannot create or archive chats',async()=>{
  const f=fixture();f.update.message.from.id=789;await handleUpdate(f.update,f.deps);assert.equal(f.created.length,0);assert.equal(f.notices.length,0);
});
test('/archive in Reply targets the bound thread, not a recent or current thread',async()=>{
  const f=fixture('/archive');f.update.message.reply_to_message={message_id:5,from:{id:456}};
  await handleUpdate(f.update,f.deps);await handleUpdate(f.update,f.deps);
  assert.deepEqual(f.archived,[f.id]);assert.ok(f.markers.has(f.id));assert.equal(f.dispatched.length,0);
});
test('/archive without a target never selects a thread implicitly',async()=>{
  const f=fixture('/archive');await handleUpdate(f.update,f.deps);assert.equal(f.archived.length,0);assert.match(f.notices[0].text,/Відповісти/);
});
test('/archive UUID uses the explicitly supplied identity',async()=>{
  const f=fixture();f.update.message.text='/archive '+f.id;await handleUpdate(f.update,f.deps);assert.deepEqual(f.archived,[f.id]);
});
test('Reply cannot silently revive a chat archived through the bot',async()=>{
  const f=fixture('продовжуй');f.markers.add(f.id);f.update.message.reply_to_message={message_id:5,from:{id:456}};
  await handleUpdate(f.update,f.deps);assert.equal(f.dispatched.length,0);assert.match(f.notices[0].text,/архівований/);
});
test('notification retry does not create another chat',async()=>{
  const f=fixture();let calls=0;const notify=f.deps.notify;f.deps.notify=async(...v)=>{if(++calls===1)throw new Error('offline');return notify(...v)};
  await assert.rejects(handleUpdate(f.update,f.deps));await handleUpdate(f.update,f.deps);assert.equal(f.created.length,1);assert.equal(f.notices[0].route.threadId,f.id);
});
test('an interrupted creation is not replayed',async()=>{
  const f=fixture();f.journal.set(91,{status:'creating-chat',cwd:'D:/Assistant'});await handleUpdate(f.update,f.deps);assert.equal(f.created.length,0);
});
test('commands addressed to another bot are ignored',async()=>{
  const f=fixture('/new@other_bot');await handleUpdate(f.update,f.deps);assert.equal(f.created.length,0);assert.equal(f.notices.length,0);
  assert.equal(parseCommand('/new@test_bot D:/X','test_bot').name,'new');
});
test('a file cannot be selected as cwd',async()=>{
  await assert.rejects(resolveChatCwd('D:/file.txt',async()=>({isDirectory:()=>false})),/не папка/);
});
test('new Telegram threads explicitly request Full Access and keep the selected directory',async()=>{
  const calls=[];
  const client={call:async(method,params)=>{calls.push({method,params});return method==='thread/start'?{thread:{id:'00000000-0000-4000-8000-000000000001'}}:{};}};
  await startTelegramThread(client,'D:/My Project');
  assert.deepEqual(calls[0],{method:'thread/start',params:{cwd:'D:/My Project',serviceName:'telegram',sandbox:'danger-full-access',approvalPolicy:'never'}});
});
test('a failed title update never creates the Full Access thread twice',async()=>{
  let starts=0;
  const client={call:async method=>{if(method==='thread/start'){starts++;return {thread:{id:'00000000-0000-4000-8000-000000000001'}};}throw new Error('name update failed');}};
  const result=await startTelegramThread(client,'D:/Assistant');assert.equal(starts,1);assert.ok(result.thread.id);
});
