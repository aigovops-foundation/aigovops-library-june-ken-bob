// test/notify.test.mjs
// Hermes — the contract, every channel adapter (via injected transports, no
// network), and the orchestrator's governance + reliability rules:
// metadata-only receipts, idempotency dedupe, retry → dead-letter, fan-out.

import { test } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-notify-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const { Notifier, NotifyError, normalizeMessage } = await import('../src/core/notify.shared.js');
const { DashboardNotifier } = await import('../src/core/notify.dashboard.js');
const { EmailNotifier } = await import('../src/core/notify.email.js');
const { SmsNotifier } = await import('../src/core/notify.sms.js');
const { VoiceNotifier } = await import('../src/core/notify.voice.js');
const { TelegramNotifier } = await import('../src/core/notify.telegram.js');
const { request, buildAllowList } = await import('../src/core/httpclient.js');
const { createHermes } = await import('../src/core/notify.js');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// --- contract ---------------------------------------------------------------
test('normalizeMessage validates and rejects malformed messages', () => {
  assert.throws(() => normalizeMessage({ summary: '' }), /needs a summary/);
  assert.throws(() => normalizeMessage({ summary: 'x', kind: 'nope' }), /unknown kind/);
  assert.throws(() => normalizeMessage({ summary: 'x', severity: 'loud' }), /unknown severity/);
  const m = normalizeMessage({ summary: 'hi', kind: 'alert', severity: 'warn' });
  assert.strictEqual(m.kind, 'alert'); assert.strictEqual(m.audience, 'stewards');
});

test('the base Notifier fails loud until implemented', async () => {
  const n = new Notifier();
  assert.strictEqual(n.configured(), false);
  await assert.rejects(() => n.send({}), /not implemented/);
});

// --- egress allow-list ------------------------------------------------------
test('httpclient fails closed on a host not on the allow-list (no socket)', async () => {
  await assert.rejects(
    () => request({ url: 'https://evil.example/x', allow: new Set(['api.telegram.org']) }),
    (e) => e instanceof NotifyError && e.reason === 'egress-denied');
});

// --- channel adapters (injected transport; no network) ----------------------
test('email adapter: fail-closed unconfigured, then posts Postmark-shaped JSON', async () => {
  await assert.rejects(() => new EmailNotifier({}).send(normalizeMessage({ summary: 'x' })), /needs NOTIFY_EMAIL/);
  let seen;
  const t = async (url, body, opts) => { seen = { url, body, opts }; return { status: 200, json: { MessageID: 'm1' } }; };
  const e = new EmailNotifier({ token: 'tok', from: 'a@b.c', to: 'd@e.f', transport: t });
  assert.ok(e.configured());
  const r = await e.send(normalizeMessage({ summary: 'hello', body: 'world' }));
  assert.ok(r.delivered && r.id === 'm1');
  assert.strictEqual(seen.body.To, 'd@e.f');
  assert.match(seen.body.Subject, /AiGovOps/);
  assert.strictEqual(seen.opts.headers['X-Postmark-Server-Token'], 'tok');
  assert.ok(seen.opts.allow.has('api.postmarkapp.com'));
});

test('sms adapter: Twilio form post with basic auth', async () => {
  let seen;
  const t = async (url, params, opts) => { seen = { url, params, opts }; return { status: 201, json: { sid: 'SM1' } }; };
  const s = new SmsNotifier({ sid: 'AC1', token: 'tk', from: '+1', to: '+2', transport: t });
  const r = await s.send(normalizeMessage({ summary: 'ping' }));
  assert.ok(r.delivered && r.id === 'SM1');
  assert.strictEqual(seen.params.To, '+2'); assert.strictEqual(seen.params.From, '+1'); assert.strictEqual(seen.params.Body, 'ping');
  assert.match(seen.opts.headers.Authorization, /^Basic /);
  assert.match(seen.url, /Accounts\/AC1\/Messages\.json/);
});

test('voice adapter: Twilio call with escaped inline TwiML', async () => {
  let seen;
  const t = async (url, params) => { seen = params; return { status: 201, json: { sid: 'CA1' } }; };
  const v = new VoiceNotifier({ sid: 'AC1', token: 'tk', from: '+1', to: '+2', transport: t });
  const r = await v.send(normalizeMessage({ summary: 'fire & <smoke>' }));
  assert.ok(r.delivered && r.id === 'CA1');
  assert.match(seen.Twiml, /<Response><Say/);
  assert.match(seen.Twiml, /&amp;/); assert.match(seen.Twiml, /&lt;smoke&gt;/);   // escaped, can't break the XML
});

test('telegram adapter: sendMessage JSON, and fail-closed on ok:false', async () => {
  let seen;
  const ok = async (url, body, opts) => { seen = { url, body, opts }; return { status: 200, json: { ok: true, result: { message_id: 9 } } }; };
  const tg = new TelegramNotifier({ token: 'BOT', to: '42', transport: ok });
  const r = await tg.send(normalizeMessage({ summary: 'hi' }));
  assert.ok(r.delivered && r.id === '9');
  assert.strictEqual(seen.body.chat_id, '42');
  assert.match(seen.url, /\/botBOT\/sendMessage/);
  assert.ok(seen.opts.allow.has('api.telegram.org'));

  const bad = async () => ({ status: 200, json: { ok: false, description: 'blocked' } });
  await assert.rejects(() => new TelegramNotifier({ token: 'BOT', to: '42', transport: bad }).send(normalizeMessage({ summary: 'x' })), /blocked/);
});

// --- dashboard channel ------------------------------------------------------
test('dashboard records metadata + summary and fans to subscribers', async () => {
  const d = new DashboardNotifier({ capacity: 3 });
  const seen = [];
  const unsub = d.subscribe((e) => seen.push(e));
  for (const s of ['a', 'b', 'c', 'd']) await d.send(normalizeMessage({ summary: s }));
  assert.strictEqual(seen.length, 4);
  assert.strictEqual(d.feed().length, 3);             // bounded ring
  assert.strictEqual(d.feed().slice(-1)[0].summary, 'd');
  unsub();
});

// --- orchestrator: fan-out, metadata-only, dedupe, dead-letter --------------
function fake(name, behavior) {
  return new (class extends Notifier {
    constructor() { super(); this.calls = []; }
    get name() { return name; }
    configured() { return true; }
    hosts() { return []; }
    async send(m) { this.calls.push(m); return behavior(m); }
  })();
}
function hermesWith(extra) {
  const channels = new Map([['dashboard', new DashboardNotifier()], ...extra]);
  const receipts = [];
  const h = createHermes({ channels, emit: (m) => { receipts.push(m); return { kid: 'k', record: { ts: 'T' } }; }, sha256: sha, sleep: async () => {}, retries: 1 });
  return { h, receipts, channels };
}

test('send fans out to dashboard + configured channels and signs ONE receipt', async () => {
  const tg = fake('telegram', async () => ({ delivered: true, id: 'x' }));
  const { h, receipts } = hermesWith([['telegram', tg]]);
  const r = await h.send({ summary: 'SECRET-BODY-TEXT', body: 'PRIVATE-DETAILS', kind: 'alert', severity: 'warn' });
  assert.ok(r.delivered);
  assert.deepStrictEqual(r.results.map((x) => x.channel).sort(), ['dashboard', 'telegram']);
  assert.strictEqual(receipts.length, 1);
  // METADATA ONLY: the receipt must NOT contain the summary or body text.
  const blob = JSON.stringify(receipts[0]);
  assert.ok(!blob.includes('SECRET-BODY-TEXT'), 'summary must not be in the receipt');
  assert.ok(!blob.includes('PRIVATE-DETAILS'), 'body must not be in the receipt');
  assert.ok(receipts[0].detail.channels.length === 2 && receipts[0].contentHash);
});

test('idempotency: an identical message within the window is deduped', async () => {
  const { h } = hermesWith([]);
  const first = await h.send({ summary: 'same', kind: 'system' });
  const second = await h.send({ summary: 'same', kind: 'system' });
  assert.ok(!first.deduped && second.deduped);
});

test('retry then dead-letter: a failing channel is bounded and recorded', async () => {
  let tries = 0;
  const flaky = fake('telegram', async () => { tries++; throw new NotifyError('network', 'down'); });
  const { h } = hermesWith([['telegram', flaky]]);
  const r = await h.send({ summary: 'will-fail', kind: 'alert' });
  const tgResult = r.results.find((x) => x.channel === 'telegram');
  assert.ok(tgResult.deadlettered && tgResult.attempts === 2);   // retries:1 → 2 attempts
  assert.strictEqual(tries, 2);
  assert.ok(h.deadLetters().some((d) => d.channel === 'telegram' && d.reason === 'network'));
  // dashboard still delivered despite telegram failing
  assert.ok(r.results.find((x) => x.channel === 'dashboard').delivered);
});

test('a deterministic config error is NOT retried', async () => {
  let tries = 0;
  const misconfigured = fake('telegram', async () => { tries++; throw new NotifyError('not-configured', 'no token'); });
  const { h } = hermesWith([['telegram', misconfigured]]);
  await h.send({ summary: 'x', kind: 'alert' });
  assert.strictEqual(tries, 1, 'config errors fail closed without retry');
});

test('explicit channel pick still always includes the dashboard', async () => {
  const tg = fake('telegram', async () => ({ delivered: true }));
  const { h } = hermesWith([['telegram', tg]]);
  const r = await h.send({ summary: 'pick', kind: 'message' }, { channels: ['telegram'] });
  assert.ok(r.results.some((x) => x.channel === 'dashboard'));
});

test('retry then success: a transient failure recovers within the bound', async () => {
  let n = 0;
  const ch = fake('telegram', async () => { n++; if (n === 1) throw new NotifyError('network', 'blip'); return { delivered: true, id: 'ok' }; });
  const { h } = hermesWith([['telegram', ch]]);
  const r = await h.send({ summary: 'recover', kind: 'alert' });
  const tg = r.results.find((x) => x.channel === 'telegram');
  assert.ok(tg.delivered && tg.attempts === 2 && !tg.deadlettered);
});

test('dedupe window: an identical message after the window evicts + re-sends', async () => {
  let clock = 1000;
  const channels = new Map([['dashboard', new DashboardNotifier()]]);
  const h = createHermes({ channels, emit: () => ({ kid: 'k', record: { ts: 'T' } }), sha256: sha, sleep: async () => {}, retries: 0, now: () => clock });
  assert.ok(!(await h.send({ summary: 'same', kind: 'system' })).deduped);
  assert.ok((await h.send({ summary: 'same', kind: 'system' })).deduped);
  clock += 5 * 60 * 1000 + 1;                                  // advance past the window
  assert.ok(!(await h.send({ summary: 'same', kind: 'system' })).deduped, 'evicted after the window');
});

test('audience is validated to the scoping contract', () => {
  assert.throws(() => normalizeMessage({ summary: 'x', audience: 'everyone' }), /audience must be/);
  assert.doesNotThrow(() => normalizeMessage({ summary: 'x', audience: 'github:bob' }));
});

test('httpclient refuses non-https (TLS only, fail closed)', async () => {
  await assert.rejects(() => request({ url: 'http://api.telegram.org/x', allow: new Set(['api.telegram.org']) }),
    (e) => e instanceof NotifyError && e.reason === 'egress-denied');
});

test('an unknown channel pick is ignored; dashboard still delivers', async () => {
  const { h } = hermesWith([]);
  const r = await h.send({ summary: 'x', kind: 'message' }, { channels: ['pager'] });
  assert.deepStrictEqual(r.results.map((x) => x.channel), ['dashboard']);
});
