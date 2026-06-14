// test/storage-pg.test.mjs
// #2 — the Postgres durable ledger, proven WITHOUT a live database via a fake
// in-memory pg client whose advisory lock is a real async mutex. This exercises
// the transactional chained append: concurrent emitSigned() calls serialize and
// produce one correct prev-hash chain. A live DB is the operator step (set
// DATABASE_URL + `npm i pg`).

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-pg-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const beacon = await import('../src/core/beacon.js');
const { PgStore } = await import('../src/core/storage.js');

// Fake pg client: array-backed, with pg_advisory_xact_lock as a real async mutex
// released at COMMIT/ROLLBACK — so it faithfully serializes appenders.
function fakePg() {
  const rows = [];
  let locked = false; const waiters = [];
  const lock = () => locked ? new Promise((r) => waiters.push(r)) : ((locked = true), Promise.resolve());
  const unlock = () => { const w = waiters.shift(); if (w) w(); else locked = false; };
  return {
    rows,
    async query(sql, params) {
      if (/pg_advisory_xact_lock/.test(sql)) { await lock(); return { rows: [] }; }
      if (/^COMMIT|^ROLLBACK/.test(sql)) { unlock(); return { rows: [] }; }
      if (/^BEGIN|CREATE TABLE/.test(sql)) return { rows: [] };
      if (/ORDER BY seq DESC LIMIT 1/.test(sql)) return { rows: rows.length ? [{ signed: rows[rows.length - 1] }] : [] };
      if (/INSERT INTO aigov_ledger/.test(sql)) { rows.push(params[0]); return { rows: [] }; }
      if (/ORDER BY seq ASC/.test(sql)) return { rows: rows.map((s) => ({ signed: s })) };
      if (/count\(/.test(sql)) return { rows: [{ n: rows.length }] };
      return { rows: [] };
    },
    async end() {},
  };
}

// Build+sign a record carrying the in-transaction prev (mirrors beacon.emit).
const buildAndSign = (action) => (prev) => beacon.sign({ profile: 'test', action, prev });

test('emitSigned chains records under the transaction lock', async () => {
  const store = new PgStore(fakePg());
  await store.init();
  await store.emitSigned(buildAndSign('a'));
  await store.emitSigned(buildAndSign('b'));
  const all = await store.readAll();
  assert.strictEqual(all.length, 2);
  assert.strictEqual(all[0].record.prev, null, 'first record has no prev');
  assert.strictEqual(typeof all[1].record.prev, 'string', 'second links to the first');
  assert.strictEqual((await store.verifyChain()).valid, true);
});

test('concurrent emitSigned() serialize into one valid chain', async () => {
  const store = new PgStore(fakePg());
  await store.init();
  // fire 20 appends "at once" — the advisory-lock mutex must serialize them
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.emitSigned(buildAndSign('c' + i))));
  assert.strictEqual(await store.count(), 20);
  const v = await store.verifyChain();
  assert.strictEqual(v.valid, true, `chain broken at ${v.brokenAt}`);
  assert.strictEqual(v.entries, 20);
});

test('verifyChain catches a tampered prev link', async () => {
  const fake = fakePg();
  const store = new PgStore(fake);
  await store.init();
  await store.emitSigned(buildAndSign('x'));
  await store.emitSigned(buildAndSign('y'));
  fake.rows[1] = { ...fake.rows[1], record: { ...fake.rows[1].record, prev: 'tampered' } };
  assert.strictEqual((await store.verifyChain()).valid, false);
});
