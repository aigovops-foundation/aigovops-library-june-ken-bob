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

const J = async (m, p, b) => {
  const r = await fetch(BASE + p, b ? { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } : { method: m });
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
};

test('HTTP: skills + governed loop + console', async () => {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(PORT), KEYS_DIR: path.join(TMP, 'keys'), LEDGER_DIR: path.join(TMP, 'ledger'), SECRETS_FILE: STORE },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  try {
    // wait for boot
    for (let i = 0; i < 40; i++) {
      try { const s = await J('GET', '/status'); if (s.status === 200) break; } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.equal((await J('GET', '/status')).body.ok, true);

    const skills = (await J('GET', '/api/skills')).body.skills;
    assert.ok(skills.some((s) => s.name === 'framework-map' && s.runnable));

    const sk = await J('POST', '/api/skills/run', { name: 'framework-map', input: 'an AI tool that screens job candidates' });
    assert.ok(sk.body.result.gates.length > 0);

    const prop = await J('POST', '/api/gov/propose', { intent: 'deploy the site' });
    assert.equal(prop.body.requiresHumanGate, true);

    const dec = await J('POST', '/api/gov/decide', { pendingId: prop.body.pendingId, decision: 'approve', scope: 'github-deploy', requiredLevel: 'act' });
    assert.ok(dec.body.grant && dec.body.grant.token, 'approval brokers a token');

    const run = await J('POST', '/api/gov/run', { token: dec.body.grant.token, code: 'export default async () => "built";' });
    assert.equal(run.body.ok, true);

    const ov = await J('GET', '/api/oversight?role=steward');
    assert.ok(ov.body.receipts.length >= 3);

    const con = await J('GET', '/console');
    assert.match(con.body, /Control Room/);
  } finally {
    child.kill();
  }
});
