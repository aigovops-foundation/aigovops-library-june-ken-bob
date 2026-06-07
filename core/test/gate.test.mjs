// test/gate.test.mjs
// Ticket 1 acceptance tests — gate ↔ SecretsProvider wiring.
// An APPROVED proposal brokers a scoped token and emits PAIRED receipts (the
// proposal receipt + a secret receipt that links back to it). A DENIED proposal
// gets NEITHER a token nor a secret receipt — it fails closed.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCOPE = 'github-deploy';
const MASTER = 'MASTER-SECRET-DO-NOT-LEAK-gate';

// Hermetic temp dirs — set BEFORE importing beacon so keys/ledger are isolated.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-gate-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const beacon = await import('../src/core/beacon.js');
const { FileProvider } = await import('../src/core/secrets.fileprovider.js');
const gate = await import('../src/core/gate.js');
const { SecretsError } = await import('../src/core/secrets.shared.js');

function store() {
  const p = path.join(TMP, `s-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(p, JSON.stringify({ owner: 'lab', scopes: { [SCOPE]: MASTER }, rotated: {} }));
  return p;
}
function ledgerRecords() {
  return fs.readFileSync(beacon.ledgerFile(), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
function proposal(intent = 'deploy the site') {
  return { summary: `Proposed: ${intent}`, irreversible: true, requiresHumanGate: true };
}

// 1 — approve: token + two paired receipts, secret linked to the proposal
test('approved proposal brokers a token with paired, linked receipts', () => {
  const secrets = new FileProvider({ storePath: store() }); // default emit -> temp ledger
  const before = beacon.ledgerCount();
  const r = gate.decide({ proposal: proposal(), decision: 'approve', scope: SCOPE, ttlSeconds: 60, requestedBy: 'gate', secrets });

  assert.strictEqual(r.approved, true);
  assert.ok(r.grant && r.grant.token, 'a token was issued');
  assert.notStrictEqual(r.grant.token, MASTER, 'token is not the master secret');

  assert.strictEqual(beacon.ledgerCount(), before + 2, 'exactly two receipts: proposal + secret');
  const recs = ledgerRecords().slice(-2).map((s) => s.record);
  const proposalRec = recs.find((x) => x.kind === 'gate');
  const secretRec = recs.find((x) => x.kind === 'secret');
  assert.ok(proposalRec && secretRec, 'both receipts present');
  assert.strictEqual(proposalRec.action, 'approve');
  assert.strictEqual(secretRec.action, 'issue');

  // the secret receipt links back to the proposal receipt
  assert.strictEqual(secretRec.detail.parent, r.proposalId, 'secret receipt links to proposal');
  assert.strictEqual(beacon.receiptId(proposalRec), r.proposalId, 'proposalId is the proposal receipt content id');

  assert.strictEqual(beacon.verifyLedger().valid, true, 'chain + signatures verify');
});

// 2 — deny: issues nothing, fails closed (no token, no secret receipt)
test('denied proposal issues nothing and fails closed', () => {
  const secrets = new FileProvider({ storePath: store() });
  const before = beacon.ledgerCount();
  const r = gate.decide({ proposal: proposal(), decision: 'deny', scope: SCOPE, ttlSeconds: 60, secrets });

  assert.strictEqual(r.approved, false);
  assert.strictEqual(r.grant, null, 'no token on deny');
  assert.strictEqual(beacon.ledgerCount(), before + 1, 'only the proposal(deny) receipt — no secret receipt');
  const last = ledgerRecords().slice(-1)[0].record;
  assert.strictEqual(last.kind, 'gate');
  assert.strictEqual(last.action, 'deny');
});

// 3 — approve of a scope with no secret fails closed (no token, no secret receipt)
test('approving a scope with no secret fails closed', () => {
  const secrets = new FileProvider({ storePath: store() });
  const before = beacon.ledgerCount();
  assert.throws(
    () => gate.decide({ proposal: proposal(), decision: 'approve', scope: 'no-such-scope', ttlSeconds: 60, secrets }),
    (e) => e instanceof SecretsError && e.reason === 'unknown-scope'
  );
  // the approve decision is still auditable, but NO secret receipt was emitted
  assert.strictEqual(beacon.ledgerCount(), before + 1, 'only the proposal receipt');
  assert.strictEqual(ledgerRecords().slice(-1)[0].record.kind, 'gate');
});

// 4 — a reversible intent needs no gate and no credential
test('a reversible intent needs no gate and no credential', () => {
  const secrets = new FileProvider({ storePath: store() });
  const before = beacon.ledgerCount();
  const r = gate.proposeAndDecide({ intent: 'summarize the document', decision: 'approve', scope: SCOPE, ttlSeconds: 60, secrets });
  assert.strictEqual(r.grant, null);
  assert.strictEqual(r.reason, 'reversible');
  assert.strictEqual(beacon.ledgerCount(), before, 'nothing emitted for a reversible action');
});

// 5 — end-to-end: an irreversible intent, approved, brokers a linked token
test('proposeAndDecide brokers a linked token for an approved irreversible intent', () => {
  const secrets = new FileProvider({ storePath: store() });
  const r = gate.proposeAndDecide({ intent: 'deploy the site', decision: 'approve', scope: SCOPE, ttlSeconds: 60, secrets });
  assert.strictEqual(r.approved, true);
  assert.ok(r.grant && r.grant.token);
  // the live token is usable now and traces to the approving proposal
  assert.strictEqual(secrets.redeem(r.grant.token).ok, true);
  const secretRec = ledgerRecords().slice(-1)[0].record;
  assert.strictEqual(secretRec.detail.parent, r.proposalId);
});
