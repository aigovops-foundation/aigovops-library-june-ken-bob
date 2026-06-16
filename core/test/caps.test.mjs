// test/caps.test.mjs
// Ticket 5 acceptance tests — capability dial + hard caps.
// "an agent at its cap halts instead of proceeding; turning the dial down
// takes effect on the next request."

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCOPE = 'github-deploy';
const MASTER = 'MASTER-SECRET-DO-NOT-LEAK-caps';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-caps-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const beacon = await import('../src/core/beacon.js');
const { FileProvider } = await import('../src/core/secrets.fileprovider.js');
const gate = await import('../src/core/gate.js');
const { Caps, LEVELS } = await import('../src/core/caps.js');

function store() {
  const p = path.join(TMP, `s-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(p, JSON.stringify({ owner: 'lab', scopes: { [SCOPE]: MASTER }, rotated: {} }));
  return p;
}
function proposal() {
  return { summary: 'Proposed: deploy the site', irreversible: true, requiresHumanGate: true };
}
function ledgerRecords() {
  const f = beacon.ledgerFile();
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// 1 — under cap: approve succeeds and grants a token
test('under cap: approve succeeds and grants a token', async () => {
  const secrets = new FileProvider({ storePath: store() });
  const caps = new Caps();
  caps.setProfile('agent:deploy', { level: 'act', maxSpend: 100 });

  const r = await gate.decide({
    proposal: proposal(), decision: 'approve', scope: SCOPE,
    ttlSeconds: 60, requestedBy: 'agent:deploy', secrets, caps,
    cost: { spend: 10 }
  });
  assert.strictEqual(r.approved, true);
  assert.ok(r.grant && r.grant.token, 'token was issued');
});

// 2 — at spend cap: halts (no grant) + breach receipt
test('at spend cap: halts instead of proceeding and emits a breach receipt', async () => {
  const secrets = new FileProvider({ storePath: store() });
  const caps = new Caps();
  caps.setProfile('agent:deploy', { level: 'act', maxSpend: 10 });

  // first request: spends 10 (hits the cap)
  const r1 = await gate.decide({
    proposal: proposal(), decision: 'approve', scope: SCOPE,
    ttlSeconds: 60, requestedBy: 'agent:deploy', secrets, caps,
    cost: { spend: 10 }
  });
  assert.strictEqual(r1.approved, true, 'first request under cap succeeds');

  // second request: would exceed cap → halts
  const before = beacon.ledgerCount();
  const r2 = await gate.decide({
    proposal: proposal(), decision: 'approve', scope: SCOPE,
    ttlSeconds: 60, requestedBy: 'agent:deploy', secrets, caps,
    cost: { spend: 1 }
  });
  assert.strictEqual(r2.approved, false, 'capped request is denied');
  assert.strictEqual(r2.capped, true, 'capped flag is set');
  assert.strictEqual(r2.reason, 'capped:spend-cap');
  assert.strictEqual(r2.grant, null, 'no token issued');

  // a breach receipt was emitted (proposal + breach = 2 new)
  const newRecs = ledgerRecords().slice(-(beacon.ledgerCount() - before));
  const breach = newRecs.find((s) => s.record.action === 'cap-breach');
  assert.ok(breach, 'a cap-breach receipt was emitted');
  assert.strictEqual(breach.record.detail.reason, 'spend-cap');
  assert.strictEqual(beacon.verifyLedger().valid, true, 'ledger verifies');
});

// 3 — at rate cap: halts
test('at rate cap: halts instead of proceeding', async () => {
  const secrets = new FileProvider({ storePath: store() });
  const caps = new Caps();
  caps.setProfile('agent:deploy', { level: 'act', maxRate: 1, windowMs: 60_000 });

  // first request: within rate
  const r1 = await gate.decide({
    proposal: proposal(), decision: 'approve', scope: SCOPE,
    ttlSeconds: 60, requestedBy: 'agent:deploy', secrets, caps
  });
  assert.strictEqual(r1.approved, true);

  // second request: exceeds rate cap
  const r2 = await gate.decide({
    proposal: proposal(), decision: 'approve', scope: SCOPE,
    ttlSeconds: 60, requestedBy: 'agent:deploy', secrets, caps
  });
  assert.strictEqual(r2.approved, false);
  assert.strictEqual(r2.reason, 'capped:rate-cap');
});

// 4 — turning the dial down takes effect on the next request
test('turning the dial down takes effect on the next request', async () => {
  const secrets = new FileProvider({ storePath: store() });
  const caps = new Caps();
  caps.setProfile('agent:deploy', { level: 'act', maxSpend: 1000 });

  // at level 'act': approve succeeds
  const r1 = await gate.decide({
    proposal: proposal(), decision: 'approve', scope: SCOPE,
    ttlSeconds: 60, requestedBy: 'agent:deploy', secrets, caps,
    cost: { requiredLevel: 'act' }
  });
  assert.strictEqual(r1.approved, true, 'act-level request succeeds at act');

  // turn the dial DOWN to 'read'
  caps.setLevel('agent:deploy', 'read');

  // the very next request at 'act' level is denied
  const r2 = await gate.decide({
    proposal: proposal(), decision: 'approve', scope: SCOPE,
    ttlSeconds: 60, requestedBy: 'agent:deploy', secrets, caps,
    cost: { requiredLevel: 'act' }
  });
  assert.strictEqual(r2.approved, false, 'act-level request denied at read');
  assert.strictEqual(r2.reason, 'capped:level');

  // turn the dial back UP to 'act' — next request succeeds again
  caps.setLevel('agent:deploy', 'act');
  const r3 = await gate.decide({
    proposal: proposal(), decision: 'approve', scope: SCOPE,
    ttlSeconds: 60, requestedBy: 'agent:deploy', secrets, caps,
    cost: { requiredLevel: 'act' }
  });
  assert.strictEqual(r3.approved, true, 'act-level request succeeds again after dial up');
});

// 5 — blast radius cap enforced
test('blast radius cap enforced', async () => {
  const secrets = new FileProvider({ storePath: store() });
  const caps = new Caps();
  caps.setProfile('agent:deploy', { level: 'act', maxBlastRadius: 5 });

  const r1 = await gate.decide({
    proposal: proposal(), decision: 'approve', scope: SCOPE,
    ttlSeconds: 60, requestedBy: 'agent:deploy', secrets, caps,
    cost: { blastRadius: 5 }
  });
  assert.strictEqual(r1.approved, true);

  const r2 = await gate.decide({
    proposal: proposal(), decision: 'approve', scope: SCOPE,
    ttlSeconds: 60, requestedBy: 'agent:deploy', secrets, caps,
    cost: { blastRadius: 1 }
  });
  assert.strictEqual(r2.approved, false);
  assert.strictEqual(r2.reason, 'capped:blast-cap');
});

// 6 — without caps, gate behaves exactly as Ticket 1 (backward compat)
test('without caps parameter, gate behaves as before (backward compat)', async () => {
  const secrets = new FileProvider({ storePath: store() });
  const r = await gate.decide({
    proposal: proposal(), decision: 'approve', scope: SCOPE,
    ttlSeconds: 60, secrets
  });
  assert.strictEqual(r.approved, true);
  assert.ok(r.grant && r.grant.token);
  assert.strictEqual(r.capped, undefined, 'no capped field when caps not provided');
});
