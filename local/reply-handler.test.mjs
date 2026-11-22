import test from 'node:test';
import assert from 'node:assert/strict';
import { handleUpdate } from './reply-handler.mjs';
import { classifyQueueResult } from './queue-result.mjs';

function fixture() {
  const journal = new Map(), notifications = [], dispatched = [], receipts = [];
  const route = {threadId:'00000000-0000-4000-8000-000000000001', alias:'Телеграм', text:'[Телеграм] Оригінал'};
  const deps = {
    chatId:'123', botId:456,
    readJournal: async id => journal.get(id),
    writeJournal: async (id, value) => journal.set(id, value),
    loadRoute: async () => route,
    registerReceipt: async () => {},
    markReceived: async (id, threadId) => receipts.push({id,threadId}),
    notify: async (_m, text) => notifications.push(text),
    dispatch: async (id, text) => {dispatched.push({id,text}); return {status:'accepted'};},
  };
  const update = {update_id:10, message:{message_id:20, chat:{id:123,type:'private'}, from:{id:123,is_bot:false}, text:'Продовжуй', reply_to_message:{message_id:19, from:{id:456,is_bot:true},text:'[Телеграм] Оригінал'}}};
  return {deps,update,journal,notifications,dispatched,receipts,route};
}
test('Reply delivers owner text and quoted original to the exact mapped agent', async () => {
  const f=fixture(); await handleUpdate(f.update,f.deps);
  assert.equal(f.dispatched.length,1); assert.equal(f.dispatched[0].id,f.route.threadId);
  assert.ok(f.dispatched[0].text.includes('Продовжуй')); assert.ok(f.dispatched[0].text.includes('[Телеграм] Оригінал'));
  assert.equal(f.notifications.length,0); assert.equal(f.receipts.length,1);
});
test('duplicate update does not trigger the agent twice', async () => {
  const f=fixture(); await handleUpdate(f.update,f.deps); await handleUpdate(f.update,f.deps);
  assert.equal(f.dispatched.length,1);
});
test('foreign sender or chat is ignored', async () => {
  const f=fixture(); f.update.message.from.id=999; await handleUpdate(f.update,f.deps);
  f.update.message.from.id=123; f.update.message.chat.id=999; await handleUpdate(f.update,f.deps);
  assert.equal(f.dispatched.length,0); assert.equal(f.notifications.length,0);
});
test('unregistered old message reports no agent without using its visible alias as authority', async () => {
  const f=fixture(); f.deps.loadRoute=async()=>null; await handleUpdate(f.update,f.deps);
  assert.equal(f.dispatched.length,0); assert.match(f.notifications[0],/не знайдено/);
});
test('reply to another user cannot route a message', async () => {
  const f=fixture(); f.update.message.reply_to_message.from.id=123; await handleUpdate(f.update,f.deps);
  assert.equal(f.dispatched.length,0);
});
test('deleted agent reports unavailable identity', async () => {
  const f=fixture(); f.deps.dispatch=async()=>({status:'missing'}); await handleUpdate(f.update,f.deps);
  assert.match(f.notifications[0],/більше не існує/);
});
test('resume warning is reported as queued, not started', async () => {
  const f=fixture(); f.deps.dispatch=async()=>({status:'queued'}); await handleUpdate(f.update,f.deps);
  assert.match(f.notifications[0],/не зміг запустити/);
});
test('existing live writer is reported as waiting, without claiming failure or completion', async () => {
  assert.equal(classifyQueueResult(0,'Queued message 123 for thread 456.','Warning: message was queued, but could not resume thread: thread already has an active writer'),'waiting');
  const f=fixture(); f.deps.dispatch=async()=>({status:'waiting'}); await handleUpdate(f.update,f.deps);
  assert.equal(f.notifications.length,0); assert.equal(f.receipts.length,1);
});
test('real queue errors distinguish missing agents from an offline server', () => {
  assert.equal(classifyQueueResult(1,'','no rollout found for thread id 00000000'),'missing');
  assert.equal(classifyQueueResult(1,'','failed to connect to socket'),'unavailable');
  assert.equal(classifyQueueResult(0,'Queued message 123.','Warning: message was queued, but could not resume thread: start a local daemon'),'queued');
});
test('interrupted dispatch is never blindly replayed after restart', async () => {
  const f=fixture(); f.journal.set(10,{status:'dispatching'}); await handleUpdate(f.update,f.deps);
  assert.equal(f.dispatched.length,0); assert.match(f.notifications[0],/Не можу підтвердити/);
});
test('failed eyes reaction retries without dispatching the request twice', async () => {
  const f=fixture(); let attempts=0; f.deps.markReceived=async()=>{if (++attempts===1) throw new Error('offline')};
  await assert.rejects(handleUpdate(f.update,f.deps)); await handleUpdate(f.update,f.deps);
  assert.equal(f.dispatched.length,1); assert.equal(attempts,2); assert.equal(f.notifications.length,0);
});
