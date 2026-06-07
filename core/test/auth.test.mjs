// test/auth.test.mjs
// Phase 1 — GitHub-OAuth sessions + role gating. Pure parts tested without network
// (the OAuth code-exchange hits GitHub and is exercised only in integration).

import { test } from 'node:test';
import assert from 'node:assert';

process.env.STEWARDS = 'bobrapp, kenj';
process.env.SESSION_SECRET = 'test-secret-do-not-use';

const auth = await import('../src/core/auth.js');

test('STEWARDS allow-list drives the role', () => {
  assert.equal(auth.roleFor('bobrapp'), 'steward');
  assert.equal(auth.roleFor('BobRapp'), 'steward');   // case-insensitive
  assert.equal(auth.roleFor('someone-else'), 'member');
});

test('session token signs, verifies, rejects tamper + expiry', () => {
  const t = auth.signSession({ login: 'bobrapp', role: 'steward', exp: Date.now() + 10000 });
  const v = auth.verifySession(t);
  assert.equal(v.login, 'bobrapp');
  assert.equal(auth.verifySession(t.slice(0, -2) + 'xx'), null, 'tampered MAC rejected');
  assert.equal(auth.verifySession(auth.signSession({ login: 'x', role: 'member', exp: Date.now() - 1 })), null, 'expired rejected');
});

test('hasRole ranks member < steward', () => {
  const steward = { role: 'steward' }, member = { role: 'member' };
  assert.equal(auth.hasRole(steward, 'member'), true);
  assert.equal(auth.hasRole(steward, 'steward'), true);
  assert.equal(auth.hasRole(member, 'steward'), false);
  assert.equal(auth.hasRole(member, 'member'), true);
  assert.equal(auth.hasRole(null, 'member'), false);
});

test('identityFromReq: session cookie → identity', () => {
  const t = auth.signSession({ login: 'bobrapp', role: 'steward', exp: Date.now() + 10000 });
  const id = auth.identityFromReq({ headers: { cookie: `aigov_session=${encodeURIComponent(t)}` } });
  assert.equal(id.id, 'github:bobrapp');
  assert.equal(id.role, 'steward');
});

test('identityFromReq: ops bearer token → steward; nothing → null', () => {
  process.env.STEWARD_TOKEN = 'ops-secret';
  assert.equal(auth.identityFromReq({ headers: { authorization: 'Bearer ops-secret' } }).role, 'steward');
  assert.equal(auth.identityFromReq({ headers: { authorization: 'Bearer wrong' } }), null);
  delete process.env.STEWARD_TOKEN;
  assert.equal(auth.identityFromReq({ headers: {} }), null, 'fail closed when unauthenticated');
});
