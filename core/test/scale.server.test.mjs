// test/scale.server.test.mjs
// The Phase B HTTP surface: search (#8), checkpoint + fast verify (#9) end to end.

import { test } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '..', 'src', 'server.js');
const PORT = 8796;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-scale-srv-'));
const TOKEN = 'test-ops';

const J = async (m, p, b, tok) => {
  const headers = {};
  if (b) headers['content-type'] = 'application/json';
  if (tok) headers.authorization = `Bearer ${tok}`;
  const r = await fetch(BASE + p, { method: m, headers, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
};

test('HTTP: search + checkpoint + fast verify', async () => {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(PORT), KEYS_DIR: path.join(TMP, 'keys'), LEDGER_DIR: path.join(TMP, 'ledger'), STEWARD_TOKEN: TOKEN, OLLAMA_TIMEOUT_MS: '300' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  try {
    for (let i = 0; i < 40; i++) { try { if ((await J('GET', '/status')).status === 200) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }

    // make a couple of ledger entries
    await J('POST', '/api/ask', { question: 'does the EU AI Act apply to hiring?' });

    // #8 search — frameworks are always indexed; role-scoped corpus
    const s = await J('GET', '/api/search?q=framework');
    assert.equal(s.status, 200);
    assert.ok(Array.isArray(s.body.results) && s.body.results.length > 0, 'search returns results');

    // #9 checkpoint — steward-gated
    assert.equal((await J('POST', '/api/checkpoint')).status, 401, 'checkpoint needs a steward');
    const cp = await J('POST', '/api/checkpoint', null, TOKEN);
    assert.equal(cp.status, 200);
    assert.ok(cp.body.created || cp.body.reason, 'checkpoint created or explained');

    // #9 fast verify uses the anchor and is valid
    const v = await J('GET', '/api/verify?fast=1');
    assert.equal(v.status, 200);
    assert.equal(v.body.valid, true);
    assert.ok('verifiedFrom' in v.body, 'fast verify reports the anchor it verified from');

    // #4 orgs/teams — steward-gated
    assert.equal((await J('POST', '/api/orgs', { id: 'acme', name: 'Acme' })).status, 401);
    assert.equal((await J('POST', '/api/orgs', { id: 'acme', name: 'Acme', steward: 'oidc:ken' }, TOKEN)).status, 200);
    assert.ok((await J('GET', '/api/orgs/view?id=acme', null, TOKEN)).body.members.some((m) => m.id === 'oidc:ken'));

    // #2 workflow — define → start → advance → completed
    assert.equal((await J('POST', '/api/workflows/define', { defId: 'rev', steps: [{ id: 's1', requiresApproval: false }, { id: 's2' }] }, TOKEN)).status, 200);
    const started = await J('POST', '/api/workflows/start', { defId: 'rev' }, TOKEN);
    assert.equal(started.body.state, 'running');
    const wfId = started.body.id;
    await J('POST', '/api/workflows/advance', { id: wfId, decision: 'approve' }, TOKEN);
    const done = await J('POST', '/api/workflows/advance', { id: wfId, decision: 'approve' }, TOKEN);
    assert.equal(done.body.state, 'completed');
    assert.ok((await J('GET', '/api/workflows', null, TOKEN)).body.workflows.some((w) => w.id === wfId));
  } finally {
    child.kill('SIGKILL');
  }
});
