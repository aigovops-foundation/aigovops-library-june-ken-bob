// test/finance.test.mjs
// Phase 5 — community/finance is design + stub: flows work and emit metadata-only
// receipts, but NO real money moves and NO card data ever touches the ledger.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-finance-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const beacon = await import('../src/core/beacon.js');
const { StubPaymentProvider, PLANS, createPaymentProvider } = await import('../src/core/finance.js');

test('subscribe sets membership + emits a metadata-only receipt (no money)', async () => {
  const before = beacon.ledgerCount();
  const p = new StubPaymentProvider();
  const r = await p.subscribe('member:bob', 'community');
  assert.equal(r.dryRun, true);
  assert.equal(p.status('member:bob').planId, 'community');
  assert.equal(p.status('member:bob').active, true);
  assert.equal(beacon.ledgerCount(), before + 1);
  const ledger = fs.readFileSync(beacon.ledgerFile(), 'utf8');
  assert.ok(!/card|cvv|pan|\b\d{16}\b/i.test(ledger), 'no card data in the ledger');
});

test('charge moves no money and is dry-run', async () => {
  const p = new StubPaymentProvider();
  const r = await p.charge('member:bob', 9, 'community monthly');
  assert.equal(r.charged, false);
  assert.equal(r.dryRun, true);
  assert.equal(r.amountUsd, 9);
});

test('unknown plan fails closed; default status is lab/inactive', async () => {
  const p = new StubPaymentProvider();
  await assert.rejects(() => p.subscribe('x', 'nope'), /unknown-plan/);
  assert.equal(p.status('never-seen').active, false);
  assert.ok(PLANS.community.priceUsd > 0 && PLANS.lab.priceUsd === 0);
  assert.ok(createPaymentProvider() instanceof StubPaymentProvider);
});
