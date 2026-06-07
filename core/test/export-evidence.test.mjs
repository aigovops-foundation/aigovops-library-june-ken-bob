// test/export-evidence.test.mjs
// Ticket 10 (second half) — the exported bundle verifies offline: every Ed25519
// signature against the published public key, and the hash chain. Cryptographic
// checks use Node's crypto (always); openssl is attempted too (the auditor's
// tool) and skipped if this host's build lacks Ed25519 -rawin.

import { test } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-evidence-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const beacon = await import('../src/core/beacon.js');
const { exportEvidence } = await import('../scripts/export-evidence.mjs');

// seed a small ledger
beacon.emit({ kind: 'gate', actor: 'agent:maker', action: 'approve' });
beacon.emit({ kind: 'secret', actor: 'gate', action: 'issue', detail: { op: 'issue', scope: 'x' } });
beacon.emit({ kind: 'tool', actor: 'agent:maker', action: 'tool-run', detail: { ok: true } });

const OUT = path.join(TMP, 'bundle');
const man = exportEvidence(OUT);
const entries = (n) => path.join(OUT, 'entries', String(n).padStart(4, '0'));

test('manifest + bundle files are written', () => {
  assert.equal(man.entries, 3);
  assert.equal(man.verified, true);
  assert.ok(man.chainHead);
  assert.ok(fs.existsSync(path.join(OUT, 'public-key.pem')));
  assert.ok(fs.existsSync(path.join(OUT, 'verify.sh')));
});

test('every signature verifies against the published key (node crypto)', () => {
  const pub = crypto.createPublicKey(fs.readFileSync(path.join(OUT, 'public-key.pem')));
  for (let i = 0; i < man.entries; i++) {
    const msg = fs.readFileSync(`${entries(i)}.msg`);
    const sig = fs.readFileSync(`${entries(i)}.sig`);
    assert.equal(crypto.verify(null, msg, pub, sig), true, `entry ${i} signature`);
  }
});

test('the hash chain links every entry', () => {
  assert.equal(fs.readFileSync(`${entries(0)}.prev`, 'utf8'), 'null');
  for (let i = 1; i < man.entries; i++) {
    const prevHash = beacon.sha256(fs.readFileSync(`${entries(i - 1)}.msg`, 'utf8'));
    assert.equal(fs.readFileSync(`${entries(i)}.prev`, 'utf8'), prevHash, `entry ${i} chains to ${i - 1}`);
  }
});

test('tampering with a record breaks verification', () => {
  const pub = crypto.createPublicKey(fs.readFileSync(path.join(OUT, 'public-key.pem')));
  const orig = fs.readFileSync(`${entries(1)}.msg`);
  const tampered = Buffer.from(orig.toString('utf8').replace('issue', 'issX'));
  const sig = fs.readFileSync(`${entries(1)}.sig`);
  assert.equal(crypto.verify(null, tampered, pub, sig), false);
});

test('the bundled Node verifier confirms the whole bundle offline', () => {
  const r = spawnSync(process.execPath, [path.join(OUT, 'verify.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, `verify.mjs should pass: ${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /verified 3 entries/);
});

test('openssl verifies entry 0 (skipped if this build lacks Ed25519 -rawin)', () => {
  const r = spawnSync('openssl', ['pkeyutl', '-verify', '-pubin', '-inkey', path.join(OUT, 'public-key.pem'),
    '-rawin', '-in', `${entries(0)}.msg`, '-sigfile', `${entries(0)}.sig`], { encoding: 'utf8' });
  if (r.error || r.status === null) { console.error('  (openssl not available — skipped)'); return; }
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0 && /unknown option|rawin|unsupported|Algorithm/i.test(out)) {
    console.error('  (openssl build lacks Ed25519 -rawin — skipped)'); return;
  }
  assert.equal(r.status, 0, `openssl should verify entry 0: ${out}`);
});
