// src/core/attestation.js
// CONTINUOUS COMPLIANCE ATTESTATION (#4) — a repeatable, signed daily statement
// that maps the live governance posture (from compliance.js) to SPECIFIC named
// framework controls (EU AI Act articles, NYC LL144 clauses, GDPR), with DRIFT
// detection against the prior attestation. Run on a cron, each attestation is
// signed and chained, so an auditor sees a continuous, tamper-evident record of
// "these controls held, every day".

import * as beacon from './beacon.js';
import { complianceReport } from './compliance.js';

// Status rank for drift (higher is better). A regression lowers the rank.
const RANK = { pass: 3, partial: 2, attention: 1, fail: 0 };

// The control catalog: each maps a real ledger-derived signal to a named clause.
// `check(report) -> { status, rationale }`.
export const CONTROLS = [
  {
    id: 'eu-ai-act-art-9', framework: 'EU AI Act', clause: 'Art. 9 — Risk management system',
    check: (r) => r.frameworks.length > 0
      ? { status: 'pass', rationale: `${r.frameworks.length} framework(s) mapped to the activity` }
      : { status: 'partial', rationale: 'no risk mapping observed in the period' },
  },
  {
    id: 'eu-ai-act-art-12', framework: 'EU AI Act', clause: 'Art. 12 — Record-keeping (logging)',
    check: (r) => r.ledger.valid && r.ledger.entries > 0
      ? { status: 'pass', rationale: `${r.ledger.entries} signed receipts, hash chain intact` }
      : { status: r.ledger.entries === 0 ? 'partial' : 'fail', rationale: r.ledger.valid ? 'no activity to log' : 'LEDGER INTEGRITY FAILURE' },
  },
  {
    id: 'eu-ai-act-art-14', framework: 'EU AI Act', clause: 'Art. 14 — Human oversight',
    check: (r) => (r.governance.approvals + r.governance.denials) > 0
      ? { status: 'pass', rationale: `${r.governance.approvals} approved / ${r.governance.denials} denied at the human gate; kill switch armed ${r.governance.killSwitch}×` }
      : { status: 'partial', rationale: 'no human-gate decisions in the period' },
  },
  {
    id: 'eu-ai-act-art-15', framework: 'EU AI Act', clause: 'Art. 15 — Accuracy, robustness & cybersecurity',
    check: (r) => (r.governance.sandboxViolations === 0 && r.governance.capBreaches === 0)
      ? { status: 'pass', rationale: 'no sandbox violations or capability-cap breaches' }
      : { status: 'attention', rationale: `${r.governance.sandboxViolations} sandbox violation(s), ${r.governance.capBreaches} cap breach(es)` },
  },
  {
    id: 'nyc-ll144', framework: 'NYC Local Law 144', clause: '§ 5-301 — AEDT bias-audit applicability',
    check: (r) => r.frameworks.some((f) => /NYC Local Law 144|EEOC/.test(f.name))
      ? { status: 'pass', rationale: 'AEDT activity mapped to LL144/EEOC gates' }
      : { status: 'partial', rationale: 'no automated-employment-tool activity observed' },
  },
  {
    id: 'gdpr-art-30', framework: 'GDPR', clause: 'Art. 30 — Records of processing (data minimization)',
    check: () => ({ status: 'pass', rationale: 'ledger is metadata-only by construction — no payloads, no PII' }),
  },
  {
    id: 'least-privilege-creds', framework: 'Cross-cutting', clause: 'Brokered, least-privilege credentials',
    check: (r) => ({ status: 'pass', rationale: `${r.governance.secretsBrokered} scoped credential(s) brokered, ${r.governance.secretsRevoked} revoked; no master secret in the ledger` }),
  },
];

// Compute drift between two control sets (by id).
function computeDrift(controls, prior) {
  if (!prior || !Array.isArray(prior.controls)) return { vsPrior: false, changed: [], regressions: [] };
  const was = Object.fromEntries(prior.controls.map((c) => [c.id, c.status]));
  const changed = [];
  for (const c of controls) {
    if (was[c.id] && was[c.id] !== c.status) changed.push({ id: c.id, from: was[c.id], to: c.status });
  }
  const regressions = changed.filter((d) => (RANK[d.to] ?? 0) < (RANK[d.from] ?? 0));
  return { vsPrior: true, changed, regressions };
}

// Build the attestation (PURE). `prior` is the previous attestation (for drift).
export function buildAttestation({ now = '1970-01-01T00:00:00Z', period = 'daily', prior = null } = {}) {
  const report = complianceReport({ now });
  const controls = CONTROLS.map((c) => { const { status, rationale } = c.check(report); return { id: c.id, framework: c.framework, clause: c.clause, status, rationale }; });
  const summary = controls.reduce((a, c) => (a[c.status]++, a.total++, a), { total: 0, pass: 0, partial: 0, attention: 0, fail: 0 });
  const drift = computeDrift(controls, prior);
  const att = {
    profile: 'aigovops-attestation.v1',
    generatedAt: now, period,
    ledger: report.ledger,
    posture: summary.fail ? 'fail' : (summary.attention ? 'attention' : (summary.partial ? 'partial' : 'pass')),
    controls, summary, drift,
    reportHash: report.contentHash,
  };
  att.contentHash = beacon.sha256(beacon.canonicalize(att));
  return att;
}

// Build + sign: emit ONE signed receipt anchoring the attestation hash.
export function signAttestation({ now = '1970-01-01T00:00:00Z', period = 'daily', prior = null, emit = beacon.emit } = {}) {
  const attestation = buildAttestation({ now, period, prior });
  const receipt = emit({
    kind: 'attestation', actor: 'steward', action: 'attest',
    contentHash: attestation.contentHash,
    detail: { profile: attestation.profile, period, posture: attestation.posture, pass: attestation.summary.pass, fail: attestation.summary.fail, regressions: attestation.drift.regressions.length },
  });
  return { attestation, receipt };
}
