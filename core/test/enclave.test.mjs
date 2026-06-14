// test/enclave.test.mjs
// Ticket 9: the enclave preflight is fail-closed. A fully-hardened env passes;
// any weaker dial is named and the boot assertion refuses to serve.

import { test } from 'node:test';
import assert from 'node:assert';

const { enclavePreflight, assertEnclave, ENCLAVE_CHECKS } = await import('../src/core/enclave.js');

const HARDENED = {
  SECRETS_PROFILE: 'enclave',
  VAULT_ADDR: 'https://vault.internal:8200',
  SANDBOX_BACKEND: 'gvisor',
  SANDBOX_DEFAULT_EGRESS: '',           // deny-all
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
