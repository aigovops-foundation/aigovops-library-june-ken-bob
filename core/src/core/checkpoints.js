// src/core/checkpoints.js
// LEDGER CHECKPOINTS (#9 — ledger scalability). `verifyLedger()` is O(n): it
// re-checks every signature + the whole hash chain. Fine to ~10⁵ receipts, not
// 10⁷. A checkpoint is a SIGNED anchor over the chain head at sequence N — because
// the ledger is prev-chained, the head hash transitively commits to all N prior
// records. So after a checkpoint, verification only has to re-walk entries N→end:
// O(n − checkpoint). The checkpoint's own Ed25519 signature is the trust anchor
// for the prefix.
//
// Checkpoints live in their OWN ndjson file so the main ledger's chain is never
// touched. Dependency-free: reuses the Beacon primitives (canonicalize/sign/verify).

import fs from 'node:fs';
import path from 'node:path';
import * as beacon from './beacon.js';

const PROFILE = 'aigovops-checkpoint.v1';

function ledgerDir() { return process.env.LEDGER_DIR || path.resolve('ledger'); }
export function checkpointFile() { return path.join(ledgerDir(), 'checkpoints.ndjson'); }

// Parsed signed envelopes from the main ledger (newest last), or [] if none.
function readLedger() {
  const f = beacon.ledgerFile();
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
function readCheckpoints() {
  const f = checkpointFile();
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
const headHashAt = (ledger, seq) => beacon.sha256(beacon.canonicalize(ledger[seq - 1].record));

// Create a checkpoint over the current ledger head. Idempotent-ish: returns
// { created:false } when there is nothing new since the last checkpoint.
export function createCheckpoint() {
  beacon.loadOrCreateKeys();
  const ledger = readLedger();
  if (!ledger.length) return { created: false, reason: 'empty-ledger' };
  const throughSeq = ledger.length;
  const last = readCheckpoints().slice(-1)[0];
  if (last && last.record.throughSeq === throughSeq) return { created: false, reason: 'no-new-entries', checkpoint: last.record };

  const record = { profile: PROFILE, ts: new Date().toISOString(), kind: 'checkpoint', throughSeq, throughHash: headHashAt(ledger, throughSeq) };
  const signed = beacon.sign(record);
  fs.mkdirSync(ledgerDir(), { recursive: true });
  fs.appendFileSync(checkpointFile(), JSON.stringify(signed) + '\n');
  return { created: true, checkpoint: record, kid: signed.kid };
}

// The newest checkpoint that is still CONSISTENT with the live ledger (its
// throughHash matches the actual head at throughSeq) AND signature-valid. A
// rewritten/truncated ledger makes stale checkpoints fail this, so we never
// trust a prefix that no longer matches. Returns null if none qualifies.
export function latestCheckpoint() {
  beacon.loadOrCreateKeys();
  const ledger = readLedger();
  const cps = readCheckpoints();
  for (let i = cps.length - 1; i >= 0; i--) {
    const cp = cps[i];
    const s = cp.record.throughSeq;
    if (s > ledger.length) continue;                                   // checkpoint ahead of ledger (truncated)
    if (!beacon.verifySigned(cp)) continue;                            // bad signature
    if (headHashAt(ledger, s) !== cp.record.throughHash) continue;     // prefix was rewritten
    return cp;
  }
  return null;
}

// Segmented verification: trust the latest consistent checkpoint for the prefix,
// then re-walk only entries from there to the head. Falls back to a full verify
// when there is no usable checkpoint. Same shape as beacon.verifyLedger() plus
// { verifiedFrom, checkpoint }.
export function verifyFromCheckpoint() {
  const ledger = readLedger();
  const cp = latestCheckpoint();
  if (!cp) return { ...beacon.verifyLedger(), verifiedFrom: 0, checkpoint: null };

  const from = cp.record.throughSeq;            // entries [0, from) are anchored by the signed checkpoint
  const broken = [];
  let prevHash = cp.record.throughHash;
  for (let i = from; i < ledger.length; i++) {
    const signed = ledger[i];
    if (!beacon.verifySigned(signed)) broken.push({ index: i, reason: 'bad-signature' });
    if (signed.record.prev !== prevHash) broken.push({ index: i, reason: 'broken-chain' });
    prevHash = beacon.sha256(beacon.canonicalize(signed.record));
  }
  return { entries: ledger.length, valid: broken.length === 0, broken, verifiedFrom: from, checkpoint: cp.record };
}

// Retention insight (NON-destructive — deleting signed ledger data is a human's
// call). Reports how many entries a checkpoint would let you archive off the hot
// path, and the anchor that would still prove them. We never delete here.
export function segmentsToArchive() {
  const cp = latestCheckpoint();
  if (!cp) return { archivable: 0, anchor: null };
  return { archivable: cp.record.throughSeq, anchor: { throughSeq: cp.record.throughSeq, throughHash: cp.record.throughHash, ts: cp.record.ts } };
}
