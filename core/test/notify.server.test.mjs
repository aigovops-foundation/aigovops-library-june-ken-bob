// test/notify.server.test.mjs
// The Hermes HTTP surface end to end: /status posture, the gated /api/notify,
// the steward management view, the role-scoped feed, the management page, and the
// founder-gated inbound webhook.

import { test } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '..', 'src', 'server.js');
const PORT = 8795;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-notify-srv-'));
const TOKEN = 'test-ops';

const J = async (m, p, b, tok) => {
  const headers = {};
  if (b) headers['content-type'] = 'application/json';
  if (tok) headers.authorization = `Bearer ${tok}`;
  const r = await fetch(BASE + p, { method: m, headers, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
};

test('HTTP: Hermes messenger surface', async () => {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(PORT), KEYS_DIR: path.join(TMP, 'keys'), LEDGER_DIR: path.join(TMP, 'ledger'), STEWARD_TOKEN: TOKEN, OLLAMA_TIMEOUT_MS: '300', NOTIFY_CHANNELS: 'dashboard' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  try {
    for (let i = 0; i < 40; i++) { try { if ((await J('GET', '/status')).status === 200) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }

    // /status carries the notify posture (dashboard always-on)
    const st = await J('GET', '/status');
    assert.ok(Array.isArray(st.body.notify));
    assert.ok(st.body.notify.find((c) => c.channel === 'dashboard' && c.configured === true));

    // the door is closed: notify without auth is rejected
    assert.equal((await J('POST', '/api/notify', { summary: 'hi' })).status, 401);

    // a steward send IS the approval → delivered to the dashboard
    const sent = await J('POST', '/api/notify', { kind: 'system', severity: 'info', audience: 'stewards', summary: 'unit-test-ping' }, TOKEN);
    assert.equal(sent.status, 200);
    assert.ok(sent.body.sent && sent.body.results.some((r) => r.channel === 'dashboard' && r.delivered));

    // management view (steward-only)
    assert.equal((await J('GET', '/api/notify/channels')).status, 401);
    const chans = await J('GET', '/api/notify/channels', null, TOKEN);
    assert.ok(chans.body.channels.some((c) => c.channel === 'dashboard'));
    assert.ok('telegram' in chans.body.bridge);

    // the feed shows the sent notification (steward sees all)
    const feed = await J('GET', '/api/notify/feed', null, TOKEN);
    assert.ok(feed.body.feed.some((e) => e.summary === 'unit-test-ping'));

    // a member-facing send by a steward still sends (steward is the approver);
    // but the policy itself gates member-facing for non-stewards — checked in unit tests.

    // management page serves
    const page = await J('GET', '/messaging');
    assert.match(page.body, /Hermes/);

    // inbound webhook: no founders configured → every sender rejected (no oracle)
    const wh = await J('POST', '/api/bridge/telegram', { message: { from: { id: 7 }, chat: { id: 7 }, text: 'hello' } });
    assert.equal(wh.status, 200);
    assert.ok(wh.body.rejected, 'unconfigured/unknown sender is rejected');
  } finally {
    child.kill('SIGKILL');
  }
});
