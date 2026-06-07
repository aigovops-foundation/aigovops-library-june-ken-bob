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
import { respond } from './core/router.js';
import { member } from './core/identity.js';
import { propose } from './core/agent.js';
import { createGovernedCore } from './core/govapi.js';
import { negotiate, t } from './core/i18n.js';

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
    const ans = respond({ prompt: question, allowCloud: ALLOW_CLOUD });
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
    const { name, input } = await readBody(req);
    try { return send(res, 200, gov.skills.run(name, { input })); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }

  // --- GOVERNED LOOP (Ticket A2 over HTTP) -------------------------------
  if (url.pathname === '/api/gov/propose' && req.method === 'POST') {
    const { intent = '' } = await readBody(req);
    return send(res, 200, gov.propose(intent, { actor: member(req).id }));
  }
  if (url.pathname === '/api/gov/decide' && req.method === 'POST') {
    const { pendingId, decision, scope, ttlSeconds, requiredLevel, spend } = await readBody(req);
    try { return send(res, 200, gov.decide(pendingId, decision, { scope, ttlSeconds, cost: { requiredLevel, spend } })); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/gov/run' && req.method === 'POST') {
    const { token, code, allowedEgress } = await readBody(req);
    try { return send(res, 200, await gov.runTool({ token, code, allowedEgress })); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }

  // --- OVERSIGHT (Ticket 6 — role-scoped ledger view) --------------------
  if (url.pathname === '/api/oversight' && req.method === 'GET') {
    const role = url.searchParams.get('role') || 'member';
    const id = url.searchParams.get('id') || 'member:anon';
    return send(res, 200, { role, scope: role === 'steward' ? 'all' : 'own', receipts: gov.oversight({ role, id }).view() });
  }

  // --- CONSOLE (interactive local control room) --------------------------
  if (url.pathname === '/console') {
    const html = fs.readFileSync(path.join(here, '..', 'public', 'console.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // --- FRONT DESK room (static) ------------------------------------------
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const html = fs.readFileSync(path.join(here, '..', 'public', 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  send(res, 404, { error: 'not-found' });
});

server.listen(PORT, () => {
  console.log(`AiGovOps Library core listening on http://localhost:${PORT}`);
  console.log(`  kid=${beacon.loadOrCreateKeys().kid}  cloud=${ALLOW_CLOUD ? 'opt-in' : 'local-only'}  origins=${ALLOWED.join(', ')}`);
});
