// test/workflow.test.mjs
// #2 — durable multi-step workflows: define → start → advance/reject, SLA overdue
// + escalation, resumable from the shared store (any engine instance can advance),
// and metadata-only receipts (the member `data` never enters the ledger).

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-wf-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const { Workflows } = await import('../src/core/workflow.js');
const { MemoryStore } = await import('../src/core/statestore.js');
const noEmit = () => ({ kid: 'k', record: { ts: 'T' } });

test('define → start → advance to completed; RESUMABLE from a second engine (shared store)', async () => {
  let clock = 1000;
  const store = new MemoryStore();
  const w = new Workflows({ store, emit: noEmit, now: () => clock });
  await w.define('review', [{ id: 'draft', requiresApproval: false, slaMs: 100 }, { id: 'approve', slaMs: 100 }]);

  const inst = await w.start('review', { actor: 'oidc:bob' });
  assert.equal(inst.state, 'running');
  assert.equal(inst.steps[0].status, 'active');

  // a DIFFERENT engine sharing the store advances it — the replica-agnostic win
  const w2 = new Workflows({ store, emit: noEmit, now: () => clock });
  let i = await w2.advance(inst.id, { decision: 'approve', actor: 'oidc:ken' });
  assert.equal(i.stepIndex, 1);
  assert.equal(i.steps[1].status, 'active');
  i = await w2.advance(inst.id, { decision: 'approve' });
  assert.equal(i.state, 'completed');
});

test('reject halts; member data stays out of the ledger (metadata-only)', async () => {
  const receipts = [];
  const store = new MemoryStore();
  const w = new Workflows({ store, emit: (m) => { receipts.push(m); return noEmit(); }, now: () => 1 });
  await w.define('d', [{ id: 's1' }]);
  const inst = await w.start('d', { data: { note: 'SENSITIVE-PAYLOAD' } });
  await w.advance(inst.id, { decision: 'reject', note: 'looks risky' });

  assert.equal((await w.get(inst.id)).state, 'rejected');
  assert.ok(!JSON.stringify(receipts).includes('SENSITIVE-PAYLOAD'), 'payload never in a receipt');
  assert.ok(!JSON.stringify(receipts).includes('looks risky'), 'note text hashed, not stored');
  assert.equal((await store.get(`wf:data:${inst.id}`)).note, 'SENSITIVE-PAYLOAD', 'data retrievable from the store');
});

test('SLA overdue + escalation', async () => {
  let clock = 1000;
  const store = new MemoryStore();
  const w = new Workflows({ store, emit: noEmit, now: () => clock });
  await w.define('d', [{ id: 's1', slaMs: 50 }]);
  const inst = await w.start('d', {});
  assert.equal(w.isOverdue(await w.get(inst.id)), false);
  clock += 100;
  assert.equal(w.isOverdue(await w.get(inst.id)), true);
  assert.equal((await w.list({ overdue: true })).length, 1);
  const esc = await w.escalate(inst.id, { to: 'reviewer:lead' });
  assert.ok(esc.escalated && esc.steps[0].assignee === 'reviewer:lead');
});

test('fails closed: unknown def, unknown instance, advancing a finished one', async () => {
  const w = new Workflows({ store: new MemoryStore(), emit: noEmit });
  await assert.rejects(() => w.start('ghost', {}), /no workflow definition/);
  await assert.rejects(() => w.get('nope'), /no workflow/);
  await w.define('d', [{ id: 's1' }]);
  const inst = await w.start('d', {});
  await w.advance(inst.id, { decision: 'approve' });        // single step → completed
  await assert.rejects(() => w.advance(inst.id, { decision: 'approve' }), /is completed/);
});

test('Workflows requires a store (fails loud)', () => {
  assert.throws(() => new Workflows({}), /needs a state store/);
});
