// test/server.test.mjs
// Smoke-test the HTTP surface (Ticket A1/A2 over HTTP + the console): spawn the
// server and drive skills + the governed loop end to end.

import { test } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '..', 'src', 'server.js');
const PORT = 8793;
const BASE = `http://127.0.0.1:${PORT}`;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-srv-'));
const STORE = path.join(TMP, 'secrets.json');
fs.writeFileSync(STORE, JSON.stringify({ owner: 'lab', scopes: { 'github-deploy': 'LOCAL-DEV-VALUE' }, rotated: {} }));

const TOKEN = 'test-ops';
const J = async (m, p, b, tok) => {
  const headers = {};
  if (b) headers['content-type'] = 'application/json';
  if (tok) headers.authorization = `Bearer ${tok}`;
  const r = await fetch(BASE + p, { method: m, headers, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
};

test('HTTP: auth gate + governed loop + console', async () => {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(PORT), KEYS_DIR: path.join(TMP, 'keys'), LEDGER_DIR: path.join(TMP, 'ledger'), SECRETS_FILE: STORE, STEWARD_TOKEN: TOKEN, OLLAMA_TIMEOUT_MS: '300' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  try {
    for (let i = 0; i < 40; i++) {
      try { const s = await J('GET', '/status'); if (s.status === 200) break; } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.equal((await J('GET', '/status')).body.ok, true);

    // observability (#5): probes + metrics, unauthenticated
    assert.equal((await J('GET', '/livez')).status, 200);
    assert.equal((await J('GET', '/readyz')).status, 200);
    const m = await J('GET', '/metrics');
    assert.equal(m.status, 200);
    assert.match(m.body, /aigov_http_requests_total/);
    assert.match(m.body, /aigov_ledger_entries/);

    // the door is closed: a write WITHOUT auth is rejected
    const noauth = await J('POST', '/api/gov/decide', { pendingId: 'x', decision: 'approve' });
    assert.equal(noauth.status, 401, 'unauthenticated write must be 401');

    // reads stay open; skills list works
    assert.ok((await J('GET', '/api/skills')).body.skills.some((s) => s.name === 'framework-map' && s.runnable));

    // authenticated (steward) full loop
    const sk = await J('POST', '/api/skills/run', { name: 'framework-map', input: 'an AI tool that screens job candidates' }, TOKEN);
    assert.ok(sk.body.result.gates.length > 0);

    const prop = await J('POST', '/api/gov/propose', { intent: 'deploy the site' }, TOKEN);
    assert.equal(prop.body.requiresHumanGate, true);

    // agentic chat (#6): the model drafts a plan + queues a gated proposal
    const planned = await J('POST', '/api/gov/plan', { message: 'publish the Q3 update' }, TOKEN);
    assert.ok(planned.body.plan && planned.body.pendingId, 'plan returns a drafted plan + a pending proposal');
    assert.equal(planned.body.requiresHumanGate, true);

    const dec = await J('POST', '/api/gov/decide', { pendingId: prop.body.pendingId, decision: 'approve', scope: 'github-deploy', requiredLevel: 'act' }, TOKEN);
    assert.ok(dec.body.grant && dec.body.grant.token, 'approval brokers a token');

    const run = await J('POST', '/api/gov/run', { token: dec.body.grant.token, code: 'export default async () => "built";' }, TOKEN);
    assert.equal(run.body.ok, true);

    // approval queue: a fresh proposal awaits a steward
    const pend = await J('POST', '/api/gov/propose', { intent: 'deploy a thing' }, TOKEN);
    const q = await J('GET', '/api/gov/pending', null, TOKEN);
    assert.ok(q.body.pending.some((p) => p.pendingId === pend.body.pendingId), 'proposal is in the approval queue');

    // SSE oversight stream emits an opening event
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 2000); let chunk = '';
    try { const sr = await fetch(BASE + '/api/oversight/stream', { signal: ctrl.signal, headers: { authorization: `Bearer ${TOKEN}` } }); const { value } = await sr.body.getReader().read(); chunk = Buffer.from(value).toString(); } catch {} finally { clearTimeout(to); }
    assert.match(chunk, /event: (hello|ledger)/);

    const ov = await J('GET', '/api/oversight', null, TOKEN);   // role comes from the authenticated identity
    assert.equal(ov.body.role, 'steward');
    assert.ok(ov.body.receipts.length >= 3);

    // front desk: an agent routes + proposes (propose-only)
    const ag = await J('POST', '/api/agent', { intent: 'what regulations apply to my hiring AI?' }, TOKEN);
    assert.equal(ag.body.agent, 'lantern');
    assert.ok(ag.body.proposal, 'agent returns a proposal');

    assert.match((await J('GET', '/console')).body, /Control Room/);

    // embeddable widget (Phase 4) — public, no auth
    assert.match((await J('GET', '/widget.js')).body, /Ask the Library/);
    assert.match((await J('GET', '/widget')).body, /widget\.js/);

    // --- CAPABILITY DIAL (#6) — steward lists + turns member profiles ---------
    assert.equal((await J('GET', '/api/caps')).status, 401, 'caps list needs steward auth');
    const capsList = await J('GET', '/api/caps', null, TOKEN);
    assert.ok(Array.isArray(capsList.body.members), 'steward sees the member capability profiles');
    const setDial = await J('POST', '/api/caps', { id: capsList.body.members[0]?.id || 'ops:token', level: 'act' }, TOKEN);
    assert.equal(setDial.body.ok, true); assert.equal(setDial.body.member.level, 'act');
    assert.equal((await J('POST', '/api/caps', { id: 'nobody', level: 'act' }, TOKEN)).status, 400, 'unknown member fails closed');

    // --- KILL SWITCH (Ticket 6) — steward-only, halts the loop, then resume ---
    // unauthenticated kill is refused
    assert.equal((await J('POST', '/api/oversight/kill')).status, 401, 'kill needs steward auth');
    // a steward arms it: the loop halts and the oversight view reflects it
    const killed = await J('POST', '/api/oversight/kill', null, TOKEN);
    assert.equal(killed.status, 200); assert.equal(killed.body.halted, true);
    assert.equal((await J('GET', '/api/oversight', null, TOKEN)).body.halted, true);
    // while halted, a new proposal fails closed
    const blocked = await J('POST', '/api/gov/propose', { intent: 'deploy while halted' }, TOKEN);
    assert.equal(blocked.status, 400, 'propose is refused while halted');
    // resume lifts the halt and the loop works again
    const resumed = await J('POST', '/api/oversight/resume', null, TOKEN);
    assert.equal(resumed.body.halted, false);
    assert.equal((await J('POST', '/api/gov/propose', { intent: 'deploy after resume' }, TOKEN)).status, 200);
  } finally {
    child.kill();
  }
});
