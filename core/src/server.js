// src/server.js
// API GATEWAY — the one front door to the governed core.
// Dependency-free (Node built-in http). Enforces: CORS allow-list, basic
// rate-limit, locale negotiation, and "no keys in any client". Every meaningful
// action emits a metadata-only, Ed25519-signed Beacon receipt.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as beacon from './core/beacon.js';
import * as policy from './core/policy.js';
import { frameworks } from './core/lantern.js';
import { respondAsync } from './core/router.js';
import { member } from './core/identity.js';
import { propose } from './core/agent.js';
import { createGovernedCore } from './core/govapi.js';
import { dispatch as agentDispatch, listAgents } from './core/agents.js';
import * as auth from './core/auth.js';
import { negotiate, t } from './core/i18n.js';
import { routeDesk } from './api/desks.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const ALLOWED = (process.env.ALLOWED_ORIGINS || 'http://localhost:8787,http://127.0.0.1:8787').split(',').map(s => s.trim());
const ALLOW_CLOUD = String(process.env.ALLOW_CLOUD || 'false') === 'true';

beacon.loadOrCreateKeys();

// The governed loop, exposed to the local console (Ticket A2 over HTTP).
const gov = createGovernedCore();

// --- tiny rate limiter (per-IP token bucket) --------------------------------
const buckets = new Map();
function rateOk(ip, max = 60, windowMs = 60_000) {
  const now = Date.now();
  const b = buckets.get(ip) || { n: 0, reset: now + windowMs };
  if (now > b.reset) { b.n = 0; b.reset = now + windowMs; }
  b.n++; buckets.set(ip, b);
  return b.n <= max;
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
  if (!rateOk(ip)) return send(res, 429, { error: 'rate-limited' });

  // Who is calling? (null if unauthenticated) — write endpoints check this.
  const id = auth.identityFromReq(req);
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
      cloud: ALLOW_CLOUD ? 'opt-in available' : 'local-only',
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
  if (url.pathname === '/api/verify') {
    return send(res, 200, beacon.verifyLedger());
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
      if (out.proposal && out.proposal.requiresHumanGate) out.pendingId = gov.propose(intent, { actor: id.id }).pendingId;
      return send(res, 200, out);
    } catch (e) { return send(res, 400, { error: e.message }); }
  }

  // --- GOVERNED LOOP (Ticket A2 over HTTP) -------------------------------
  if (url.pathname === '/api/gov/propose' && req.method === 'POST') {
    if (needAuth('member')) return;
    const { intent = '' } = await readBody(req);
    return send(res, 200, gov.propose(intent, { actor: id.id }));
  }
  if (url.pathname === '/api/gov/pending' && req.method === 'GET') {
    if (needAuth('steward')) return;   // the approval queue is a steward view
    return send(res, 200, { pending: gov.pending() });
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

  // --- OVERSIGHT (Ticket 6 — role-scoped ledger view) --------------------
  // Scope comes from the AUTHENTICATED identity, not a client-supplied param.
  if (url.pathname === '/api/oversight' && req.method === 'GET') {
    const who = id || { role: 'member', id: 'member:anon' };
    return send(res, 200, { role: who.role, scope: who.role === 'steward' ? 'all' : 'own', receipts: gov.oversight(who).view() });
  }

  // --- OVERSIGHT LIVE STREAM (Ticket 6 — SSE, role-scoped) ---------------
  if (url.pathname === '/api/oversight/stream') {
    const who = id || { role: 'member', id: 'member:anon' };
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: hello\ndata: ${JSON.stringify({ role: who.role })}\n\n`);
    let last = -1;
    const tick = () => {
      const view = gov.oversight(who).view();
      if (view.length !== last) {
        last = view.length;
        res.write(`event: ledger\ndata: ${JSON.stringify({ count: view.length, latest: view.slice(-6).map((r) => ({ kind: r.kind, action: r.action, actor: r.actor, ts: r.ts })) })}\n\n`);
      }
    };
    tick();
    const iv = setInterval(tick, 2000);
    req.on('close', () => clearInterval(iv));
    return; // keep the connection open
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

server.listen(PORT, () => {
  console.log(`AiGovOps Library core listening on http://localhost:${PORT}`);
  console.log(`  kid=${beacon.loadOrCreateKeys().kid}  cloud=${ALLOW_CLOUD ? 'opt-in' : 'local-only'}  origins=${ALLOWED.join(', ')}`);
});
