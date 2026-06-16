// test/demo.test.mjs — the founder-facing end-to-end demo must run clean (exit 0:
// the whole ledger verifies + the governance gate passes) and produce its report.
import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'demo.mjs');

test('npm run demo: the full end-to-end story runs, verifies, and renders', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-demo-test-')), 'demo.html');
  // exit 0 only if the ledger chain + signatures verify AND the governance gate passes
  const log = execFileSync(process.execPath, [SCRIPT], { env: { ...process.env, DEMO_OUT: out }, encoding: 'utf8' });
  assert.match(log, /signed receipts; chain \+ signatures valid: true; governance gate: PASS/);
  const html = fs.readFileSync(out, 'utf8');
  assert.match(html, /the governed core, end to end/);
  assert.match(html, /A risky ask, governed/);
  assert.match(html, /Scale without losing the thread/);
  assert.match(html, /signed receipt/);
});
