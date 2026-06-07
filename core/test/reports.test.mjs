// test/reports.test.mjs
// Step 5 — the ledger-derived backends for status-report (Herald) and
// monitor-and-alert (Sentinel). Both read ONLY the signed ledger.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-reports-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const beacon = await import('../src/core/beacon.js');
const { statusReport, monitorAlerts } = await import('../src/core/reports.js');

test('statusReport summarises the ledger by action/kind', () => {
  beacon.emit({ kind: 'gate', actor: 'a', action: 'approve' });
  beacon.emit({ kind: 'secret', actor: 'a', action: 'issue' });
  const rep = statusReport('this-week');
  assert.equal(rep.period, 'this-week');
  assert.ok(rep.entries >= 2);
  assert.ok(rep.byAction.approve >= 1);
  assert.ok(rep.byKind.secret >= 1);
  assert.equal(rep.verified, true);
});

test('monitorAlerts flags cap-breach / sandbox-violation / gate-deny', () => {
  beacon.emit({ kind: 'gate', actor: 'a', action: 'cap-breach', detail: { reason: 'spend-cap' } });
  beacon.emit({ kind: 'sandbox', actor: 'sandbox:process', action: 'violation', detail: { type: 'fs-escape' } });
  beacon.emit({ kind: 'gate', actor: 'a', action: 'deny' });
  const mon = monitorAlerts();
  assert.ok(mon.count >= 3);
  assert.equal(mon.highest, 'high');
  const signals = mon.alerts.map((a) => a.signal);
  assert.ok(signals.includes('cap-breach'));
  assert.ok(signals.includes('sandbox-violation'));
  assert.ok(signals.includes('gate-deny'));
});
