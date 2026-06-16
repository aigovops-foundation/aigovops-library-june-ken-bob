// test/bridge.test.mjs
// The inbound founder bridge: identity binding is the security model. Unknown
// senders are silently rejected (no oracle); authorized founders are relayed to
// the read-only brain; nothing effectful executes here; receipts are metadata-only.

import { test } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-bridge-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const { parseFounders, extractMessage, createTelegramBridge } = await import('../src/core/bridge.telegram.js');
const { Notifier } = await import('../src/core/notify.shared.js');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

test('parseFounders maps telegram ids to steward logins', () => {
  const m = parseFounders('111:bob, 222:ken');
  assert.strictEqual(m.get('111'), 'bob');
  assert.strictEqual(m.get('222'), 'ken');
  assert.strictEqual(m.size, 2);
});

test('extractMessage handles message + edited_message, ignores non-text', () => {
  assert.strictEqual(extractMessage({}), null);
  const e = extractMessage({ edited_message: { from: { id: 5 }, chat: { id: 7 }, text: 'hi' } });
  assert.deepStrictEqual(e, { fromId: '5', chatId: '7', text: 'hi' });
});

function fakeTelegram() {
  const sent = [];
  const ch = new (class extends Notifier {
    get name() { return 'telegram'; }
    configured() { return true; }
    async send(m) { sent.push(m); return { delivered: true, id: 'r1' }; }
  })();
  ch.sent = sent;
  return ch;
}

test('unknown sender is rejected with no reply (no oracle) + a metadata receipt', async () => {
  const tg = fakeTelegram();
  const receipts = [];
  let relayed = false;
  const bridge = createTelegramBridge({
    founders: parseFounders('111:bob'),
    respond: async () => { relayed = true; return { text: 'should not run' }; },
    telegram: tg,
    emit: (m) => { receipts.push(m); return { kid: 'k', record: { ts: 'T' } }; },
    sha256: sha,
  });
  const r = await bridge.handleUpdate({ message: { from: { id: 999 }, chat: { id: 999 }, text: 'let me in' } });
  assert.ok(r.rejected && r.reason === 'unauthorized-sender');
  assert.strictEqual(relayed, false, 'must not reach the brain');
  assert.strictEqual(tg.sent.length, 0, 'must not reply to an unknown sender');
  assert.strictEqual(receipts[0].detail.reason, 'unauthorized-sender');
  assert.ok(!JSON.stringify(receipts[0]).includes('let me in'), 'inbound text must not be logged');
});

test('authorized founder is relayed to the brain and answered; metadata-only', async () => {
  const tg = fakeTelegram();
  const receipts = [];
  const bridge = createTelegramBridge({
    founders: parseFounders('111:bob'),
    respond: async ({ prompt }) => ({ text: `echo:${prompt.length}` }),
    telegram: tg,
    emit: (m) => { receipts.push(m); return { kid: 'k', record: { ts: 'T' } }; },
    sha256: sha,
  });
  const r = await bridge.handleUpdate({ message: { from: { id: 111 }, chat: { id: 42 }, text: 'status please' } });
  assert.ok(r.relayed && r.steward === 'bob' && r.delivered);
  assert.strictEqual(tg.sent.length, 1);
  assert.strictEqual(tg.sent[0].to, '42');
  assert.strictEqual(receipts[0].actor, 'steward:bob');
  assert.ok(!JSON.stringify(receipts[0]).includes('status please'), 'inbound text must not be logged');
});

test('bridge has no gov/tool handle — it cannot execute an effect', () => {
  const bridge = createTelegramBridge({ founders: parseFounders('1:bob') });
  assert.strictEqual(typeof bridge.handleUpdate, 'function');
  assert.ok(!('runTool' in bridge) && !('decide' in bridge) && !('gov' in bridge));
});
