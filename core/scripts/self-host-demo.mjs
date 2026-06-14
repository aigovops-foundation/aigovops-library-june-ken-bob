#!/usr/bin/env node
// core/scripts/self-host-demo.mjs
// THE SELF-HOSTING LOOP, exercised (#3). Drives the governed core to PROPOSE a
// real file change to THIS repo through its own Yes-Gate:
//
//   propose → human approve → brokered 'self-host' token → author in an isolated
//   worktree → signed mutation receipt → verify
//
// It prints the diff and the receipt trail. It does NOT commit — a human lands
// the change (the irreversibility boundary). Run:  cd core && npm run self-host:demo
//
// The agent builds the change, sealed and receipted; the steward disposes.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');     // repo root
if (!process.env.KEYS_DIR) process.env.KEYS_DIR = path.resolve(__dirname, '..', 'keys');
if (!process.env.LEDGER_DIR) process.env.LEDGER_DIR = path.resolve(__dirname, '..', 'ledger');

const beacon = await import('../src/core/beacon.js');
const { createGovernedCore } = await import('../src/core/govapi.js');
const { FileProvider } = await import('../src/core/secrets.fileprovider.js');

// A throwaway secret store granting the 'self-host' mutation scope (the value is
// a placeholder — the broker hands the agent a token, never this string).
const tmpStore = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-selfhost-')), 'secrets.json');
fs.writeFileSync(tmpStore, JSON.stringify({ owner: 'lab', scopes: { 'self-host': 'PLACEHOLDER' }, rotated: {} }));

const RELPATH = process.argv[2] || 'plan/self-hosted/first-change.md';
const CONTENT = process.argv[3] || `# First self-hosted change\n\nThis file was PROPOSED by an agent through the AiGovOps governed loop\n(propose → human approve → brokered token → isolated worktree → signed receipt),\nthen landed by a human. See core/scripts/self-host-demo.mjs.\n`;

function main() {
  const core = createGovernedCore({ secrets: new FileProvider({ storePath: tmpStore }), repoDir: REPO });

  const { pendingId, proposal } = core.propose(`publish ${RELPATH} (self-hosted change)`, { actor: 'agent:self-host' });
  console.log(`1 · proposed   — human gate: ${proposal.requiresHumanGate}`);

  const decided = core.decide(pendingId, 'approve', { scope: 'self-host' });
  console.log(`2 · approved   — brokered a scoped token: ${decided.grant ? decided.grant.token.slice(0, 10) + '…' : 'NONE'}`);

  const change = core.proposeFileChange({ token: decided.grant.token, relPath: RELPATH, content: CONTENT });
  console.log(`3 · authored   — ${change.relPath}  (+${change.additions}/-${change.deletions})  in an isolated worktree (nothing committed)`);
  console.log(`   receipt: ${change.receipt.kid} · ${change.receipt.record.action} · parent=${change.receipt.record.detail.parent?.slice(0, 10)}…`);

  const v = beacon.verifyLedger();
  console.log(`4 · verified   — ledger ${v.entries} entries, chain ${v.valid ? 'VALID ✓' : 'BROKEN ✗'}`);

  console.log('\n--- proposed diff (a human reviews, then lands) ---\n' + change.diff);
  console.log(`Receipt id (for provenance): ${beacon.receiptId(change.receipt)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
