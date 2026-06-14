// test/attestation.test.mjs
// #4 — continuous compliance attestation. Controls map to named clauses from the
// signed ledger; drift detection flags regressions vs the prior attestation.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-attest-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');
const STORE = path.join(TMP, 'secrets.json');
fs.writeFileSync(STORE, JSON.stringify({ owner: 'lab', scopes: { 'github-deploy': 'M' }, rotated: {} }));

const beacon = await import('../src/core/beacon.js');
const { FileProvider } = await import('../src/core/secrets.fileprovider.js');
const gate = await import('../src/core/gate.js');
const { runSkill } = await import('../scripts/run-skill.mjs');
const { buildAttestation, signAttestation, CONTROLS } = await import('../src/core/attestation.js');

// seed: an approved action + a denial + a hiring framework map
const secrets = new FileProvider({ storePath: STORE });
gate.decide({ proposal: { summary: 'deploy', requiresHumanGate: true }, decision: 'approve', scope: 'github-deploy', ttlSeconds: 60, secrets });
gate.decide({ proposal: { summary: 'delete', requiresHumanGate: true }, decision: 'deny', scope: 'github-deploy', ttlSeconds: 60, secrets });
runSkill('framework-map', { input: 'an AI tool that screens job candidates' });

test('attestation maps named framework controls from the ledger', () => {
  const a = buildAttestation({ now: '2026-06-14T00:00:00Z' });
  const byId = Object.fromEntries(a.controls.map((c) => [c.id, c]));
  assert.strictEqual(byId['eu-ai-act-art-12'].status, 'pass', 'record-keeping: signed ledger present');
  assert.strictEqual(byId['eu-ai-act-art-14'].status, 'pass', 'human oversight: approvals + denials present');
  assert.strictEqual(byId['nyc-ll144'].status, 'pass', 'AEDT activity mapped to LL144/EEOC');
  assert.match(byId['eu-ai-act-art-14'].clause, /Art\. 14/);
  assert.strictEqual(a.controls.length, CONTROLS.length);
  assert.strictEqual(a.posture, 'pass');
});

test('signAttestation emits one verifiable receipt anchoring the attestation', () => {
  const before = beacon.ledgerCount();
  const { attestation, receipt } = signAttestation({ now: '2026-06-14T00:00:00Z' });
  assert.strictEqual(beacon.ledgerCount(), before + 1);
  assert.strictEqual(receipt.record.kind, 'attestation');
  assert.strictEqual(receipt.record.contentHash, attestation.contentHash);
  assert.strictEqual(beacon.verifyLedger().valid, true);
});

test('drift detection flags a regression vs the prior attestation', () => {
  const prior = buildAttestation({ now: '2026-06-13T00:00:00Z' });
  // simulate a control regressing: pretend art-15 was "pass" yesterday, now "attention"
  const priorMutated = { ...prior, controls: prior.controls.map((c) => c.id === 'eu-ai-act-art-15' ? { ...c, status: 'pass' } : c) };
  // emit a sandbox violation so art-15 drops to "attention" today
  beacon.emit({ kind: 'sandbox', actor: 'sandbox:process', action: 'violation', detail: { type: 'fs-escape' } });
  const today = buildAttestation({ now: '2026-06-14T00:00:00Z', prior: priorMutated });
  const art15 = today.controls.find((c) => c.id === 'eu-ai-act-art-15');
  assert.strictEqual(art15.status, 'attention');
  assert.strictEqual(today.drift.vsPrior, true);
  assert.ok(today.drift.regressions.some((d) => d.id === 'eu-ai-act-art-15' && d.from === 'pass' && d.to === 'attention'));
});

test('no prior -> no drift, no regressions', () => {
  const a = buildAttestation({ now: '2026-06-14T00:00:00Z', prior: null });
  assert.strictEqual(a.drift.vsPrior, false);
  assert.strictEqual(a.drift.regressions.length, 0);
});
