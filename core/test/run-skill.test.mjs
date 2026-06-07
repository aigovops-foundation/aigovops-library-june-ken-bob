// test/run-skill.test.mjs
// Ticket A1 (prototype) — the skill-runner turns the SKILL.md contract into
// runnable skills, enforces the human gate, and leaves metadata-only receipts.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Hermetic temp dirs. Set BEFORE importing the runner (which imports beacon, and
// beacon freezes KEYS_DIR at module load).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-runskill-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const { listSkills, getSkill, runSkill } = await import('../scripts/run-skill.mjs');
const beacon = await import('../src/core/beacon.js');

test('registry lists skills and flags the runnable ones', () => {
  const skills = listSkills();
  const names = skills.map(s => s.name);
  for (const n of ['framework-map', 'beacon-sign-evidence', 'op-github-deploy']) {
    assert.ok(names.includes(n), `registry should include ${n}`);
    assert.equal(getSkill(n).runnable, true, `${n} should be runnable`);
  }
  // A prose-only skill is listed but not runnable.
  const prose = skills.find(s => !s.runnable);
  assert.ok(prose, 'at least one prose (non-runnable) skill should be listed');
  // op-github-deploy is human-gated.
  assert.equal(getSkill('op-github-deploy').gated, true);
});

test('framework-map runs through core and emits exactly one metadata-only receipt', () => {
  const before = beacon.ledgerCount();
  const useCase = 'an AI tool that screens job candidates';
  const res = runSkill('framework-map', { input: useCase });
  assert.ok(res.result.gates.length > 0, 'should map at least one gate');
  assert.ok(res.receipt && res.receipt.action === 'framework-map');
  assert.equal(beacon.ledgerCount(), before + 1, 'exactly one receipt appended');
  assert.equal(beacon.verifyLedger().valid, true, 'ledger chain + signatures valid');
  // No payload leak: the use-case text must not appear anywhere in the ledger.
  const ledger = fs.readFileSync(beacon.ledgerFile(), 'utf8');
  assert.ok(!ledger.includes(useCase), 'receipt must store a hash, never the payload');
});

test('beacon-sign-evidence appends a receipt and refuses payloads', () => {
  const before = beacon.ledgerCount();
  runSkill('beacon-sign-evidence', { meta: { kind: 'artifact', actor: 'agent:test', action: 'demo', contentHash: 'abc123' } });
  assert.equal(beacon.ledgerCount(), before + 1);
  assert.throws(
    () => runSkill('beacon-sign-evidence', { meta: { kind: 'artifact', action: 'leak', payload: 'secret stuff' } }),
    /metadata-only/,
    'must refuse a meta that carries a payload',
  );
});

test('op-github-deploy is refused at the human gate and causes no side effect', () => {
  const before = beacon.ledgerCount();
  const res = runSkill('op-github-deploy', {});
  assert.equal(res.ran, false, 'must not execute');
  assert.equal(res.gated, true, 'must report the gate');
  assert.equal(beacon.ledgerCount(), before, 'no receipt, no side effect');
});

test('unknown skill throws', () => {
  assert.throws(() => runSkill('does-not-exist', {}), /unknown skill/);
});

test('security-privacy-review blocks on a finding, receipt carries no secret value', () => {
  const before = beacon.ledgerCount();
  const res = runSkill('security-privacy-review', { input: 'deploy key AKIAIOSFODNN7EXAMPLE for the bot' });
  assert.equal(res.result, 'blocked');
  assert.ok(res.findings.length > 0);
  assert.equal(beacon.ledgerCount(), before + 1, 'one sec-review receipt appended');
  const ledger = fs.readFileSync(beacon.ledgerFile(), 'utf8');
  assert.ok(!ledger.includes('AKIAIOSFODNN7EXAMPLE'), 'the matched secret must never reach the ledger');
});

test('security-privacy-review passes clean text', () => {
  assert.equal(runSkill('security-privacy-review', { input: 'a friendly note about libraries' }).result, 'clean');
});

test('accessibility-audit, status-report, monitor-and-alert are now runnable', () => {
  const runnable = listSkills().filter((s) => s.runnable).map((s) => s.name);
  for (const n of ['accessibility-audit', 'status-report', 'monitor-and-alert']) {
    assert.ok(runnable.includes(n), `${n} should be runnable`);
  }
  assert.ok(runnable.length >= 7, `expected >=7 runnable skills, got ${runnable.length}`);
});

test('accessibility-audit fails a bad page and emits an a11y receipt', () => {
  const before = beacon.ledgerCount();
  const res = runSkill('accessibility-audit', { input: '<html><body><img src="x"></body></html>' });
  assert.equal(res.result, 'fail');
  assert.ok(res.findings.length > 0);
  assert.equal(beacon.ledgerCount(), before + 1);
});
