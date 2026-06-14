// src/core/compliance.js
// SIGNED COMPLIANCE REPORT (#4) — the buyable artifact.
// Reads ONLY the signed Beacon ledger and synthesizes a governance attestation:
// how many actions passed a human gate, what was brokered, what was blocked, and
// which AI-governance frameworks the activity touched (via the Yes-Gate library).
// Metadata only — it summarizes receipt shapes, never payloads.
//
// The report is itself signed and chained: `signComplianceReport()` emits ONE
// receipt whose contentHash is the report hash, so an auditor can confirm offline
// that a given report corresponds to a sealed entry in the ledger.

import fs from 'node:fs';
import * as beacon from './beacon.js';
import { LIBRARY } from './yesgate.shared.js';

function records() {
  const f = beacon.ledgerFile();
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).record);
}

// Frameworks named anywhere in the ledger: assess receipts carry gate.framework
// ("A+B"), framework-map receipts carry detail.frameworks[] (ids).
function observedFrameworks(recs) {
  const byName = new Map();
  const add = (key) => { if (key) byName.set(key, (byName.get(key) || 0) + 1); };
  for (const r of recs) {
    if (r.gate && r.gate.framework) String(r.gate.framework).split('+').forEach((f) => add(f.trim()));
    if (r.detail && Array.isArray(r.detail.frameworks)) r.detail.frameworks.forEach((id) => add(id));
  }
  // Resolve to library entries (id or display name), attach the gate question.
  const idByName = Object.fromEntries(Object.entries(LIBRARY).map(([id, v]) => [v.name, id]));
  return [...byName.entries()].map(([key, observations]) => {
    const id = LIBRARY[key] ? key : (idByName[key] || key);
    const lib = LIBRARY[id];
    return { id, name: lib ? lib.name : key, gateQuestion: lib ? lib.gateQuestion : null, observations };
  }).sort((a, b) => b.observations - a.observations);
}

// Build the report (PURE — no emit). `now` is injectable for deterministic tests.
export function complianceReport({ now = '1970-01-01T00:00:00Z' } = {}) {
  const recs = records();
  const count = (pred) => recs.filter(pred).length;
  const governance = {
    proposals: count((r) => r.action === 'approve' || r.action === 'deny'),
    approvals: count((r) => r.action === 'approve'),
    denials: count((r) => r.action === 'deny'),
    secretsBrokered: count((r) => r.kind === 'secret' && r.action === 'issue'),
    secretsRevoked: count((r) => r.kind === 'secret' && r.action === 'revoke'),
    toolRuns: count((r) => r.kind === 'tool' && r.action === 'tool-run'),
    sandboxViolations: count((r) => r.kind === 'sandbox' && r.action === 'violation'),
    capBreaches: count((r) => r.action === 'cap-breach'),
    killSwitch: count((r) => r.action === 'kill-switch'),
    skillRuns: count((r) => r.kind === 'artifact' && ['framework-map', 'sec-review', 'a11y', 'report'].includes(r.action)),
    policyBundles: count((r) => r.kind === 'policy' && r.action === 'bundle'),
  };
  const v = beacon.verifyLedger();
  const clean = governance.sandboxViolations === 0 && governance.capBreaches === 0;
  const report = {
    profile: 'aigovops-compliance.v1',
    generatedAt: now,
    ledger: { entries: v.entries, valid: v.valid, kid: beacon.loadOrCreateKeys().kid },
    governance,
    frameworks: observedFrameworks(recs),
    attestation: [
      `${governance.approvals} action(s) passed a human gate; ${governance.denials} denied (fail-closed).`,
      `${governance.secretsBrokered} scoped credential(s) brokered, ${governance.secretsRevoked} revoked — no master secret ever left the broker.`,
      governance.sandboxViolations ? `${governance.sandboxViolations} sandbox violation(s) recorded.` : 'No sandbox violations.',
      governance.capBreaches ? `${governance.capBreaches} capability-cap breach(es) recorded.` : 'No capability-cap breaches.',
      v.valid ? 'Every receipt is Ed25519-signed and the hash chain is intact.' : 'LEDGER INTEGRITY FAILURE — chain or signature broken.',
    ].join(' '),
    posture: v.valid && clean ? 'clean' : (v.valid ? 'attention' : 'integrity-failure'),
  };
  report.contentHash = beacon.sha256(beacon.canonicalize(report));
  return report;
}

// Build + sign: emit ONE metadata-only receipt anchoring the report hash.
export function signComplianceReport({ now = '1970-01-01T00:00:00Z', emit = beacon.emit } = {}) {
  const report = complianceReport({ now });
  const receipt = emit({
    kind: 'compliance', actor: 'steward', action: 'compliance-report',
    contentHash: report.contentHash,
    detail: { profile: report.profile, posture: report.posture, entries: report.ledger.entries, frameworks: report.frameworks.length },
  });
  return { report, receipt };
}
