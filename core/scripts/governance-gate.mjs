#!/usr/bin/env node
// scripts/governance-gate.mjs — Phase D: govern the build with its own gate.
// A CI check that the signed audit trail is intact: every receipt's signature +
// the prev-hash chain verify, AND (if present) the latest checkpoint is consistent.
// Exit non-zero on any tampering — so a broken/forged ledger fails the build.
//   node scripts/governance-gate.mjs   (or: npm run gate)
import * as beacon from '../src/core/beacon.js';
import { verifyFromCheckpoint } from '../src/core/checkpoints.js';

export function governanceGate() {
  const led = beacon.verifyLedger();
  const seg = verifyFromCheckpoint();
  return {
    ok: led.valid && seg.valid,
    ledger: { valid: led.valid, entries: led.entries, broken: led.broken },
    checkpoint: { valid: seg.valid, verifiedFrom: seg.verifiedFrom, anchored: !!seg.checkpoint },
    keyring: beacon.keyring(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = governanceGate();
  console.log(JSON.stringify(r, null, 2));
  console.log(r.ok ? '\n✅ governance gate PASSED — the audit trail is intact.' : '\n❌ governance gate FAILED — the ledger does not verify.');
  process.exit(r.ok ? 0 : 1);
}
