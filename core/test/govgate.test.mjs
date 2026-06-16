// test/govgate.test.mjs
// Phase D — the governance gate: the build's own audit-trail check.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-govgate-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const beacon = await import('../src/core/beacon.js');
const { governanceGate } = await import('../scripts/governance-gate.mjs');
const { createCheckpoint } = await import('../src/core/checkpoints.js');

test('gate passes on a valid ledger, and confirms a checkpoint anchor', () => {
  for (let i = 0; i < 3; i++) beacon.emit({ kind: 'test', actor: 'a', action: `e${i}` });
  let r = governanceGate();
  assert.ok(r.ok && r.ledger.valid && r.ledger.entries === 3);
  assert.equal(r.checkpoint.anchored, false);

  createCheckpoint();
  r = governanceGate();
  assert.ok(r.ok && r.checkpoint.valid && r.checkpoint.anchored, 'gate sees the anchor');
});

test('gate fails on a tampered ledger', () => {
  // Corrupt the last receipt's signature on disk → the gate must catch it.
  const f = beacon.ledgerFile();
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n');
  const last = JSON.parse(lines[lines.length - 1]);
  last.sig = Buffer.from('forged-signature-bytes-aaaaaaaaaaaa').toString('base64');
  lines[lines.length - 1] = JSON.stringify(last);
  fs.writeFileSync(f, lines.join('\n') + '\n');

  assert.equal(governanceGate().ok, false, 'a forged signature fails the gate');
});
