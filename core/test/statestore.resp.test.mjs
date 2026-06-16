// test/statestore.resp.test.mjs
// The dependency-free RESP client: RESP2 codec (byte-correct, partial-safe) and
// the store adapter proven over a scripted fake socket — no live Redis, no npm.

import { test } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { encodeCommand, parseReply, RespStore } from '../src/core/statestore.resp.js';

test('encodeCommand → RESP2 array of bulk strings', () => {
  assert.equal(encodeCommand(['SET', 'k', 'v']).toString(), '*3\r\n$3\r\nSET\r\n$1\r\nk\r\n$1\r\nv\r\n');
});

test('parseReply: simple / error / integer / bulk / nil / array / incomplete / multibyte', () => {
  assert.equal(parseReply(Buffer.from('+OK\r\n')).value, 'OK');
  assert.equal(parseReply(Buffer.from(':5\r\n')).value, 5);
  assert.equal(parseReply(Buffer.from('$3\r\nabc\r\n')).value, 'abc');
  assert.equal(parseReply(Buffer.from('$-1\r\n')).value, null);
  assert.ok(parseReply(Buffer.from('-ERR bad\r\n')).error);
  assert.deepStrictEqual(parseReply(Buffer.from('*2\r\n:1\r\n$2\r\nhi\r\n')).value, [1, 'hi']);
  assert.equal(parseReply(Buffer.from('$3\r\nab')), null, 'incomplete bulk → null');
  const b = Buffer.from('€uro');                                   // 3-byte char: length is BYTES, not chars
  assert.equal(parseReply(Buffer.concat([Buffer.from(`$${b.length}\r\n`), b, Buffer.from('\r\n')])).value, '€uro');
});

// A scripted fake socket: each write() pops the next canned reply and emits it.
class FakeSocket extends EventEmitter {
  constructor(replies) { super(); this.replies = replies.slice(); this.writes = []; }
  write(buf) { this.writes.push(buf.toString()); const r = this.replies.shift(); if (r !== undefined) queueMicrotask(() => this.emit('data', Buffer.from(r))); return true; }
  end() {} destroy() {}
}

test('RespStore: set/get JSON round-trip + incr(+expire) over the wire', async () => {
  const fake = new FakeSocket([
    '+OK\r\n',                          // SET
    '$17\r\n{"hello":"world"}\r\n',     // GET
    ':1\r\n', ':1\r\n',                 // INCRBY n 1 → 1, then EXPIRE (v===by)
    ':2\r\n',                           // INCRBY n 1 → 2 (no EXPIRE, v!==by)
  ]);
  const store = await RespStore.connect('redis://x:6379', { socket: fake });
  assert.deepStrictEqual(await store.set('k', { hello: 'world' }), { hello: 'world' });
  assert.deepStrictEqual(await store.get('k'), { hello: 'world' });
  assert.equal(await store.incr('n', 1, 5000), 1);
  assert.equal(await store.incr('n', 1, 5000), 2);
  assert.match(fake.writes[0], /^\*3\r\n\$3\r\nSET\r\n/);
  assert.equal(fake.writes.length, 5, 'SET, GET, INCRBY, EXPIRE, INCRBY');
});

test('RespStore: a nil GET reads null', async () => {
  const store = await RespStore.connect('redis://x:6379', { socket: new FakeSocket(['$-1\r\n']) });
  assert.equal(await store.get('missing'), null);
});
