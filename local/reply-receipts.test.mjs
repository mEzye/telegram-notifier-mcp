import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { ReplyReceipts } from '../build/reply-receipts.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(),'telegram-receipts-test-'));
  t.after(async()=>{
    if (!resolve(root).startsWith(resolve(tmpdir())+sep+'telegram-receipts-test-')) throw new Error('Unexpected test cleanup path');
    await rm(root,{recursive:true,force:true});
  });
  const store = new ReplyReceipts(root), reactions = [];
  const react = async emoji => reactions.push(emoji);
  await store.register('123',61,'agent-a',56);
  return {store,reactions,react};
}
test('queue receipt does not imply read; only receiving agent starts it', async t=>{
  const f=await fixture(t);
  assert.equal((await f.store.read('123',61)).stage,'queued'); assert.equal(f.reactions.length,0);
  await assert.rejects(f.store.acknowledge('123',61,'agent-b','started',f.react),/not bound/);
  assert.equal(f.reactions.length,0);
  await f.store.acknowledge('123',61,'agent-a','started',f.react);
  assert.deepEqual(f.reactions,['👀']); assert.equal((await f.store.read('123',61)).stage,'started');
});
test('completion requires real start, then replaces eyes without regressing', async t=>{
  const f=await fixture(t);
  await assert.rejects(f.store.acknowledge('123',61,'agent-a','completed',f.react),/before completed/);
  await f.store.acknowledge('123',61,'agent-a','started',f.react);
  await f.store.acknowledge('123',61,'agent-a','completed',f.react);
  await f.store.acknowledge('123',61,'agent-a','started',f.react);
  assert.deepEqual(f.reactions,['👀','👍']); assert.equal((await f.store.read('123',61)).stage,'completed');
});
test('router puts eyes on receipt immediately; completion needs no extra started call', async t=>{
  const f=await fixture(t);
  await f.store.acknowledge('123',61,'agent-a','received',f.react);
  assert.deepEqual(f.reactions,['👀']);
  await f.store.acknowledge('123',61,'agent-a','completed',f.react);
  await f.store.acknowledge('123',61,'agent-a','received',f.react);
  assert.deepEqual(f.reactions,['👀','👍']); assert.equal((await f.store.read('123',61)).stage,'completed');
});
test('Telegram reaction failure is never persisted as confirmed read', async t=>{
  const f=await fixture(t);
  await assert.rejects(f.store.acknowledge('123',61,'agent-a','started',async()=>{throw new Error('network failure')}));
  assert.equal((await f.store.read('123',61)).stage,'queued');
});
test('duplicate registration preserves the acknowledgment and rejects changed bindings', async t=>{
  const f=await fixture(t);
  await f.store.acknowledge('123',61,'agent-a','started',f.react);
  await f.store.register('123',61,'agent-a',56);
  assert.equal((await f.store.read('123',61)).stage,'started');
  await assert.rejects(f.store.register('123',61,'agent-b',56),/mismatch/);
});
