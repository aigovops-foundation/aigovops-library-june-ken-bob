// test/oversight.test.mjs
// Ticket 6 (core) — role-scoped ledger views + a steward-only kill switch.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-oversight-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const beacon = await import('../src/core/beacon.js');
const { ledgerView, canKill } = await import('../src/core/oversight.js');
const { createGovernedCore } = await import('../src/core/govapi.js');
const { FileProvider } = await import('../src/core/secrets.fileprovider.js');

const noStore = () => new FileProvider({ storePath: path.join(TMP, 'absent.json') });

test('ledgerView is role-scoped: steward sees all, member sees only their own', () => {
  beacon.emit({ kind: 'gate', actor: 'member:anon', action: 'ask' });
  beacon.emit({ kind: 'gate', actor: 'agent:maker', action: 'approve' });
  const all = ledgerView({ role: 'steward' });
  const mine = ledgerView({ role: 'member', id: 'member:anon' });
  assert.ok(all.length >= 2);
  assert.ok(mine.length >= 1 && mine.length < all.length);
  assert.ok(mine.every((r) => r.actor === 'member:anon'));
});

test('canKill is steward-only', () => {
  assert.equal(canKill('steward'), true);
  assert.equal(canKill('member'), false);
});

test('govapi oversight: member cannot kill; steward can', () => {
  const core = createGovernedCore({ secrets: noStore() });
  assert.throws(() => core.oversight({ role: 'member', id: 'member:anon' }).kill(), /steward-only/);
  assert.equal(core.isHalted(), false);
  core.oversight({ role: 'steward', id: 'bob' }).kill();
  assert.equal(core.isHalted(), true);
});

test('govapi oversight view filters to the caller for a member', () => {
  const core = createGovernedCore({ secrets: noStore() });
  const v = core.oversight({ role: 'member', id: 'member:anon' }).view();
  assert.ok(v.every((r) => r.actor === 'member:anon'));
});
