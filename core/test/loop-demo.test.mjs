// test/loop-demo.test.mjs
// Ticket A2, step 4 — the governed loop, proven end to end: one cycle leaves a
// linked, signature-and-chain-verifiable receipt trail.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-loopdemo-t-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const { runDemo } = await import('../scripts/loop-demo.mjs');

test('propose → decide → runTool → verify leaves a linked receipt trail', async () => {
  const d = await runDemo();
  assert.equal(d.requiresHumanGate, true, 'irreversible intent needs a human gate');
  assert.equal(d.tokenIsMaster, false, 'the brokered token is never the master secret');
  assert.equal(d.toolOk, true, 'the sandboxed tool ran');
  assert.equal(d.verify.valid, true, 'the ledger verifies (signatures + chain)');

  const approve = d.trail.find((r) => r.action === 'approve');
  const issue = d.trail.find((r) => r.action === 'issue');
  const run = d.trail.find((r) => r.action === 'tool-run');
  assert.ok(approve && issue && run, 'proposal, brokered-secret, and tool-run receipts all present');
  assert.equal(approve.id, d.proposalId, 'the approval receipt IS the proposal');
  assert.equal(issue.parent, d.proposalId, 'the secret receipt links back to the proposal');
  assert.equal(run.parent, d.proposalId, 'the tool-run receipt links back to the proposal');
});
