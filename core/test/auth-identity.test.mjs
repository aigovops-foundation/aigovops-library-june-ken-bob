// test/auth-identity.test.mjs
// Ticket A2: the authenticated OIDC/GitHub identity flows through the governed
// loop instead of an anon stub. identityFromReq resolves a signed session to the
// real subject (provider-aware) with the right role + capability scope.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-authid-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');
process.env.SESSION_SECRET = 'test-session-secret-stable';

const auth = await import('../src/core/auth.js');

const reqWithCookie = (token) => ({ headers: { cookie: `aigov_session=${encodeURIComponent(token)}` } });

test('an OIDC session resolves to oidc:<sub> with its role + scope', () => {
  const token = auth.signSession({ login: 'alice', role: 'steward', provider: 'oidc', sub: 'kc-9f2', exp: Date.now() + 60_000 });
  const id = auth.identityFromReq(reqWithCookie(token));
  assert.strictEqual(id.id, 'oidc:kc-9f2', 'attributed to the real OIDC subject, not a stub');
  assert.strictEqual(id.role, 'steward');
  assert.strictEqual(id.scope, 'all', 'steward sees all');
  assert.strictEqual(id.level, 'auto');
});

test('a member OIDC session is scoped to its own effects', () => {
  const token = auth.signSession({ login: 'bob', role: 'member', provider: 'oidc', sub: 'kc-bob', exp: Date.now() + 60_000 });
  const id = auth.identityFromReq(reqWithCookie(token));
  assert.strictEqual(id.id, 'oidc:kc-bob');
  assert.strictEqual(id.scope, 'own');
  assert.strictEqual(id.level, 'propose');
});

test('a legacy GitHub session (no provider/sub) still resolves to github:<login>', () => {
  const token = auth.signSession({ login: 'ken', role: 'steward', exp: Date.now() + 60_000 });
  const id = auth.identityFromReq(reqWithCookie(token));
  assert.strictEqual(id.id, 'github:ken');
  assert.strictEqual(id.role, 'steward');
});

test('an expired session resolves to null (fails closed)', () => {
  const token = auth.signSession({ login: 'x', role: 'member', provider: 'oidc', sub: 's', exp: Date.now() - 1 });
  assert.strictEqual(auth.identityFromReq(reqWithCookie(token)), null);
});
