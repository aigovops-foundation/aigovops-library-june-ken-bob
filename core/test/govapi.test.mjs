// test/govapi.test.mjs
// Ticket A2 — the governed loop, exposed. An agent can drive
// propose -> decide -> runTool -> verify, and every step is gated + receipted.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-govapi-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const { createGovernedCore } = await import('../src/core/govapi.js');
const { FileProvider } = await import('../src/core/secrets.fileprovider.js');
const { Caps } = await import('../src/core/caps.js');
const beacon = await import('../src/core/beacon.js');

const SCOPE = 'github-deploy';
function store() {
  const p = path.join(TMP, `store-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(p, JSON.stringify({ owner: 'lab', scopes: { [SCOPE]: 'MASTER-DO-NOT-LEAK' }, rotated: {} }));
  return p;
}
function actions() {
  const f = beacon.ledgerFile();
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).record.action);
}

test('end-to-end: propose -> approve -> runTool, with linked receipts', async () => {
  const caps = new Caps();
  caps.setProfile('agent:maker', { level: 'act' });
  const core = createGovernedCore({ secrets: new FileProvider({ storePath: store() }), caps });

  const { pendingId, requiresHumanGate } = core.propose('deploy the library site', { actor: 'agent:maker' });
  assert.equal(requiresHumanGate, true, 'an irreversible intent needs a human gate');

  const before = beacon.ledgerCount();
  const decided = core.decide(pendingId, 'approve', { scope: SCOPE, ttlSeconds: 60, cost: { requiredLevel: 'act' } });
  assert.equal(decided.approved, true);
  assert.ok(decided.grant && decided.grant.token, 'approval brokers a scoped token');
  assert.notEqual(decided.grant.token, 'MASTER-DO-NOT-LEAK', 'token is never the master secret');

  const result = await core.runTool({ token: decided.grant.token, code: 'export default async () => "built";' });
  assert.equal(result.ok, true);
  assert.equal(result.result, 'built');

  assert.equal(core.verify().valid, true, 'ledger chain + signatures valid');
  const after = actions().slice(before);
  assert.ok(after.includes('approve'), 'proposal approval receipt');
  assert.ok(after.includes('issue'), 'brokered-secret receipt');
  assert.ok(after.includes('tool-run'), 'tool-run receipt');
});

test('deny fails closed: no token, no tool run', async () => {
  const core = createGovernedCore({ secrets: new FileProvider({ storePath: store() }) });
  const { pendingId } = core.propose('delete the production ledger', { actor: 'agent:maker' });
  const decided = core.decide(pendingId, 'deny', { scope: SCOPE });
  assert.equal(decided.approved, false);
  assert.equal(decided.grant, null, 'deny brokers nothing');
  await assert.rejects(() => core.runTool({ code: 'export default () => 1;' }), /token is required/);
});

test('over-cap pauses with a breach receipt, no grant', () => {
  const caps = new Caps();
  caps.setProfile('agent:maker', { level: 'act', maxSpend: 0 });
  const core = createGovernedCore({ secrets: new FileProvider({ storePath: store() }), caps });
  const { pendingId } = core.propose('deploy something costly', { actor: 'agent:maker' });
  const before = beacon.ledgerCount();
  const decided = core.decide(pendingId, 'approve', { scope: SCOPE, cost: { requiredLevel: 'act', spend: 5 } });
  assert.equal(decided.approved, false);
  assert.equal(decided.capped, true);
  assert.match(decided.reason, /capped:spend-cap/);
  assert.ok(actions().slice(before).includes('cap-breach'), 'a breach receipt is emitted');
});

test('skills.list/run flow through the same gate+ledger', () => {
  const core = createGovernedCore({ secrets: new FileProvider({ storePath: store() }) });
  assert.ok(core.skills.list().some(s => s.name === 'framework-map'));
  const res = core.skills.run('framework-map', { input: 'an AI tool that screens job candidates' });
  assert.ok(res.result.gates.length > 0);
});

test('kill switch halts new work', () => {
  const core = createGovernedCore({ secrets: new FileProvider({ storePath: store() }) });
  core.halt();
  assert.equal(core.isHalted(), true);
  assert.throws(() => core.propose('anything'), /halted/);
  core.resume();
  assert.equal(core.propose('read the docs').requiresHumanGate, false);
});

test('#3 review queue: SLA deadline, assignee, overdue filtering, sorted by due', () => {
  let clock = 1_000_000;
  const core = createGovernedCore({ secrets: new FileProvider({ storePath: store() }), now: () => clock, slaMs: { read: 100, propose: 100, act: 100, auto: 100 } });
  const a = core.propose('publish the quarterly report', { actor: 'agent:maker' });
  core.propose('read the docs', { actor: 'agent:maker' });

  let q = core.pending();
  assert.equal(q.length, 2);
  assert.ok(q.every((r) => typeof r.dueAt === 'number' && r.overdue === false));

  core.assign(a.pendingId, 'reviewer:ken');
  assert.equal(core.pending({ assignee: 'reviewer:ken' }).length, 1);
  assert.equal(core.pending({ assignee: 'reviewer:ken' })[0].pendingId, a.pendingId);

  clock += 200;                                              // past the 100ms SLA
  assert.equal(core.pending({ overdue: true }).length, 2);
  assert.throws(() => core.assign('prop_nope', 'x'), /unknown or already-decided/);
});

test('#1 the kill switch is GLOBAL across replicas via the shared store', async () => {
  const { MemoryStore } = await import('../src/core/statestore.js');
  const shared = new MemoryStore();   // one store = one cluster (Redis in prod)
  const a = createGovernedCore({ secrets: new FileProvider({ storePath: store() }), store: shared });
  const b = createGovernedCore({ secrets: new FileProvider({ storePath: store() }), store: shared });
  assert.equal(a.isHalted(), false); assert.equal(b.isHalted(), false);

  a.oversight({ role: 'steward', id: 'steward:bob' }).kill();   // steward kills on replica A
  assert.equal(a.isHalted(), true, 'A halts immediately (it originated the kill)');
  assert.equal(b.isHalted(), false, 'B has not polled yet (local cache)');

  await b.syncHalt();                                            // B refreshes from the shared store
  assert.equal(b.isHalted(), true, 'B halts after syncing the global state');
  assert.throws(() => b.propose('act on something'), /halted/);  // B fails closed cluster-wide

  a.resume();                                                    // lift on A
  await b.syncHalt();
  assert.equal(b.isHalted(), false, 'B resumes after syncing');
});
