// test/ledger-concurrency.test.mjs
// #2 — multi-process safety. The lockfile serializes the read-prev -> append
// critical section, so many processes writing the same ledger at once still
// produce ONE valid, unbroken hash chain. Without the lock this interleaves and
// breaks the chain.

import { test } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-conc-'));
const KEYS = path.join(TMP, 'keys');
const LEDGER = path.join(TMP, 'ledger');
process.env.KEYS_DIR = KEYS;
process.env.LEDGER_DIR = LEDGER;

const beacon = await import('../src/core/beacon.js');
const { acquireLock } = await import('../src/core/flock.js');

test('flock: a held lock blocks a second acquire until released', () => {
  const lp = path.join(TMP, 'a.lock');
  const release = acquireLock(lp);
  assert.throws(() => acquireLock(lp, { timeoutMs: 100, retryMs: 5 }), /timed out/);
  release();
  const r2 = acquireLock(lp, { timeoutMs: 100 });  // now free
  r2();
});

test('flock: a stale lock is stolen', () => {
  const lp = path.join(TMP, 'b.lock');
  fs.writeFileSync(lp, 'dead');
  const oldSecs = (Date.now() - 60_000) / 1000;
  fs.utimesSync(lp, oldSecs, oldSecs);
  const release = acquireLock(lp, { staleMs: 1000, timeoutMs: 500 });  // older than staleMs -> stolen
  release();
});

test('many processes writing the same ledger keep one valid chain', async () => {
  // Pre-generate the keypair so concurrent workers don't race on key creation.
  beacon.loadOrCreateKeys();

  const worker = path.join(TMP, 'worker.mjs');
  fs.writeFileSync(worker, `
    const beacon = await import(${JSON.stringify(new URL('../src/core/beacon.js', import.meta.url).href)});
    const tag = process.argv[2]; const n = Number(process.argv[3]);
    for (let i = 0; i < n; i++) beacon.emit({ kind: 'artifact', actor: 'w:' + tag, action: 'ping' });
  `);

  const WORKERS = 6, PER = 8;
  await Promise.all(Array.from({ length: WORKERS }, (_, k) => new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [worker, String(k), String(PER)], {
      env: { ...process.env, KEYS_DIR: KEYS, LEDGER_DIR: LEDGER }, stdio: ['ignore', 'ignore', 'inherit'],
    });
    c.on('exit', (code) => code === 0 ? resolve() : reject(new Error('worker ' + k + ' exited ' + code)));
    c.on('error', reject);
  })));

  assert.strictEqual(beacon.ledgerCount(), WORKERS * PER, 'every append landed exactly once');
  const v = beacon.verifyLedger();
  assert.strictEqual(v.valid, true, `chain must stay valid under concurrency: ${JSON.stringify(v.broken)}`);
});
