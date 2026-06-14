// test/oidc.test.mjs
// Ticket 8: OIDC id_token verification + role mapping + the full login flow,
// proven WITHOUT a live IdP by generating a keypair locally, signing an
// id_token, and serving discovery/JWKS/token via an injected fetch. The only
// thing this can't exercise here is a real IdP tenant (the operator step).

import { test } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-oidc-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const oidc = await import('../src/core/oidc.js');
const { identityFromClaims } = await import('../src/core/identity.js');

// --- a local "IdP": RSA keypair + JWK + id_token signer ----------------------
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-key-1';
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };
const JWKS = { keys: [JWK] };
const ISSUER = 'https://id.example.test/realms/aigovops';
const AUD = 'aigov-console';

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function signIdToken(claims, { alg = 'RS256', kid = KID } = {}) {
  const header = b64u({ alg, kid, typ: 'JWT' });
  const payload = b64u(claims);
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
  return `${header}.${payload}.${sig}`;
}
const baseClaims = (over = {}) => ({ iss: ISSUER, aud: AUD, sub: 'user-123', preferred_username: 'alice', exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000), ...over });

test('pkce: challenge is base64url(sha256(verifier))', () => {
  const { verifier, challenge, method } = oidc.pkce();
  assert.strictEqual(method, 'S256');
  assert.strictEqual(challenge, crypto.createHash('sha256').update(verifier).digest('base64url'));
});

test('verifyIdToken accepts a valid token and returns claims', () => {
  const claims = oidc.verifyIdToken(signIdToken(baseClaims()), { jwks: JWKS, issuer: ISSUER, audience: AUD });
  assert.strictEqual(claims.sub, 'user-123');
  assert.strictEqual(claims.preferred_username, 'alice');
});

test('verifyIdToken rejects tamper, wrong iss/aud, expiry, and bad nonce', () => {
  const good = signIdToken(baseClaims({ nonce: 'n1' }));
  // tampered signature
  const tampered = good.slice(0, -4) + 'AAAA';
  assert.throws(() => oidc.verifyIdToken(tampered, { jwks: JWKS, issuer: ISSUER, audience: AUD }), (e) => e.reason === 'bad-signature');
  // wrong issuer
  assert.throws(() => oidc.verifyIdToken(good, { jwks: JWKS, issuer: 'https://evil', audience: AUD, nonce: 'n1' }), (e) => e.reason === 'bad-issuer');
  // wrong audience
  assert.throws(() => oidc.verifyIdToken(good, { jwks: JWKS, issuer: ISSUER, audience: 'other', nonce: 'n1' }), (e) => e.reason === 'bad-audience');
  // expired
  const old = signIdToken(baseClaims({ exp: Math.floor(Date.now() / 1000) - 10_000 }));
  assert.throws(() => oidc.verifyIdToken(old, { jwks: JWKS, issuer: ISSUER, audience: AUD }), (e) => e.reason === 'expired');
  // nonce mismatch (replay guard)
  assert.throws(() => oidc.verifyIdToken(good, { jwks: JWKS, issuer: ISSUER, audience: AUD, nonce: 'n2' }), (e) => e.reason === 'bad-nonce');
});

test('claimsToIdentity: steward via group, via allow-list, else member', () => {
  assert.strictEqual(identityFromClaims(baseClaims({ groups: ['steward'] })).role, 'steward');
  assert.strictEqual(identityFromClaims(baseClaims({ preferred_username: 'ken' }), { stewards: ['ken'] }).role, 'steward');
  assert.strictEqual(identityFromClaims(baseClaims()).role, 'member');
  // steward maps to the capability dial (auto / see-all)
  const s = identityFromClaims(baseClaims({ realm_access: { roles: ['steward'] } }));
  assert.strictEqual(s.level, 'auto'); assert.strictEqual(s.scope, 'all');
});

test('buildAuthUrl carries code_challenge, nonce, state', () => {
  const disco = { authorization_endpoint: ISSUER + '/protocol/openid-connect/auth' };
  const href = oidc.buildAuthUrl(disco, { clientId: AUD, redirectUri: 'https://app/cb', state: 's1', nonce: 'n1', codeChallenge: 'cc' });
  const u = new URL(href);
  assert.strictEqual(u.searchParams.get('response_type'), 'code');
  assert.strictEqual(u.searchParams.get('code_challenge'), 'cc');
  assert.strictEqual(u.searchParams.get('code_challenge_method'), 'S256');
  assert.strictEqual(u.searchParams.get('nonce'), 'n1');
});

test('end-to-end login via injected fetch (fake IdP) mints the right role', async () => {
  oidc._resetCaches();
  process.env.OIDC_ISSUER = ISSUER;
  process.env.OIDC_CLIENT_ID = AUD;
  process.env.OIDC_REDIRECT_URI = 'https://app/auth/oidc/callback';
  process.env.STEWARDS = 'alice';
  const auth = await import('../src/core/auth.js');

  const disco = {
    issuer: ISSUER,
    authorization_endpoint: ISSUER + '/auth',
    token_endpoint: ISSUER + '/token',
    jwks_uri: ISSUER + '/jwks',
  };
  const idToken = signIdToken(baseClaims({ nonce: 'n1', groups: [] }));
  const fakeFetch = async (url, opts) => {
    const u = String(url);
    if (u.endsWith('/.well-known/openid-configuration')) return { ok: true, json: async () => disco };
    if (u.endsWith('/jwks')) return { ok: true, json: async () => JWKS };
    if (u.endsWith('/token')) return { ok: true, json: async () => ({ id_token: idToken, access_token: 'at', token_type: 'Bearer' }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const { login, role, token } = await auth.completeOidcLogin('the-code', { codeVerifier: 'v', nonce: 'n1', fetchImpl: fakeFetch });
  assert.strictEqual(login, 'alice');
  assert.strictEqual(role, 'steward', 'alice is on STEWARDS -> steward');
  // the issued session is valid and carries the role
  const session = auth.verifySession(token);
  assert.strictEqual(session.role, 'steward');
});

test('oidcConfigured reflects env', async () => {
  const auth = await import('../src/core/auth.js');
  assert.strictEqual(auth.oidcConfigured(), true); // set by the e2e test above
});
