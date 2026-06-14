// test/policy-bundle.test.mjs
// Ticket 7: a policy change ships as a Beacon-signed bundle. We hash the rego,
// emit one receipt, and an auditor can recompute + match it against the ledger.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-bundle-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const beacon = await import('../src/core/beacon.js');
const { bundleManifest, signBundle, verifyBundle } = await import('../src/core/policy-bundle.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_POLICY_DIR = path.resolve(__dirname, '..', 'policy');

test('manifest hashes every .rego file deterministically', () => {
  const m1 = bundleManifest(REAL_POLICY_DIR);
  const m2 = bundleManifest(REAL_POLICY_DIR);
  assert.strictEqual(m1.sha256, m2.sha256, 'stable hash');
  assert.ok(m1.files.some((f) => f.name === 'aigov.rego'), 'includes the gate policy');
  assert.ok(/^[0-9a-f]{64}$/.test(m1.sha256));
});

test('signBundle emits exactly one verifiable policy receipt with the bundle hash', () => {
  const before = beacon.ledgerCount();
  const { manifest, receipt } = signBundle(REAL_POLICY_DIR);
  assert.strictEqual(beacon.ledgerCount(), before + 1, 'exactly one receipt');
  assert.strictEqual(receipt.record.kind, 'policy');
  assert.strictEqual(receipt.record.action, 'bundle');
  assert.strictEqual(receipt.record.contentHash, manifest.sha256, 'contentHash is the bundle hash');
  assert.strictEqual(beacon.verifyLedger().valid, true, 'ledger still verifies');
});

test('verifyBundle confirms a matching dir and rejects a tampered one', () => {
  const { manifest } = signBundle(REAL_POLICY_DIR);
  assert.strictEqual(verifyBundle(REAL_POLICY_DIR, manifest.sha256).ok, true);

  // tamper: copy the policy, mutate a byte, re-hash
  const tampered = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-policy-tamper-'));
  for (const f of fs.readdirSync(REAL_POLICY_DIR)) fs.copyFileSync(path.join(REAL_POLICY_DIR, f), path.join(tampered, f));
  fs.appendFileSync(path.join(tampered, 'aigov.rego'), '\n# sneaky change\n');
  const check = verifyBundle(tampered, manifest.sha256);
  assert.strictEqual(check.ok, false, 'a changed policy no longer matches the signed hash');
  assert.notStrictEqual(check.actual, check.expected);
});
