// test/secrets.onepassword.test.mjs
// 1Password-backed SecretsProvider — proven against a FAKE `op` runner (never a
// real vault, never an interactive prompt). Runs the SAME contract suite as
// File/Vault, so "API keys live in 1Password" is config-only and the gate is
// unchanged. Plus op.js reference parsing + fail-closed behaviour.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MASTER = 'OP-STORED-API-KEY-DO-NOT-LEAK-5b1';
const SCOPE = 'github-deploy';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-op-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const beacon = await import('../src/core/beacon.js');
const { OnePasswordProvider } = await import('../src/core/secrets.onepassword.js');
const { createSecretsProvider } = await import('../src/core/secrets.factory.js');
const op = await import('../src/core/op.js');
const { runContract } = await import('./secrets-contract.shared.mjs');

// A fake `op` CLI: returns the stored secret for the known scope's reference,
// errors for anything else (so unknown scopes fail closed).
function fakeOp() {
  return (args) => {
    const ref = args[args.length - 1];
    if (ref === `op://AiGovOps/${SCOPE}/credential`) return MASTER + '\n';
    const e = new Error(`op: item not found: ${ref}`); throw e;
  };
}
const makeOp = (overrides = {}) => new OnePasswordProvider({ opRun: fakeOp(), ...overrides });

// --- op.js unit checks -------------------------------------------------------
test('op.js parses op:// references and reads via the injected runner', () => {
  assert.strictEqual(op.isOpRef('op://Vault/Item/field'), true);
  assert.strictEqual(op.isOpRef('plain-value'), false);
  assert.strictEqual(op.opRead('op://AiGovOps/github-deploy/credential', { run: fakeOp() }), MASTER);
  assert.strictEqual(op.resolveSecret('literal'), 'literal');
  assert.strictEqual(op.resolveSecret('op://AiGovOps/github-deploy/credential', { run: fakeOp() }), MASTER);
  assert.throws(() => op.opRead('not-a-ref', { run: fakeOp() }), /not an op:\/\/ reference/);
});

test('factory: the 1password profile yields a OnePasswordProvider', () => {
  assert.ok(createSecretsProvider({ profile: '1password', opRun: fakeOp() }) instanceof OnePasswordProvider);
  assert.ok(createSecretsProvider({ profile: 'op', opRun: fakeOp() }) instanceof OnePasswordProvider);
});

test('fails closed when op is unavailable (no runner, no CLI configured)', () => {
  // Force the no-injected-runner path with op not automatable.
  const prev = process.env.OP_SERVICE_ACCOUNT_TOKEN; delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
  const p = new OnePasswordProvider({ /* no opRun */ });
  // issue() -> _masterFor -> either op-unavailable (no CLI) or unknown-scope (CLI present but not configured)
  assert.throws(() => p.issue(SCOPE, 60, 'gate'), (e) => e.reason === 'op-unavailable' || e.reason === 'unknown-scope');
  if (prev) process.env.OP_SERVICE_ACCOUNT_TOKEN = prev;
});

// --- the SAME contract as File/Vault ----------------------------------------
runContract({ test, label: 'OnePasswordProvider', makeProvider: makeOp, master: MASTER, scope: SCOPE, beacon });
