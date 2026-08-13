// test/enclave.test.mjs
// Ticket 9: the enclave preflight is fail-closed. A fully-hardened env passes;
// any weaker dial is named and the boot assertion refuses to serve.

import { test } from 'node:test';
import assert from 'node:assert';

const { enclavePreflight, assertEnclave, ENCLAVE_CHECKS, enclaveSecretsKind } = await import('../src/core/enclave.js');

const HARDENED = {
  SECRETS_PROFILE: 'enclave',
  VAULT_ADDR: 'https://vault.internal:8200',
  SANDBOX_BACKEND: 'gvisor',
  SANDBOX_DEFAULT_EGRESS: '',           // deny-all
  ALLOW_CLOUD: 'false',
  POLICY_ENGINE: 'opa',
  DATABASE_URL: 'postgres://aigov@db.internal:5432/aigov',
};

// The MANAGED (Jeeves) posture: 1Password brokers, no Vault. Every other dial is
// identical to the air-gapped one.
const HARDENED_OP = {
  SECRETS_PROFILE: '1password',
  OP_SERVICE_ACCOUNT_TOKEN: 'ops_fake_token_for_test',
  SANDBOX_BACKEND: 'gvisor',
  SANDBOX_DEFAULT_EGRESS: '',
  ALLOW_CLOUD: 'false',
  POLICY_ENGINE: 'opa',
  DATABASE_URL: 'postgres://aigov@db.internal:5432/aigov',
};

test('a fully-hardened env passes preflight', () => {
  const r = enclavePreflight(HARDENED);
  assert.strictEqual(r.hardened, true, JSON.stringify(r.failures));
  assert.strictEqual(r.failures.length, 0);
  assert.strictEqual(r.checks.length, ENCLAVE_CHECKS.length);
});

test('each weakened dial is caught and named', () => {
  const cases = {
    secrets: { ...HARDENED, SECRETS_PROFILE: 'lab' },
    'vault-addr': { ...HARDENED, VAULT_ADDR: '' },
    sandbox: { ...HARDENED, SANDBOX_BACKEND: 'process' },
    egress: { ...HARDENED, SANDBOX_DEFAULT_EGRESS: 'api.github.com:443,*' },
    cloud: { ...HARDENED, ALLOW_CLOUD: 'true' },
    policy: { ...HARDENED, POLICY_ENGINE: 'js' },
    storage: { ...HARDENED, DATABASE_URL: '' },
  };
  for (const [key, env] of Object.entries(cases)) {
    const r = enclavePreflight(env);
    assert.strictEqual(r.hardened, false, `${key} should fail`);
    assert.ok(r.failures.includes(key), `failures should include ${key}, got ${r.failures}`);
  }
});

test('assertEnclave throws on a weak posture, returns on a hardened one', () => {
  assert.throws(() => assertEnclave({ ...HARDENED, ALLOW_CLOUD: 'true' }), /enclave preflight failed/);
  assert.strictEqual(assertEnclave(HARDENED).hardened, true);
});

// --- the MANAGED (Jeeves) posture: 1Password as the broker --------------------

test('the 1Password-brokered posture passes preflight (no Vault required)', () => {
  const r = enclavePreflight(HARDENED_OP);
  assert.strictEqual(r.hardened, true, JSON.stringify(r.failures));
  assert.strictEqual(r.secretsKind, '1password');
  assert.strictEqual(r.posture, 'managed');
  assert.strictEqual(assertEnclave(HARDENED_OP).hardened, true);
});

test('the air-gapped Vault posture reports its kind + posture', () => {
  const r = enclavePreflight(HARDENED);
  assert.strictEqual(r.secretsKind, 'vault');
  assert.strictEqual(r.posture, 'air-gapped');
  assert.strictEqual(r.notes.length, 0, 'air-gapped posture needs no cloud-tradeoff note');
});

test('a 1Password posture without a service-account token fails closed (would hang on a prompt)', () => {
  const { OP_SERVICE_ACCOUNT_TOKEN, ...noToken } = HARDENED_OP;
  const r = enclavePreflight(noToken);
  assert.strictEqual(r.hardened, false);
  assert.ok(r.failures.includes('vault-addr'), `broker-not-wired should be named, got ${r.failures}`);
});

test('the managed posture flags the cloud tradeoff loudly — never silent', () => {
  const r = enclavePreflight(HARDENED_OP);
  assert.ok(r.notes.some((n) => /NOT air-gapped/.test(n)), `expected a cloud-tradeoff note, got ${JSON.stringify(r.notes)}`);
});

test('enclaveSecretsKind names the backend, null when unbrokered', () => {
  assert.strictEqual(enclaveSecretsKind({ SECRETS_PROFILE: 'op' }), '1password');
  assert.strictEqual(enclaveSecretsKind({ SECRETS_PROFILE: 'vault' }), 'vault');
  assert.strictEqual(enclaveSecretsKind({ SECRETS_PROFILE: 'lab' }), null);
  assert.strictEqual(enclaveSecretsKind({}), null);
});
