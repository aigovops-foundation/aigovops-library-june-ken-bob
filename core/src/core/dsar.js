// src/core/dsar.js
// DATA-SUBJECT ACCESS REQUEST (#10 — data lifecycle / GDPR Art.15, DPDP). A
// subject (or a steward on their behalf) can obtain the complete record the system
// holds about them. Because the ledger is metadata-only (no payloads, no PII), the
// "complete record" is the set of signed receipts whose actor is the subject — and
// the export itself is SIGNED so the subject can prove it is authentic + unaltered.

import fs from 'node:fs';
import * as beacon from './beacon.js';
import { residencyTag } from './residency.js';

function allRecords() {
  const f = beacon.ledgerFile();
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).record);
}

// Build a SIGNED DSAR bundle for `subject` (an actor id). Returns a Beacon-signed
// envelope { record, kid, sig } that anyone can verify with the public key.
export function buildDsar(subject, { now } = {}) {
  const generatedAt = (now ? new Date(now()) : new Date()).toISOString();
  const records = allRecords().filter((r) => r.actor === subject);
  const bundle = {
    profile: 'aigovops-dsar.v1',
    subject,
    generatedAt,
    residency: residencyTag(),
    count: records.length,
    receipts: records.map((r) => ({
      ts: r.ts, kind: r.kind, action: r.action,
      ...(r.gate ? { gate: r.gate } : {}),
      ...(r.detail ? { detail: r.detail } : {}),
      contentHash: r.contentHash || null,
    })),
    note: 'AiGovOps records metadata only — no payloads, no PII. This is the complete record held for the subject.',
  };
  return beacon.sign(bundle);
}
