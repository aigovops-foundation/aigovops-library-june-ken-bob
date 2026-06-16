// test/plan.test.mjs
// #6 — the conversational/agentic plan step. The model drafts a plan; the intent
// is classified by the policy engine and queued as a proposal the human approves
// inline. No effect happens at plan time — it's propose-with-a-plan.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-plan-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');
const STORE = path.join(TMP, 'secrets.json');
fs.writeFileSync(STORE, JSON.stringify({ owner: 'lab', scopes: { 'github-deploy': 'M' }, rotated: {} }));

const { createGovernedCore } = await import('../src/core/govapi.js');
const { FileProvider } = await import('../src/core/secrets.fileprovider.js');

// Injected model so the test needs no Ollama/cloud.
const fakeModel = async ({ prompt }) => ({ text: '1. Draft it\n2. PAUSE for human approval\n3. Publish on approval', model: { provider: 'test', name: 'fake-1' } });

function core() {
  return createGovernedCore({ secrets: new FileProvider({ storePath: STORE }), model: fakeModel });
}

test('plan() drafts a plan and queues a gated proposal for an irreversible ask', async () => {
  const c = core();
  const r = await c.plan('publish our Q3 governance update', { actor: 'member:alice' });
  assert.match(r.plan, /PAUSE for human approval/);
  assert.strictEqual(r.model.provider, 'test');
  assert.ok(r.pendingId, 'a proposal was queued');
  assert.strictEqual(r.requiresHumanGate, true, 'publish is gated');
  // it is queued (not executed) — appears in the approval queue
  assert.ok((await c.pending()).some((p) => p.pendingId === r.pendingId));
});

test('plan() for a reversible ask needs no gate, and approving it brokers a token', async () => {
  const c = core();
  const r = await c.plan('summarize the latest framework changes', { actor: 'member:alice' });
  assert.strictEqual(r.requiresHumanGate, false, 'summarize is reversible');
  // the human can still decide it; an irreversible one brokers on approve
  const r2 = await c.plan('deploy the updated site', { actor: 'member:alice' });
  const decided = await c.decide(r2.pendingId, 'approve', { scope: 'github-deploy' });
  assert.ok(decided.grant && decided.grant.token, 'approving the planned action brokers a scoped token');
});

test('plan() refuses while halted (fails closed)', async () => {
  const c = core();
  c.halt();
  await assert.rejects(() => c.plan('do something'), /halted/);
});
