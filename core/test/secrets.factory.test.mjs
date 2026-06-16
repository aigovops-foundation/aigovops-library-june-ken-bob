// test/secrets.factory.test.mjs
// Ticket 2: the config-only swap. createSecretsProvider() returns the right
// backend for the PROFILE, and the gate drives EITHER through the identical
// call site (no code change between providers).

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-secrets-factory-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const { createSecretsProvider, resolveProfile, secretsPosture } = await import('../src/core/secrets.factory.js');
const { FileProvider } = await import('../src/core/secrets.fileprovider.js');
const { VaultProvider } = await import('../src/core/secrets.vaultprovider.js');
const gate = await import('../src/core/gate.js');

const SCOPE = 'github-deploy';
function writeStore() {
  const p = path.join(TMP, `store-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(p, JSON.stringify({ owner: 'lab', scopes: { [SCOPE]: 'MASTER-x' }, rotated: {} }));
  return p;
}

test('profile resolution: explicit > SECRETS_PROFILE > PROFILE > lab', async () => {
  assert.strictEqual(resolveProfile({ profile: 'enclave' }), 'enclave');
  assert.strictEqual(resolveProfile({}), 'lab'); // nothing set in this process
});

test('lab profile yields a FileProvider', async () => {
  const p = createSecretsProvider({ profile: 'lab', storePath: writeStore() });
  assert.ok(p instanceof FileProvider);
});

test('community/enclave profile yields a VaultProvider', async () => {
  assert.ok(createSecretsProvider({ profile: 'community', request: () => ({ status: 404, json: {} }) }) instanceof VaultProvider);
  assert.ok(createSecretsProvider({ profile: 'enclave', request: () => ({ status: 404, json: {} }) }) instanceof VaultProvider);
});

test('unknown profile fails loudly', async () => {
  assert.throws(() => createSecretsProvider({ profile: 'martian' }), /unknown secrets profile/);
});

test('secretsPosture reports profile + backend, and is secret-free', async () => {
  const lab = secretsPosture({ profile: 'lab' });
  assert.deepStrictEqual(lab, { profile: 'lab', backend: 'file' });

  const vault = secretsPosture({ profile: 'enclave' });
  assert.strictEqual(vault.backend, 'vault');
  assert.ok('addr' in vault && !('authConfigured' in vault));

  const op = secretsPosture({ profile: '1password' });
  assert.strictEqual(op.backend, '1password');
  assert.strictEqual(op.vault, 'AiGovOps');
  assert.strictEqual(typeof op.opInstalled, 'boolean');
  assert.strictEqual(op.authConfigured, false);   // no token set in this test process
  // the token itself must never appear in the posture
  assert.ok(!JSON.stringify(op).includes('ops_'));
});

test('the gate brokers through a factory-built provider with no code change', async () => {
  const secrets = createSecretsProvider({ profile: 'lab', storePath: writeStore() });
  const res = await gate.decide({
    proposal: { summary: 'deploy', requiresHumanGate: true },
    decision: 'approve', scope: SCOPE, ttlSeconds: 60, requestedBy: 'gate', secrets
  });
  assert.strictEqual(res.approved, true);
  assert.ok(res.grant && res.grant.token && res.grant.token !== 'MASTER-x');
});
