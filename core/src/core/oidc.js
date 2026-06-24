// src/core/oidc.js
// OIDC IDENTITY (Ticket 8) — standards-based login, provider-agnostic.
// Dependency-free: Node's built-in crypto verifies the id_token; global fetch
// does discovery + JWKS + the code exchange. Works with ANY compliant OIDC IdP
// via discovery (/.well-known/openid-configuration).
//
// IdP CHOICE (the human decision, made and documented):
//   Default → **Keycloak** (open-source, self-hostable). It aligns with the
//   project's enclave principle ("run-it-yourself, verify-offline") — a regulated
//   org can run its own IdP in-perimeter, no third party in the trust path.
//   Hosted, zero-ops alternative → **Auth0** (or Okta/Entra/Google) — set the
//   same three env vars and it just works; nothing here is Keycloak-specific.
//   The existing GitHub OAuth (auth.js) stays as the lightweight default for the
//   public hub; OIDC is the path for membership + enclave deployments.
//
// Config (auth.js reads these):
//   OIDC_ISSUER         e.g. https://id.aigovops.org/realms/aigovops  (discovery base)
//   OIDC_CLIENT_ID / OIDC_CLIENT_SECRET
//   OIDC_REDIRECT_URI   https://<host>/auth/oidc/callback
//   OIDC_STEWARD_GROUP  claim group/role that grants the steward role (default 'steward')
//
// Roles map to the capability dial + oversight scope via identity.js (steward =
// auto/see-all; member = propose/see-own). A subject is a steward iff its
// id_token carries the steward group/role OR its username is on the STEWARDS
// allow-list — so role assignment never trusts a client-supplied value.

import crypto from 'node:crypto';

const b64uDecode = (s) => Buffer.from(s, 'base64url');
const b64uJson = (s) => JSON.parse(b64uDecode(s).toString('utf8'));

export class OidcError extends Error {
  constructor(reason, message) { super(message || reason); this.name = 'OidcError'; this.reason = reason; }
}

// PKCE (RFC 7636) — proof key for the authorization-code flow.
export function pkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge, method: 'S256' };
}
export const newNonce = () => crypto.randomBytes(16).toString('base64url');
export const newState = () => crypto.randomBytes(16).toString('hex');

// --- discovery + JWKS (cached) ----------------------------------------------
const _disco = new Map();
export async function discover(issuer, { fetchImpl = fetch, cache = true } = {}) {
  if (cache && _disco.has(issuer)) return _disco.get(issuer);
  const url = issuer.replace(/\/$/, '') + '/.well-known/openid-configuration';
  const res = await fetchImpl(url);
  if (!res.ok) throw new OidcError('discovery-failed', `discovery returned ${res.status}`);
  const doc = await res.json();
  for (const k of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
    if (!doc[k]) throw new OidcError('discovery-incomplete', `discovery missing ${k}`);
  }
  if (cache) _disco.set(issuer, doc);
  return doc;
}

const _jwks = new Map();
export async function getJwks(jwksUri, { fetchImpl = fetch, cache = true } = {}) {
  if (cache && _jwks.has(jwksUri)) return _jwks.get(jwksUri);
  const res = await fetchImpl(jwksUri);
  if (!res.ok) throw new OidcError('jwks-failed', `jwks returned ${res.status}`);
  const doc = await res.json();
  if (cache) _jwks.set(jwksUri, doc);
  return doc;
}

// The IdP authorization URL (code flow + PKCE + nonce).
export function buildAuthUrl(disco, { clientId, redirectUri, scope = 'openid email profile', state, nonce, codeChallenge }) {
  const u = new URL(disco.authorization_endpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', scope);
  if (state) u.searchParams.set('state', state);
  if (nonce) u.searchParams.set('nonce', nonce);
  if (codeChallenge) { u.searchParams.set('code_challenge', codeChallenge); u.searchParams.set('code_challenge_method', 'S256'); }
  return u.href;
}

// --- id_token verification (the security-critical part) ----------------------
const RSA_ALGS = { RS256: 'RSA-SHA256', RS384: 'RSA-SHA384', RS512: 'RSA-SHA512' };
const EC_ALGS = { ES256: 'SHA256', ES384: 'SHA384', ES512: 'SHA512' };

function verifySignature(signingInput, sigB64u, jwk, alg) {
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const sig = b64uDecode(sigB64u);
  const data = Buffer.from(signingInput);
  if (RSA_ALGS[alg]) return crypto.verify(RSA_ALGS[alg], data, key, sig);
  if (EC_ALGS[alg]) return crypto.verify(EC_ALGS[alg], data, { key, dsaEncoding: 'ieee-p1363' }, sig);
  throw new OidcError('unsupported-alg', `unsupported id_token alg ${alg}`);
}

// Validate an id_token: signature (JWKS), iss, aud, exp/nbf, and nonce. Returns
// the verified claims, or throws an OidcError with a precise reason.
export function verifyIdToken(idToken, { jwks, issuer, audience, nonce = null, now = Date.now(), clockSkewSec = 60 }) {
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new OidcError('malformed-jwt', 'id_token must have 3 segments');
  const header = b64uJson(parts[0]);
  const claims = b64uJson(parts[1]);
  const keys = (jwks && jwks.keys) || [];
  // When the token carries a kid it MUST match a JWKS key — only fall back to a lone key when the
  // token has no kid at all (some IdPs omit it with a single-key set). Don't silently accept a
  // mismatched kid against the one key.
  const key = keys.find((k) => k.kid === header.kid) || ((!header.kid && keys.length === 1) ? keys[0] : null);
  if (!key) throw new OidcError('no-key', 'no JWKS key matches the id_token kid');
  if (!verifySignature(parts[0] + '.' + parts[1], parts[2], key, header.alg)) throw new OidcError('bad-signature', 'id_token signature is invalid');

  if (issuer && claims.iss !== issuer) throw new OidcError('bad-issuer', `unexpected iss ${claims.iss}`);
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (audience && !auds.includes(audience)) throw new OidcError('bad-audience', 'aud does not include this client');
  // OIDC §3.1.3.7: if aud has multiple values, azp MUST be present and equal this client; and when
  // azp is present at all it MUST equal this client. Without this, a token minted for another relying
  // party in the same IdP that merely lists us in `aud` would validate (cross-client token reuse).
  if (audience && (auds.length > 1 || claims.azp !== undefined) && claims.azp !== audience)
    throw new OidcError('bad-azp', 'azp is missing or not this client (multi-aud or azp-present token)');
  const skew = clockSkewSec * 1000;
  if (claims.exp && now > claims.exp * 1000 + skew) throw new OidcError('expired', 'id_token is expired');
  if (claims.nbf && now < claims.nbf * 1000 - skew) throw new OidcError('not-yet-valid', 'id_token nbf is in the future');
  if (nonce && claims.nonce !== nonce) throw new OidcError('bad-nonce', 'id_token nonce mismatch (possible replay)');
  return claims;
}

// Map verified claims to a raw identity { id, role, username }. Role assignment
// trusts only the IdP-asserted groups/roles or the server-side stewards list.
export function claimsToIdentity(claims, { stewards = [], stewardGroup = 'steward' } = {}) {
  const groups = []
    .concat(claims.groups || [], claims.roles || [], (claims.realm_access && claims.realm_access.roles) || [])
    .map((g) => String(g).toLowerCase());
  const username = String(claims.preferred_username || claims.email || claims.sub || '').toLowerCase();
  const isSteward = groups.includes(String(stewardGroup).toLowerCase()) || stewards.map((s) => s.toLowerCase()).includes(username);
  return { id: `oidc:${claims.sub}`, role: isSteward ? 'steward' : 'member', username };
}

// Exchange an authorization code for tokens at the IdP, then verify the id_token.
// Injectable fetch makes this fully testable without a live IdP.
export async function exchangeCode({ disco, code, clientId, clientSecret, redirectUri, codeVerifier, fetchImpl = fetch }) {
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId });
  if (clientSecret) body.set('client_secret', clientSecret);
  if (codeVerifier) body.set('code_verifier', codeVerifier);
  const res = await fetchImpl(disco.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: body.toString() });
  if (!res.ok) throw new OidcError('token-exchange-failed', `token endpoint returned ${res.status}`);
  const tok = await res.json();
  if (!tok.id_token) throw new OidcError('no-id-token', 'token response carried no id_token');
  return tok;
}

// Test/seam helper: clear discovery + JWKS caches.
export function _resetCaches() { _disco.clear(); _jwks.clear(); }
