// test/notify.factory.test.mjs
// Channel selection (config-only), secret-free posture, and the auto-send-vs-gate
// policy that keeps an outward-facing send permissioned.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-notify-factory-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const { resolveChannels, createChannels, notifyPosture, notifyDecision, autosendKinds } = await import('../src/core/notify.factory.js');

test('resolveChannels: dashboard always present; unknown fails loud', () => {
  assert.deepStrictEqual(resolveChannels({ channels: '' }), ['dashboard']);
  assert.deepStrictEqual(resolveChannels({ channels: 'telegram,email' }).sort(), ['dashboard', 'email', 'telegram']);
  assert.throws(() => resolveChannels({ channels: 'pager' }), /unknown notify channel/);
});

test('createChannels builds the requested adapters + dashboard', () => {
  const m = createChannels({ channels: 'telegram' });
  assert.ok(m.has('dashboard') && m.has('telegram'));
  assert.strictEqual(m.get('telegram').name, 'telegram');
});

test('notifyPosture is secret-free: only channel/configured/egress', () => {
  const p = notifyPosture({ channels: 'telegram' });
  const tg = p.find((c) => c.channel === 'telegram');
  assert.strictEqual(tg.configured, false);            // no token in this process
  assert.deepStrictEqual(tg.egress, ['api.telegram.org']);
  assert.ok(!JSON.stringify(p).match(/token|secret|ops_/i));
});

test('policy: steward operational kinds auto-send; member/external-facing gates', () => {
  assert.strictEqual(notifyDecision({ kind: 'gate-pending', audience: 'stewards' }), 'auto');
  assert.strictEqual(notifyDecision({ kind: 'health', audience: 'stewards' }), 'auto');
  assert.strictEqual(notifyDecision({ kind: 'message', audience: 'stewards' }), 'gate');   // free-form not auto-class
  assert.strictEqual(notifyDecision({ kind: 'alert', audience: 'members' }), 'gate');       // member-facing always gates
  assert.ok(autosendKinds().includes('gate-pending'));
});
