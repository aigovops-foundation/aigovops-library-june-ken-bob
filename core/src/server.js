// src/server.js
// API GATEWAY — the one front door to the governed core.
// Dependency-free (Node built-in http). Enforces: CORS allow-list, basic
// rate-limit, locale negotiation, and "no keys in any client". Every meaningful
// action emits a metadata-only, Ed25519-signed Beacon receipt.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import * as beacon from './core/beacon.js';
import * as policy from './core/policy.js';
import { frameworks } from './core/lantern.js';
import { respondAsync, modelPosture } from './core/router.js';
import { member } from './core/identity.js';
import { propose } from './core/agent.js';
import { createGovernedCore } from './core/govapi.js';
import { Caps } from './core/caps.js';
import { createMemberCaps } from './core/member-caps.js';
import { dispatch as agentDispatch, listAgents } from './core/agents.js';
import * as auth from './core/auth.js';
import { negotiate, t } from './core/i18n.js';
import { routeDesk } from './api/desks.js';
import { resolveSecret, isOpRef } from './core/op.js';
import { secretsPosture } from './core/secrets.factory.js';
import { createHermes } from './core/notify.js';
import { notifyPosture, notifyDecision, autosendKinds } from './core/notify.factory.js';
import { createTelegramBridge } from './core/bridge.telegram.js';
import * as metrics from './core/metrics.js';
import { MemoryStore, createStateStore } from './core/statestore.js';
import { createRateLimiter } from './core/ratelimit.js';
import { createQuota } from './core/quota.js';
import { searchCorpus } from './core/search.js';
import { createCheckpoint, verifyFromCheckpoint } from './core/checkpoints.js';
import { Orgs } from './core/orgs.js';
import { Workflows } from './core/workflow.js';
import { buildDsar } from './core/dsar.js';
import { residencyTag } from './core/residency.js';
import { createNotifyPrefs } from './core/notify.prefs.js';

// Boot: any backend credential supplied as an op:// reference is resolved from
// 1Password (service-account token / `op signin`). Literals pass through
// untouched; a failed resolution unsets the var (fail closed) rather than leaking
// the reference string. This is how "every credential lives in 1Password" holds.
for (const k of ['SESSION_SECRET', 'STEWARD_TOKEN', 'OIDC_CLIENT_SECRET', 'GITHUB_CLIENT_SECRET', 'DATABASE_URL', 'VAULT_TOKEN', 'LLM_CLOUD_KEY', 'REDIS_URL', 'OP_SERVICE_ACCOUNT_TOKEN',
  'NOTIFY_TELEGRAM_TOKEN', 'NOTIFY_TWILIO_TOKEN', 'NOTIFY_EMAIL_TOKEN', 'NOTIFY_TELEGRAM_WEBHOOK_SECRET']) {
  if (isOpRef(process.env[k])) {
    try { process.env[k] = resolveSecret(process.env[k]); }
    catch (e) { console.error(`[op] could not resolve ${k} from 1Password: ${e.message}`); delete process.env[k]; }
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const ALLOWED = (process.env.ALLOWED_ORIGINS || 'http://localhost:8787,http://127.0.0.1:8787').split(',').map(s => s.trim());
const ALLOW_CLOUD = String(process.env.ALLOW_CLOUD || 'false') === 'true';

beacon.loadOrCreateKeys();

// Per-member capability profiles (#6): one Caps the gate evaluates, shared with
// the governed core, plus a registry that onboards each member on first auth.
const caps = new Caps();
const memberCaps = createMemberCaps({ caps });
// The governed loop, exposed to the local console (Ticket A2 over HTTP).
const gov = createGovernedCore({ caps });
// #4: orgs/teams + delegated RBAC, steward-managed.
const orgs = new Orgs();

// Hermes — the governed messenger (dashboard always-on; email/sms/voice/telegram
// when NOTIFY_CHANNELS + broker creds are set). The brain (what to send) is here
// and the gate; the channels are dumb pipes. The inbound Telegram bridge relays
// founder messages to the same conversational brain (effects stay at the gate).
const hermes = createHermes();
const tgBridge = createTelegramBridge();
// Fire-and-forget internal notification (steward-audience operational kinds are
// auto-class by policy). Never throws into a request path.
const fireNotify = (msg) => { hermes.send(msg).catch((e) => console.error('[hermes] notify failed:', e.message)); };
if (process.env.NOTIFY_TELEGRAM_FOUNDERS && !process.env.NOTIFY_TELEGRAM_WEBHOOK_SECRET) {
  console.warn('[hermes] telegram bridge has founders but no NOTIFY_TELEGRAM_WEBHOOK_SECRET — the webhook is identity-gated only (set the secret in prod).');
}
// Constant-time secret compare (matches auth.js discipline).
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// --- rate limiter — store-backed so it works ACROSS instances (#1/#6) -------
// MemoryStore by default (single-node, unchanged); RedisStore when REDIS_URL is
// set, sharing the limit cluster-wide. createStateStore is async; we resolve it
// at boot before listen().
let stateStore = new MemoryStore();
let rateLimiter = createRateLimiter(stateStore, { max: Number(process.env.RATE_MAX || 60) });
let quota = createQuota(stateStore);   // #6: per-identity, cluster-wide via the same store
let workflows = new Workflows({ store: stateStore });   // #2: durable, resumable, store-backed
let notifyPrefs = createNotifyPrefs(stateStore);        // #7: per-member channel prefs (store-backed)
async function initState() {
  stateStore = await createStateStore();
  rateLimiter = createRateLimiter(stateStore, { max: Number(process.env.RATE_MAX || 60) });
  quota = createQuota(stateStore);
  workflows = new Workflows({ store: stateStore });   // rebind to the resolved (possibly Redis) store
  notifyPrefs = createNotifyPrefs(stateStore);
  // #1: bind the shared store to the governed loop and keep the global kill switch
  // in sync across replicas (a kill on any instance halts this one within the poll
  // interval; the originating instance is instant). MemoryStore = same-process, no-op.
  gov.useStore(stateStore);
  await gov.syncHalt();
  const haltPoll = setInterval(() => { gov.syncHalt().catch(() => {}); }, Number(process.env.GOV_HALT_SYNC_MS || 2000));
  haltPoll.unref();
  if (process.env.REDIS_URL) console.log('[state] shared state store: redis (multi-instance); kill switch is cluster-wide');
}

function cors(origin, res) {
  // CORS guard: only echo an allow-listed origin. Never reflect arbitrary ones.
  if (origin && ALLOWED.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept-Language');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  metrics.inc('aigov_http_responses_total', { code }, 1, 'HTTP responses by status code');
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const ip = req.socket.remoteAddress || 'unknown';
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const origin = req.headers.origin;
  const locale = negotiate(req.headers['accept-language']);
  cors(origin, res);

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // --- Observability (#5) — unauthenticated, rate-limit-exempt for probes -----
  metrics.inc('aigov_http_requests_total', { method: req.method }, 1, 'HTTP requests by method');
  if (url.pathname === '/livez') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (url.pathname === '/readyz') {
    let ready = true, detail = 'ready';
    try { beacon.loadOrCreateKeys(); beacon.ledgerCount(); } catch (e) { ready = false; detail = 'not-ready: ' + e.message; }
    res.writeHead(ready ? 200 : 503, { 'Content-Type': 'text/plain' }); return res.end(detail);
  }
  if (url.pathname === '/metrics') {
    const out = metrics.render({
      aigov_ledger_entries: beacon.ledgerCount(),       // cheap line count (full verify is on /readyz, not the scrape hot path)
      aigov_loop_halted: gov.isHalted() ? 1 : 0,
      aigov_members_total: memberCaps.list().length,
      aigov_uptime_seconds: Math.floor(process.uptime()),
    });
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' }); return res.end(out);
  }

  // The Telegram webhook is exempt from the IP limiter: all its calls arrive from
  // a few Telegram egress IPs, so one shared bucket would 429 legitimate deliveries
  // and trigger the very retry-storm the 200-always handler avoids. It is protected
  // instead by the shared secret + the founder allow-list (unknown senders never
  // reach the model). Probes are likewise exempt above.
  if (url.pathname !== '/api/bridge/telegram' && !(await rateLimiter.hit(ip))) return send(res, 429, { error: 'rate-limited' });

  // Who is calling? (null if unauthenticated) — write endpoints check this.
  const id = auth.identityFromReq(req);
  // #6: onboard every authenticated caller into the capability dial (idempotent).
  if (id) memberCaps.onboard(id);
  // #6: per-identity quota on top of the IP limiter — stops one identity over-
  // consuming across hosts/sessions. Tiered (steward > member > anon), cluster-wide.
  if (id) { const qd = await quota.check(id); if (!qd.allowed) return send(res, 429, { error: 'quota-exceeded', tier: qd.tier, max: qd.max }); }
  const needAuth = (role) => { if (!auth.hasRole(id, role)) { send(res, id ? 403 : 401, { error: role === 'steward' ? 'steward-required' : 'auth-required' }); return true; } return false; };

  // --- AUTH (GitHub OAuth) ------------------------------------------------
  if (url.pathname === '/auth/login') {
    if (!auth.oauthConfigured()) return send(res, 503, { error: 'oauth-not-configured', hint: 'set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET' });
    const state = auth.newState();
    res.writeHead(302, { 'Set-Cookie': `aigov_oauth_state=${state}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600; Secure`, Location: auth.loginRedirectUrl(state) });
    return res.end();
  }
  if (url.pathname === '/auth/callback') {
    const code = url.searchParams.get('code'); const state = url.searchParams.get('state');
    if (!code || !state || !(req.headers.cookie || '').includes(`aigov_oauth_state=${state}`)) return send(res, 400, { error: 'bad-oauth-state' });
    try { const { token } = await auth.completeLogin(code); res.writeHead(302, { 'Set-Cookie': auth.sessionCookie(token), Location: '/console' }); return res.end(); }
    catch (e) { return send(res, 401, { error: e.message }); }
  }
  // --- AUTH (OIDC — provider-agnostic, Ticket 8) -------------------------
  if (url.pathname === '/auth/oidc/login') {
    if (!auth.oidcConfigured()) return send(res, 503, { error: 'oidc-not-configured', hint: 'set OIDC_ISSUER and OIDC_CLIENT_ID' });
    try {
      const state = auth.newState();
      const { verifier, challenge } = (await import('./core/oidc.js')).pkce();
      const nonce = (await import('./core/oidc.js')).newNonce();
      const location = await auth.oidcLoginRedirect({ state, nonce, codeChallenge: challenge });
      const cookieOpts = 'HttpOnly; Path=/; SameSite=Lax; Max-Age=600; Secure';
      res.writeHead(302, { Location: location, 'Set-Cookie': [
        `aigov_oidc_state=${state}; ${cookieOpts}`,
        `aigov_oidc_nonce=${nonce}; ${cookieOpts}`,
        `aigov_oidc_verifier=${verifier}; ${cookieOpts}`,
      ] });
      return res.end();
    } catch (e) { return send(res, 502, { error: 'oidc-discovery-failed', detail: e.message }); }
  }
  if (url.pathname === '/auth/oidc/callback') {
    const code = url.searchParams.get('code'); const state = url.searchParams.get('state');
    const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map((c) => { const i = c.indexOf('='); return [c.slice(0, i).trim(), c.slice(i + 1).trim()]; }));
    if (!code || !state || cookies.aigov_oidc_state !== state) return send(res, 400, { error: 'bad-oidc-state' });
    try {
      const { token } = await auth.completeOidcLogin(code, { codeVerifier: cookies.aigov_oidc_verifier, nonce: cookies.aigov_oidc_nonce });
      res.writeHead(302, { 'Set-Cookie': auth.sessionCookie(token), Location: '/console' });
      return res.end();
    } catch (e) { return send(res, 401, { error: e.message }); }
  }
  if (url.pathname === '/auth/me') {
    return send(res, 200, id ? { authenticated: true, login: id.id, role: id.role } : { authenticated: false, oauth: auth.oauthConfigured() });
  }
  if (url.pathname === '/auth/logout' && req.method === 'POST') {
    res.writeHead(200, { 'Set-Cookie': auth.clearCookie(), 'Content-Type': 'application/json' }); return res.end('{"ok":true}');
  }

  // --- STATUS -------------------------------------------------------------
  if (url.pathname === '/status') {
    const led = beacon.verifyLedger();
    return send(res, 200, {
      ok: true, name: 'aigovops-library-core', version: '0.1.0',
      message: t(locale, 'status.ok'),
      ledger: { entries: led.entries, valid: led.valid },
      kid: beacon.loadOrCreateKeys().kid,
      keys: beacon.keyring(),                 // #10: current + retired signing keys
      residency: residencyTag(),              // #10: declared data-residency region
      cloud: ALLOW_CLOUD ? 'opt-in available' : 'local-only',
      secrets: secretsPosture(),
      notify: notifyPosture({ channels: hermes.channels }),
      model: modelPosture(),
      frameworks: frameworks().length
    });
  }

  // --- PUBLIC KEY (so anyone can verify our receipts) ---------------------
  if (url.pathname === '/beacon/pubkey') {
    res.writeHead(200, { 'Content-Type': 'application/x-pem-file' });
    return res.end(beacon.publicKeyPem());
  }

  // --- FRONT DESK: ask ----------------------------------------------------
  if (url.pathname === '/api/ask' && req.method === 'POST') {
    const { question = '' } = await readBody(req);
    const m = member(req);
    const ans = await respondAsync({ prompt: question });
    // metadata-only receipt: store a hash of the question, never the question
    const receipt = beacon.emit({
      kind: 'prompt', actor: m.id, action: 'ask',
      model: ans.model, locale,
      contentHash: beacon.sha256(question)
    });
    return send(res, 200, {
      answer: ans.text, locale, cached: ans.cached,
      signed: { label: t(locale, 'answer.signed'), kid: receipt.kid, sig: receipt.sig.slice(0, 24) + '…', ts: receipt.record.ts }
    });
  }

  // --- READING ROOM: assess a hard problem --------------------------------
  if (url.pathname === '/api/assess' && req.method === 'POST') {
    const { problem = '' } = await readBody(req);
    const m = member(req);
    const result = policy.evaluate(problem);
    const receipt = beacon.emit({
      kind: 'artifact', actor: m.id, action: 'assess',
      gate: { id: 'assessment', framework: result.gates.map(g => g.framework).join('+'), act: 'get', decision: 'no' },
      locale, contentHash: beacon.sha256(problem)
    });
    return send(res, 200, {
      locale,
      labels: { risk: t(locale, 'assess.risk'), gates: t(locale, 'assess.gates'), path: t(locale, 'path.to.yes') },
      ...result,
      signed: { kid: receipt.kid, ts: receipt.record.ts }
    });
  }

  // --- VERIFY the ledger --------------------------------------------------
  // Full walk by default; ?fast=1 uses the latest signed checkpoint (#9) to verify
  // only entries since the anchor — O(n - checkpoint) for a large ledger.
  if (url.pathname === '/api/verify') {
    return send(res, 200, url.searchParams.get('fast') === '1' ? verifyFromCheckpoint() : beacon.verifyLedger());
  }
  // --- CHECKPOINT (#9 — steward anchors the ledger) -----------------------
  if (url.pathname === '/api/checkpoint' && req.method === 'POST') {
    if (needAuth('steward')) return;
    return send(res, 200, createCheckpoint());
  }
  // --- DSAR (#10 — data-subject access; signed, metadata-only) ------------
  // A member gets their OWN record (self-service); a steward may request any
  // subject via ?subject=. The bundle is Beacon-signed so it's verifiable offline.
  if (url.pathname === '/api/dsar' && req.method === 'GET') {
    if (needAuth('member')) return;
    const subject = (auth.hasRole(id, 'steward') && url.searchParams.get('subject')) || id.id;
    return send(res, 200, buildDsar(subject));
  }
  // --- KEY ROTATION (#10 — steward rotates the Beacon signing key) --------
  if (url.pathname === '/api/keys/rotate' && req.method === 'POST') {
    if (needAuth('steward')) return;
    try { return send(res, 200, beacon.rotateKeys()); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }
  // --- SEARCH (#8 — role-scoped index over frameworks/skills/members/receipts) ---
  if (url.pathname === '/api/search' && req.method === 'GET') {
    const q = url.searchParams.get('q') || '';
    const typeParam = url.searchParams.get('type');
    const types = typeParam ? typeParam.split(',').map((s) => s.trim()).filter(Boolean) : null;
    const who = id || { role: 'member', id: 'member:anon' };
    const corpus = {
      frameworks: frameworks(),
      skills: gov.skills.list(),
      members: who.role === 'steward' ? memberCaps.list() : [],   // member directory is steward-only
      receipts: gov.oversight(who).view(),                         // already role-scoped
    };
    return send(res, 200, { q, results: searchCorpus(corpus, q, { types, limit: 25 }) });
  }

  // --- AGENT proposal demo (propose-not-execute) --------------------------
  if (url.pathname === '/api/propose' && req.method === 'POST') {
    const { intent = '' } = await readBody(req);
    return send(res, 200, propose(intent));
  }

  // --- SKILLS (Ticket A1 over HTTP) --------------------------------------
  if (url.pathname === '/api/skills' && req.method === 'GET') {
    return send(res, 200, { skills: gov.skills.list() });
  }
  if (url.pathname === '/api/skills/run' && req.method === 'POST') {
    if (needAuth('member')) return;
    const { name, input } = await readBody(req);
    try { return send(res, 200, gov.skills.run(name, { input })); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }

  // --- AGENTS (Phase 2 — front desk, propose-only) ----------------------
  if (url.pathname === '/api/agents' && req.method === 'GET') {
    return send(res, 200, { agents: listAgents() });
  }
  if (url.pathname === '/api/agent' && req.method === 'POST') {
    if (needAuth('member')) return;
    const { intent = '' } = await readBody(req);
    try {
      const out = await agentDispatch(intent);
      // Propose-only: an effectful proposal is queued for a steward to approve.
      if (out.proposal && out.proposal.requiresHumanGate) {
        out.pendingId = gov.propose(intent, { actor: id.id }).pendingId;
        // Hermes nudges the stewards that a proposal is waiting (auto-class).
        fireNotify({ kind: 'gate-pending', severity: 'warn', audience: 'stewards', summary: `Proposal pending approval (${out.pendingId})`, body: out.proposal.summary });
      }
      return send(res, 200, out);
    } catch (e) { return send(res, 400, { error: e.message }); }
  }

  // --- GOVERNED LOOP (Ticket A2 over HTTP) -------------------------------
  if (url.pathname === '/api/gov/propose' && req.method === 'POST') {
    if (needAuth('member')) return;
    const { intent = '' } = await readBody(req);
    try { return send(res, 200, gov.propose(intent, { actor: id.id })); }
    catch (e) { return send(res, 400, { error: e.message }); }   // e.g. fails closed while halted
  }
  // Conversational/agentic plan (#6): the model drafts a plan + queues a proposal.
  if (url.pathname === '/api/gov/plan' && req.method === 'POST') {
    if (needAuth('member')) return;
    const { message = '' } = await readBody(req);
    try { return send(res, 200, await gov.plan(message, { actor: id.id })); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/gov/pending' && req.method === 'GET') {
    if (needAuth('steward')) return;   // the approval queue is a steward view
    // #3: routing/SLA filters — ?assignee=<id>&overdue=1, sorted soonest-due first.
    const assignee = url.searchParams.get('assignee');
    const overdue = url.searchParams.get('overdue') === '1';
    return send(res, 200, { pending: gov.pending({ assignee: assignee ?? undefined, overdue }) });
  }
  // #3: assign a pending proposal to a reviewer (steward).
  if (url.pathname === '/api/gov/assign' && req.method === 'POST') {
    if (needAuth('steward')) return;
    const { pendingId, assignee } = await readBody(req);
    try { return send(res, 200, gov.assign(pendingId, assignee)); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }
  // #3: BULK queue actions — assign many, or deny many (deny brokers nothing, so
  // it's safe in bulk; approve stays per-item because each needs its own scope).
  if (url.pathname === '/api/gov/bulk' && req.method === 'POST') {
    if (needAuth('steward')) return;
    const { action, pendingIds = [], assignee } = await readBody(req);
    if (!['assign', 'deny'].includes(action)) return send(res, 400, { error: "bulk action must be 'assign' or 'deny'" });
    const results = [];
    for (const pid of pendingIds) {
      try {
        if (action === 'assign') { gov.assign(pid, assignee); results.push({ pendingId: pid, ok: true }); }
        else { gov.decide(pid, 'deny', { decidedBy: id.id }); results.push({ pendingId: pid, ok: true }); }
      } catch (e) { results.push({ pendingId: pid, ok: false, error: e.message }); }
    }
    return send(res, 200, { action, results, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
  }
  if (url.pathname === '/api/gov/decide' && req.method === 'POST') {
    if (needAuth('steward')) return;   // the human gate is a steward's call
    const { pendingId, decision, scope, ttlSeconds, requiredLevel, spend } = await readBody(req);
    try { return send(res, 200, gov.decide(pendingId, decision, { scope, ttlSeconds, cost: { requiredLevel, spend }, decidedBy: id.id })); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/gov/run' && req.method === 'POST') {
    if (needAuth('member')) return;
    const { token, code, allowedEgress } = await readBody(req);
    try { return send(res, 200, await gov.runTool({ token, code, allowedEgress })); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }
  // Vetted tool registry (#3)
  if (url.pathname === '/api/gov/tools' && req.method === 'GET') {
    return send(res, 200, { tools: gov.tools.list() });
  }
  if (url.pathname === '/api/gov/tool-run' && req.method === 'POST') {
    if (needAuth('member')) return;
    const { token, tool, input } = await readBody(req);
    try { return send(res, 200, await gov.runRegisteredTool({ token, tool, input })); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }

  // --- ORGS / TEAMS (#4 — RBAC hierarchy, steward-managed) ---------------
  if (url.pathname === '/api/orgs' && req.method === 'GET') {
    if (needAuth('steward')) return;
    return send(res, 200, { orgs: orgs.list() });
  }
  if (url.pathname === '/api/orgs' && req.method === 'POST') {
    if (needAuth('steward')) return;
    const { id: orgId, name, steward } = await readBody(req);
    try { return send(res, 200, orgs.createOrg(orgId, name, { steward })); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/orgs/view' && req.method === 'GET') {
    if (needAuth('steward')) return;
    try { return send(res, 200, orgs.get(url.searchParams.get('id'))); }
    catch (e) { return send(res, 404, { error: e.message }); }
  }
  if (url.pathname === '/api/orgs/member' && req.method === 'POST') {
    if (needAuth('steward')) return;
    const { orgId, memberId, roles } = await readBody(req);
    try { return send(res, 200, orgs.setMember(orgId, memberId, { roles })); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/orgs/team' && req.method === 'POST') {
    if (needAuth('steward')) return;
    const { orgId, teamId, name, lead } = await readBody(req);
    try { return send(res, 200, orgs.createTeam(orgId, teamId, name, { lead })); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }

  // --- WORKFLOWS (#2 — durable multi-step, SLA + escalation, resumable) ---
  if (url.pathname === '/api/workflows/define' && req.method === 'POST') {
    if (needAuth('steward')) return;            // defining a workflow is a steward act
    const { defId, steps } = await readBody(req);
    try { return send(res, 200, await workflows.define(defId, steps)); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/workflows/start' && req.method === 'POST') {
    if (needAuth('member')) return;             // a member can start an instance
    const { defId, data } = await readBody(req);
    try { return send(res, 200, await workflows.start(defId, { actor: id.id, data })); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/workflows' && req.method === 'GET') {
    if (needAuth('steward')) return;
    return send(res, 200, { workflows: await workflows.list({ state: url.searchParams.get('state') || undefined, overdue: url.searchParams.get('overdue') === '1' }) });
  }
  if (url.pathname === '/api/workflows/view' && req.method === 'GET') {
    if (needAuth('steward')) return;
    try { return send(res, 200, await workflows.get(url.searchParams.get('id'))); }
    catch (e) { return send(res, 404, { error: e.message }); }
  }
  if (url.pathname === '/api/workflows/advance' && req.method === 'POST') {
    if (needAuth('steward')) return;            // advancing past an approval step is the human gate
    const { id: wfId, decision, note } = await readBody(req);
    try { return send(res, 200, await workflows.advance(wfId, { decision, note, actor: id.id })); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/workflows/assign' && req.method === 'POST') {
    if (needAuth('steward')) return;
    const { id: wfId, stepId, assignee } = await readBody(req);
    try { return send(res, 200, await workflows.assign(wfId, stepId, assignee)); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/workflows/escalate' && req.method === 'POST') {
    if (needAuth('steward')) return;
    const { id: wfId, to } = await readBody(req);
    try { return send(res, 200, await workflows.escalate(wfId, { to, actor: id.id })); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }

  // --- CAPABILITY DIAL (#6 — per-member profiles, steward-managed) -------
  if (url.pathname === '/api/caps' && req.method === 'GET') {
    if (needAuth('steward')) return;
    return send(res, 200, { members: memberCaps.list() });
  }
  if (url.pathname === '/api/caps' && req.method === 'POST') {
    if (needAuth('steward')) return;     // only a steward turns the dial
    const { id: memberId, level } = await readBody(req);
    try { return send(res, 200, { ok: true, member: memberCaps.setLevel(memberId, level) }); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }

  // --- OVERSIGHT (Ticket 6 — role-scoped ledger view) --------------------
  // Scope comes from the AUTHENTICATED identity, not a client-supplied param.
  if (url.pathname === '/api/oversight' && req.method === 'GET') {
    const who = id || { role: 'member', id: 'member:anon' };
    return send(res, 200, { role: who.role, scope: who.role === 'steward' ? 'all' : 'own', halted: gov.isHalted(), receipts: gov.oversight(who).view() });
  }

  // --- OVERSIGHT KILL SWITCH (Ticket 6 — steward-only, signed) -----------
  // The global kill switch halts the in-flight governed loop (propose/decide/
  // runTool fail closed) and emits its own signed receipt. Steward-only, by the
  // authenticated identity — never a client-supplied role.
  if (url.pathname === '/api/oversight/kill' && req.method === 'POST') {
    if (needAuth('steward')) return;
    try { gov.oversight(id).kill(); fireNotify({ kind: 'system', severity: 'critical', audience: 'stewards', summary: 'Global kill switch ENGAGED — governed loop halted', body: `by ${id.id}` }); return send(res, 200, { halted: true }); }
    catch (e) { return send(res, 403, { error: e.message }); }
  }
  if (url.pathname === '/api/oversight/resume' && req.method === 'POST') {
    if (needAuth('steward')) return;     // only a steward can lift the halt
    gov.resume();
    return send(res, 200, { halted: false });
  }

  // --- OVERSIGHT LIVE STREAM (Ticket 6 — SSE, role-scoped) ---------------
  if (url.pathname === '/api/oversight/stream') {
    const who = id || { role: 'member', id: 'member:anon' };
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: hello\ndata: ${JSON.stringify({ role: who.role, canKill: who.role === 'steward', halted: gov.isHalted() })}\n\n`);
    let last = -1, lastHalt = null;
    const tick = () => {
      const view = gov.oversight(who).view();
      const halted = gov.isHalted();
      if (view.length !== last || halted !== lastHalt) {
        last = view.length; lastHalt = halted;
        res.write(`event: ledger\ndata: ${JSON.stringify({ count: view.length, halted, latest: view.slice(-6).map((r) => ({ kind: r.kind, action: r.action, actor: r.actor, ts: r.ts })) })}\n\n`);
      }
    };
    tick();
    const iv = setInterval(tick, 2000);
    req.on('close', () => clearInterval(iv));
    return; // keep the connection open
  }

  // --- HERMES MESSENGER (Phase 7 — governed multi-channel delivery) ------
  // Request a notification. A steward sending IS the approval; auto-class kinds
  // (steward-audience operational) send directly; member/external-facing goes to
  // the gate. The body is delivered, never logged — receipts are metadata-only.
  if (url.pathname === '/api/notify' && req.method === 'POST') {
    if (needAuth('member')) return;
    const { kind = 'message', severity = 'info', summary = '', body = '', to = '', audience = 'stewards', channels } = await readBody(req);
    try {
      const decision = notifyDecision({ kind, audience });
      if (auth.hasRole(id, 'steward') || decision === 'auto') {
        const r = await hermes.send({ kind, severity, summary, body, to, audience }, { channels: Array.isArray(channels) ? channels : null, actor: id.id });
        return send(res, 200, { sent: !r.deduped, ...r });
      }
      const p = gov.propose(`notify[${kind}/${audience}]: ${summary}`.slice(0, 200), { actor: id.id });
      fireNotify({ kind: 'gate-pending', severity: 'warn', audience: 'stewards', summary: `Notification pending approval: ${summary}`.slice(0, 180) });
      return send(res, 200, { gated: true, pendingId: p.pendingId });
    } catch (e) { return send(res, 400, { error: e.message }); }
  }
  // Channel posture + health + dead-letters (steward management view).
  if (url.pathname === '/api/notify/channels' && req.method === 'GET') {
    if (needAuth('steward')) return;
    return send(res, 200, { channels: notifyPosture({ channels: hermes.channels }), health: await hermes.health(), deadLetters: hermes.deadLetters(), policy: { autosend: autosendKinds() }, bridge: { telegram: tgBridge.configured(), founders: tgBridge.founders.size } });
  }
  // Recent notifications (metadata + summary), role-scoped like oversight.
  if (url.pathname === '/api/notify/feed' && req.method === 'GET') {
    const who = id || { role: 'member', id: 'member:anon' };
    const all = hermes.feed({ limit: 100 });
    const scoped = who.role === 'steward' ? all : all.filter((e) => e.audience === 'members' || e.audience === who.id);
    return send(res, 200, { role: who.role, feed: scoped });
  }
  // Live notification stream (SSE), role-scoped.
  if (url.pathname === '/api/notify/stream') {
    const who = id || { role: 'member', id: 'member:anon' };
    const canSee = (e) => who.role === 'steward' || e.audience === 'members' || e.audience === who.id;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: hello\ndata: ${JSON.stringify({ role: who.role })}\n\n`);
    const unsub = hermes.subscribe((entry) => { if (canSee(entry)) res.write(`event: notify\ndata: ${JSON.stringify(entry)}\n\n`); });
    const hb = setInterval(() => res.write(': hb\n\n'), 25000);
    req.on('close', () => { unsub(); clearInterval(hb); });
    return;
  }
  // #7: per-member channel preferences (self-service). Honored when Hermes sends
  // to a specific member (channel filtering + muted kinds).
  if (url.pathname === '/api/notify/prefs' && req.method === 'GET') {
    if (needAuth('member')) return;
    return send(res, 200, await notifyPrefs.get(id.id));
  }
  if (url.pathname === '/api/notify/prefs' && req.method === 'POST') {
    if (needAuth('member')) return;
    const { channels, mutedKinds, digest } = await readBody(req);
    try { return send(res, 200, await notifyPrefs.set(id.id, { channels, mutedKinds, digest })); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }
  // Steward: send a test notification through chosen channels to verify wiring.
  if (url.pathname === '/api/notify/test' && req.method === 'POST') {
    if (needAuth('steward')) return;
    const { channels, to } = await readBody(req);
    try {
      const r = await hermes.send({ kind: 'system', severity: 'info', audience: 'stewards', summary: 'Hermes test notification', body: 'If you received this, the channel is wired.', to }, { channels: Array.isArray(channels) ? channels : null, actor: id.id });
      return send(res, 200, { test: true, ...r });
    } catch (e) { return send(res, 400, { error: e.message }); }
  }
  // Inbound founder bridge (Telegram webhook). Public endpoint; security is the
  // founder allow-list inside the bridge + an optional shared webhook secret.
  // Always answers 200 so Telegram does not retry-storm on a handled rejection.
  if (url.pathname === '/api/bridge/telegram' && req.method === 'POST') {
    const secret = process.env.NOTIFY_TELEGRAM_WEBHOOK_SECRET;
    if (secret && !safeEqual(req.headers['x-telegram-bot-api-secret-token'] || '', secret)) return send(res, 403, { error: 'bad-webhook-secret' });
    const update = await readBody(req);
    try { return send(res, 200, { ok: true, ...(await tgBridge.handleUpdate(update)) }); }
    catch (e) { return send(res, 200, { ok: false, error: e.message }); }
  }
  // Management page for the messenger.
  if (url.pathname === '/messaging' || url.pathname === '/messaging.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(here, '..', 'public', 'messaging.html'), 'utf8'));
  }

  // --- CONSOLE (interactive local control room) --------------------------
  if (url.pathname === '/console') {
    const html = fs.readFileSync(path.join(here, '..', 'public', 'console.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // --- EMBEDDABLE WIDGET (Phase 4 channel) -------------------------------
  if (url.pathname === '/widget.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(here, '..', 'public', 'widget.js'), 'utf8'));
  }
  if (url.pathname === '/widget' || url.pathname === '/widget.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(here, '..', 'public', 'widget.html'), 'utf8'));
  }

  // --- FRONT DESK room (static) ------------------------------------------
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const html = fs.readFileSync(path.join(here, '..', 'public', 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // --- DESKS: registry, cost, members, curate, audit ---------------------
  // The five operations desks, all behind one router (desks.js). ctx is built
  // once from helpers already defined above; secrets never pass through here.
  const deskCtx = {
    json:           (code, obj) => send(res, code, obj),
    identity:       id ? { login: id.id, role: id.role } : null,
    isSteward:      auth.hasRole(id, 'steward'),
    requireSteward: () => !needAuth('steward'),
    ledgerAppend:   (e) => beacon.emit({
                      kind: e.kind || 'desk',
                      actor: e.actor || (id && id.id) || 'system',
                      action: e.op || e.action || 'write',
                      contentHash: e.hash || beacon.sha256(`${e.kind || 'desk'}:${e.id || ''}`)
                    }),
    ledgerEntries:  () => gov.oversight({ role: 'steward', id: 'system' }).view(),
    verify:         () => beacon.verifyLedger()
  };
  if (routeDesk(url.pathname, req, res, deskCtx)) return;

  send(res, 404, { error: 'not-found' });
});

initState().catch((e) => console.error('[state] init failed, using in-memory store:', e.message)).finally(() => {
  server.listen(PORT, () => {
    console.log(`AiGovOps Library core listening on http://localhost:${PORT}`);
    console.log(`  kid=${beacon.loadOrCreateKeys().kid}  cloud=${ALLOW_CLOUD ? 'opt-in' : 'local-only'}  origins=${ALLOWED.join(', ')}`);
  });
});
