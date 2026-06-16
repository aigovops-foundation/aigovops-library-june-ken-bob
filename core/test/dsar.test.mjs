// test/dsar.test.mjs
// #10 — a signed, subject-scoped, metadata-only data-subject access export.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-dsar-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const beacon = await import('../src/core/beacon.js');
const { buildDsar } = await import('../src/core/dsar.js');

test('DSAR is subject-scoped, signed, and reveals no other subject', () => {
  beacon.emit({ kind: 'prompt', actor: 'oidc:ken', action: 'ask', contentHash: 'h1' });
  beacon.emit({ kind: 'artifact', actor: 'oidc:bob', action: 'assess' });
  beacon.emit({ kind: 'prompt', actor: 'oidc:ken', action: 'ask', contentHash: 'h2' });

  const env = buildDsar('oidc:ken');
  assert.equal(env.record.subject, 'oidc:ken');
  assert.equal(env.record.count, 2, "only the subject's receipts");
  assert.ok(env.record.receipts.every((r) => r.action === 'ask'));
  assert.ok(beacon.verifySigned(env), 'the DSAR bundle is signed + verifies');
  assert.ok(!JSON.stringify(env.record).includes('oidc:bob'), "no other subject's data leaks");
});

test('DSAR for an unknown subject is an empty but signed bundle', () => {
  const env = buildDsar('oidc:nobody');
  assert.equal(env.record.count, 0);
  assert.ok(beacon.verifySigned(env));
});
