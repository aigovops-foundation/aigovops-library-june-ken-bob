// test/compliance.test.mjs
// #4 — the signed compliance report. From a seeded ledger (a real governed loop
// + a denied proposal + a framework-map), the report counts the governance
// activity, maps the frameworks touched, signs itself, and verifies offline.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-compliance-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');
const STORE = path.join(TMP, 'secrets.json');
fs.writeFileSync(STORE, JSON.stringify({ owner: 'lab', scopes: { 'github-deploy': 'MASTER-X' }, rotated: {} }));

const beacon = await import('../src/core/beacon.js');
const { FileProvider } = await import('../src/core/secrets.fileprovider.js');
const gate = await import('../src/core/gate.js');
const { runSkill } = await import('../scripts/run-skill.mjs');
const { complianceReport, signComplianceReport } = await import('../src/core/compliance.js');

// --- seed a realistic ledger -------------------------------------------------
const secrets = new FileProvider({ storePath: STORE });
// one approved irreversible action (proposal + brokered secret receipts)
gate.decide({ proposal: { summary: 'deploy', requiresHumanGate: true }, decision: 'approve', scope: 'github-deploy', ttlSeconds: 60, secrets });
// one denial (fails closed, brokers nothing)
gate.decide({ proposal: { summary: 'delete prod', requiresHumanGate: true }, decision: 'deny', scope: 'github-deploy', ttlSeconds: 60, secrets });
// a read-only skill that names frameworks
runSkill('framework-map', { input: 'an AI tool that screens job candidates' });

test('report counts governance activity from the ledger', () => {
  const r = complianceReport({ now: '2026-06-14T00:00:00Z' });
  assert.strictEqual(r.governance.approvals, 1);
  assert.strictEqual(r.governance.denials, 1);
  assert.strictEqual(r.governance.secretsBrokered, 1, 'approve brokered one scoped credential');
  assert.ok(r.governance.skillRuns >= 1);
  assert.strictEqual(r.ledger.valid, true);
  assert.strictEqual(r.posture, 'clean', 'no violations or breaches seeded');
});

test('report maps the frameworks the activity touched', () => {
  const r = complianceReport({ now: '2026-06-14T00:00:00Z' });
  const names = r.frameworks.map((f) => f.name);
  // hiring use case -> NYC LL144 / EU AI Act / EEOC, each with a gate question
  assert.ok(names.some((n) => /NYC Local Law 144|EU AI Act|EEOC/.test(n)), `expected hiring frameworks, got ${names}`);
  assert.ok(r.frameworks.every((f) => 'gateQuestion' in f));
});

test('signComplianceReport emits one verifiable receipt anchoring the report hash', () => {
  const before = beacon.ledgerCount();
  const { report, receipt } = signComplianceReport({ now: '2026-06-14T00:00:00Z' });
  assert.strictEqual(beacon.ledgerCount(), before + 1, 'exactly one receipt');
  assert.strictEqual(receipt.record.kind, 'compliance');
  assert.strictEqual(receipt.record.action, 'compliance-report');
  assert.strictEqual(receipt.record.contentHash, report.contentHash, 'receipt anchors the report hash');
  assert.strictEqual(beacon.verifyLedger().valid, true, 'ledger still verifies offline');
});

test('the report carries no secret material', () => {
  const { report } = signComplianceReport({ now: '2026-06-14T00:00:00Z' });
  assert.strictEqual(JSON.stringify(report).includes('MASTER-X'), false);
});
