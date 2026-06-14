// src/core/auth.js
// AUTHENTICATION — GitHub OAuth + signed sessions (Ticket 8 / Phase 1 security).
// Closes the open door: write endpoints (decide/run/kill/skills-run) require an
// authenticated human; role (steward|member) comes from the STEWARDS allow-list.
// Dependency-free: node:crypto HMAC sessions, global fetch for the GitHub calls.
//
// Config (all via env; the OAuth app + secret are the human's to create/set):
//   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET   the OAuth app credentials
//   OAUTH_REDIRECT_URI                        e.g. https://<app>/auth/callback
//   STEWARDS=login1,login2                     GitHub logins that get the steward role
//   SESSION_SECRET                             HMAC key for session cookies (else random per-boot)
//   STEWARD_TOKEN                              optional ops bearer token (admin escape hatch)
//   AUTH_DISABLED=true                         LOCAL DEV ONLY — treat caller as steward
//
// Fail-closed: with nothing configured, writes are denied (401).

import crypto from 'node:crypto';
import { identify, identityFromClaims } from './identity.js';
import * as oidc from './oidc.js';

const b64u = (b) => Buffer.from(b).toString('base64url');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) console.warn('[auth] SESSION_SECRET unset — using a random per-boot key (sessions drop on restart).');

const STEWARDS = (process.env.STEWARDS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const COOKIE = 'aigov_session';
const TTL_MS = 12 * 3600 * 1000;

export function roleFor(login) {
  return STEWARDS.includes(String(login || '').toLowerCase()) ? 'steward' : 'member';
}

// --- signed session token: <b64url(json)>.<b64url(hmac)> ----------------------
export function signSession(payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}
export function verifySession(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!p.exp || p.exp < Date.now()) return null;
    return p; // { login, role, exp }
  } catch { return null; }
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Resolve the caller's identity, or null if unauthenticated.
export function identityFromReq(req) {
  // 1) ops bearer token (optional admin escape hatch)
  const auth = req.headers.authorization || '';
  if (process.env.STEWARD_TOKEN && auth === `Bearer ${process.env.STEWARD_TOKEN}`) {
    return identify({ id: 'ops:token', role: 'steward' });
  }
  // 2) local-dev override (must be explicit; logs loudly)
  if (process.env.AUTH_DISABLED === 'true') return identify({ id: 'local:dev', role: 'steward' });
  // 3) signed GitHub session cookie
  const s = verifySession(parseCookies(req)[COOKIE]);
  if (s) return identify({ id: `github:${s.login}`, role: s.role });
  return null;
}

const RANK = { member: 1, steward: 2 };
export const isAuthed = (id) => !!id;
export const hasRole = (id, role) => !!id && (RANK[id.role] || 0) >= (RANK[role] || 99);
export const oauthConfigured = () => !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

// --- OAuth web flow helpers ---------------------------------------------------
export function loginRedirectUrl(state) {
  const u = new URL('https://github.com/login/oauth/authorize');
  u.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID || '');
  u.searchParams.set('scope', 'read:user');
  u.searchParams.set('state', state);
  if (process.env.OAUTH_REDIRECT_URI) u.searchParams.set('redirect_uri', process.env.OAUTH_REDIRECT_URI);
  return u.href;
}

// Exchange the OAuth code for a GitHub login, then map to a role + session.
export async function completeLogin(code) {
  const tokRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code }),
  });
  const tok = await tokRes.json();
  if (!tok.access_token) throw new Error('oauth: no access_token (' + (tok.error || 'unknown') + ')');
  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tok.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'aigovops' },
  });
  const user = await userRes.json();
  if (!user.login) throw new Error('oauth: could not read GitHub user');
  const role = roleFor(user.login);
  const token = signSession({ login: user.login, role, exp: Date.now() + TTL_MS });
  return { login: user.login, role, token };
}

export const sessionCookie = (token) =>
  `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${TTL_MS / 1000}; Secure`;
export const clearCookie = () => `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
export const newState = () => crypto.randomBytes(16).toString('hex');

// --- OIDC web flow (Ticket 8) — standards-based, provider-agnostic ------------
// Same session machinery (signed cookie); the difference is WHO vouches for the
// human. Config via env (see oidc.js). Role comes from the verified id_token's
// groups/roles or the STEWARDS allow-list — never a client-supplied value.
export const oidcConfigured = () => !!(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID);

export async function oidcLoginRedirect({ state, nonce, codeChallenge, fetchImpl = fetch } = {}) {
  const disco = await oidc.discover(process.env.OIDC_ISSUER, { fetchImpl });
  return oidc.buildAuthUrl(disco, {
    clientId: process.env.OIDC_CLIENT_ID,
    redirectUri: process.env.OIDC_REDIRECT_URI,
    scope: process.env.OIDC_SCOPE || 'openid email profile',
    state, nonce, codeChallenge,
  });
}

// Exchange the code, verify the id_token, map claims -> role, mint a session.
export async function completeOidcLogin(code, { codeVerifier, nonce, fetchImpl = fetch, now } = {}) {
  const issuer = process.env.OIDC_ISSUER;
  const disco = await oidc.discover(issuer, { fetchImpl });
  const jwks = await oidc.getJwks(disco.jwks_uri, { fetchImpl });
  const tok = await oidc.exchangeCode({
    disco, code, clientId: process.env.OIDC_CLIENT_ID, clientSecret: process.env.OIDC_CLIENT_SECRET,
    redirectUri: process.env.OIDC_REDIRECT_URI, codeVerifier, fetchImpl,
  });
  const claims = oidc.verifyIdToken(tok.id_token, {
    jwks, issuer, audience: process.env.OIDC_CLIENT_ID, nonce, ...(now ? { now } : {}),
  });
  const idn = identityFromClaims(claims, { stewards: STEWARDS, stewardGroup: process.env.OIDC_STEWARD_GROUP || 'steward' });
  const token = signSession({ login: idn.username || idn.id, role: idn.role, sub: claims.sub, exp: Date.now() + TTL_MS });
  return { login: idn.username || idn.id, role: idn.role, token };
}
