// src/core/reports.js
// LEDGER-DERIVED OBSERVABILITY — backends for the Herald skill `status-report`
// and the Sentinel skill `monitor-and-alert`. Both read ONLY the signed Beacon
// ledger (the unit of truth), so their output is itself verifiable. Metadata
// only — they summarise receipt shapes, never payloads (there are none).

import fs from 'node:fs';
import * as beacon from './beacon.js';

function records() {
  const f = beacon.ledgerFile();
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).record);
}

// Herald — compose a status summary from the period's receipts (facts only).
export function statusReport(period = 'all') {
  const recs = records();
  const byAction = {}, byKind = {};
  for (const r of recs) {
    byAction[r.action] = (byAction[r.action] || 0) + 1;
    byKind[r.kind] = (byKind[r.kind] || 0) + 1;
  }
  return { period, sources: ['ledger'], entries: recs.length, byAction, byKind, verified: beacon.verifyLedger().valid };
}

// Sentinel — scan the ledger for the signals that warrant an alert.
export function monitorAlerts() {
  const alerts = [];
  for (const r of records()) {
    let signal = null;
    if (r.action === 'cap-breach') signal = 'cap-breach';
    else if (r.kind === 'sandbox' && r.action === 'violation') signal = 'sandbox-violation';
    else if (r.action === 'deny') signal = 'gate-deny';
    if (signal) alerts.push({ signal, severity: signal === 'gate-deny' ? 'info' : 'high' });
  }
  const highest = alerts.some((a) => a.severity === 'high') ? 'high' : (alerts.length ? 'info' : 'none');
  return { alerts, count: alerts.length, highest };
}
