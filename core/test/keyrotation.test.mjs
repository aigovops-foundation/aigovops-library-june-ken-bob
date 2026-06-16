// test/keyrotation.test.mjs
// #10 — Beacon key rotation + multi-key verify. After a rotation, receipts signed
// by the OLD key still verify (retired key kept in the keyring), new receipts use
// the new key, and the whole chain verifies end-to-end.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-rotate-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const beacon = await import('../src/core/beacon.js');

test('rotate: old receipts still verify, new receipts use the new key, chain intact', () => {
  const r1 = beacon.emit({ kind: 'test', actor: 'a', action: 'before-rotation' });
  assert.equal(beacon.keyring().all.length, 1, 'one key before rotation');

  const rot = beacon.rotateKeys();
  assert.notEqual(rot.retiredKid, rot.newKid);
  assert.equal(r1.kid, rot.retiredKid, 'pre-rotation receipt carries the retired kid');

  const ring = beacon.keyring();
  assert.equal(ring.current, rot.newKid);
  assert.ok(ring.all.includes(rot.retiredKid) && ring.all.includes(rot.newKid), 'keyring holds both keys');

  const r2 = beacon.emit({ kind: 'test', actor: 'a', action: 'after-rotation' });
  assert.equal(r2.kid, rot.newKid, 'post-rotation receipt carries the new kid');
  assert.notEqual(r1.kid, r2.kid);

  // The WHOLE ledger (old receipt + signed rotation receipt + new receipt) verifies.
  const v = beacon.verifyLedger();
  assert.ok(v.valid, 'ledger valid across the rotation');
  assert.ok(v.entries >= 3);

  // The retired receipt verifies against the retired key (picked by kid)…
  assert.equal(beacon.verifySigned(r1), true);
  // …and a second rotation keeps all three keys verifying older receipts.
  const rot2 = beacon.rotateKeys();
  assert.equal(beacon.keyring().all.length, 3);
  assert.equal(beacon.verifySigned(r1), true, 'two rotations later, the oldest receipt still verifies');
  assert.equal(beacon.verifyLedger().valid, true);
  assert.equal(rot2.retiredKid, rot.newKid);
});
