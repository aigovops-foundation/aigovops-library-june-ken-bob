// test/sandbox.test.mjs
// Ticket 3 acceptance tests — sandbox boundary (laptop fallback).
// Proves: a tool cannot read outside its scratch dir; a tool cannot open an
// undeclared socket; attempts fail and emit a receipt.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-sbox-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const beacon = await import('../src/core/beacon.js');
const { ProcessSandbox } = await import('../src/core/sandbox.process.js');

// 1 — a tool cannot read outside its scratch dir
test('a tool cannot read outside its scratch dir', async () => {
  const sb = new ProcessSandbox({ emit: () => {} });
  const r = await sb.run({
    code: `
import fs from 'node:fs';
export default () => fs.readFileSync('/etc/passwd', 'utf8');
`
  });
  assert.strictEqual(r.ok, false, 'tool should fail');
  assert.ok(r.violations.length > 0, 'at least one violation');
  assert.strictEqual(r.violations[0].type, 'fs-escape');
});

// 2 — a tool cannot open an undeclared socket
test('a tool cannot open an undeclared socket', async () => {
  const sb = new ProcessSandbox({ emit: () => {} });
  const r = await sb.run({
    code: `
import net from 'node:net';
export default async () => new Promise((resolve, reject) => {
  const s = new net.Socket();
  s.connect({ host: '1.1.1.1', port: 80 }, () => resolve('connected'));
  s.on('error', (e) => reject(e));
});
`
  }, { allowedEgress: [] });
  assert.strictEqual(r.ok, false, 'tool should fail');
  assert.ok(r.violations.some((v) => v.type === 'net-egress'), 'net-egress violation');
});

// 3 — a tool can read and write within its scratch dir (legit use)
test('a tool can read and write within its scratch dir', async () => {
  const sb = new ProcessSandbox({ emit: () => {} });
  const r = await sb.run({
    code: `
import fs from 'node:fs';
import path from 'node:path';
export default ({ scratchDir }) => {
  const f = path.join(scratchDir, 'output.txt');
  fs.writeFileSync(f, 'hello from sandbox');
  return fs.readFileSync(f, 'utf8');
};
`
  });
  assert.strictEqual(r.ok, true, 'tool should succeed');
  assert.strictEqual(r.result, 'hello from sandbox');
  assert.strictEqual(r.violations.length, 0, 'no violations');
});

// 4 — violations emit signed receipts
test('violations emit signed receipts', async () => {
  const before = beacon.ledgerCount();
  const sb = new ProcessSandbox(); // default emit -> beacon -> temp ledger
  await sb.run({
    code: `
import fs from 'node:fs';
export default () => fs.readFileSync('/etc/passwd', 'utf8');
`
  });
  assert.ok(beacon.ledgerCount() > before, 'at least one receipt emitted for the violation');
  const v = beacon.verifyLedger();
  assert.strictEqual(v.valid, true, 'ledger signatures + chain verify');
  // the receipt is a sandbox violation
  const recs = fs.readFileSync(beacon.ledgerFile(), 'utf8').trim().split('\n').filter(Boolean);
  const last = JSON.parse(recs[recs.length - 1]).record;
  assert.strictEqual(last.kind, 'sandbox');
  assert.strictEqual(last.action, 'violation');
});
