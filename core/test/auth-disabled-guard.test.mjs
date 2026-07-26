// test/auth-disabled-guard.test.mjs
// AUTH_DISABLED must be a LOCAL-DEV-ONLY escape hatch: honored only when
// NODE_ENV is explicitly development or test, and IGNORED (auth stays enforced)
// in production or when NODE_ENV is unset. Regression guard for the security fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ENV_KEYS = ['NODE_ENV', 'AUTH_DISABLED', 'SESSION_SECRET', 'STEWARD_TOKEN'];

async function roleUnder(env) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  // Provide a SESSION_SECRET so importing the module never throws on the prod boot guard.
  process.env.SESSION_SECRET ||= 'test-secret';
  // Cache-bust so module top-level (which reads env once) re-evaluates per case.
  const mod = await import(`../src/core/auth.js?case=${Math.random()}`);
  const id = mod.identityFromReq({ headers: {} });
  return id ? id.role : null;
}

test('AUTH_DISABLED is ignored when NODE_ENV is unset (auth enforced)', async () => {
  assert.equal(await roleUnder({ AUTH_DISABLED: 'true' }), null);
});

test('AUTH_DISABLED is ignored in production (auth enforced)', async () => {
  assert.equal(await roleUnder({ AUTH_DISABLED: 'true', NODE_ENV: 'production' }), null);
});

test('AUTH_DISABLED grants dev steward in development', async () => {
  assert.equal(await roleUnder({ AUTH_DISABLED: 'true', NODE_ENV: 'development' }), 'steward');
});

test('AUTH_DISABLED grants dev steward in test', async () => {
  assert.equal(await roleUnder({ AUTH_DISABLED: 'true', NODE_ENV: 'test' }), 'steward');
});

test('without AUTH_DISABLED, an unauthenticated caller is null in dev too', async () => {
  assert.equal(await roleUnder({ NODE_ENV: 'development' }), null);
});
