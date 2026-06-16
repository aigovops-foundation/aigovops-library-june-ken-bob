// test/checkpoints.test.mjs
// #9 — a signed checkpoint anchors the chain head; segmented verify re-walks only
// the tail since the anchor (O(n - checkpoint)) and stays valid.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-checkpoint-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const beacon = await import('../src/core/beacon.js');
const { createCheckpoint, verifyFromCheckpoint, latestCheckpoint, segmentsToArchive } = await import('../src/core/checkpoints.js');

test('checkpoint anchors the head; segmented verify only re-walks the tail', () => {
  for (let i = 0; i < 3; i++) beacon.emit({ kind: 'test', actor: 'a', action: `e${i}` });
  const c = createCheckpoint();
  assert.ok(c.created && c.checkpoint.throughSeq === 3);

  let v = verifyFromCheckpoint();
  assert.ok(v.valid && v.verifiedFrom === 3 && v.entries === 3, 'anchored through 3');

  for (let i = 0; i < 2; i++) beacon.emit({ kind: 'test', actor: 'a', action: `f${i}` });
  v = verifyFromCheckpoint();
  assert.ok(v.valid && v.verifiedFrom === 3 && v.entries === 5, 'tail (2 new) verified against the seq-3 anchor');

  const c2 = createCheckpoint();
  assert.ok(c2.created && c2.checkpoint.throughSeq === 5);
  assert.equal(verifyFromCheckpoint().verifiedFrom, 5, 'anchor advances');
});

test('no new entries → no duplicate checkpoint', () => {
  assert.equal(createCheckpoint().created, false);
});

test('latest checkpoint matches the live head; archive insight is non-destructive', () => {
  const cp = latestCheckpoint();
  assert.ok(cp && cp.record.throughHash && cp.record.throughSeq === 5);
  assert.equal(segmentsToArchive().archivable, 5);          // reports, does not delete
  assert.equal(beacon.ledgerCount(), 5, 'ledger untouched by checkpointing');
});

test('segmented verify equals full verify on a valid ledger', () => {
  const full = beacon.verifyLedger();
  const seg = verifyFromCheckpoint();
  assert.equal(full.valid, seg.valid);
  assert.equal(full.entries, seg.entries);
});
