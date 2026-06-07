// test/storage.test.mjs
// Phase 1 — pluggable ledger storage. FileStore is the default, dependency-free
// path (tested here). PgStore is opt-in (needs pg + DATABASE_URL) and exercised
// only in an environment that has both.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { FileStore, createStore } = await import('../src/core/storage.js');

test('FileStore appends, reads back, and counts (NDJSON)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-store-'));
  const s = new FileStore({ dir });
  assert.equal(s.count(), 0);
  s.append({ record: { action: 'a' }, sig: '1' });
  s.append({ record: { action: 'b' }, sig: '2' });
  const all = s.readAll();
  assert.equal(all.length, 2);
  assert.equal(all[0].record.action, 'a');
  assert.equal(all[1].sig, '2');
  assert.equal(s.count(), 2);
});

test('createStore() returns a FileStore when DATABASE_URL is unset', async () => {
  const prev = process.env.DATABASE_URL; delete process.env.DATABASE_URL;
  const s = await createStore();
  assert.ok(s instanceof FileStore);
  if (prev) process.env.DATABASE_URL = prev;
});
