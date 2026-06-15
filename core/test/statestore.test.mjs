// test/statestore.test.mjs
// #1 — the shared-state seam + distributed rate limiter. MemoryStore is the
// dependency-free default; RedisStore is proven against a fake node-redis-style
// client (no live server). The limiter enforces the window across whatever store
// it's given — i.e. across instances when that store is Redis.

import { test } from 'node:test';
import assert from 'node:assert';

const { MemoryStore, RedisStore, createStateStore } = await import('../src/core/statestore.js');
const { createRateLimiter } = await import('../src/core/ratelimit.js');

test('MemoryStore: get/set/del + TTL expiry + atomic incr', async () => {
  const s = new MemoryStore();
  assert.strictEqual(await s.get('a'), null);
  await s.set('a', { x: 1 });
  assert.deepStrictEqual(await s.get('a'), { x: 1 });
  assert.strictEqual(await s.incr('c', 1), 1);
  assert.strictEqual(await s.incr('c', 2), 3);
  await s.set('t', 'v', 5); await new Promise((r) => setTimeout(r, 12));
  assert.strictEqual(await s.get('t'), null, 'expired key reads null');
  await s.del('a'); assert.strictEqual(await s.get('a'), null);
});

// Fake node-redis v4 client (in-memory) — exercises RedisStore's command mapping.
function fakeRedis() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async set(k, v) { m.set(k, v); return 'OK'; },
    async del(k) { m.delete(k); },
    async incrBy(k, by) { const v = (Number(m.get(k)) || 0) + by; m.set(k, String(v)); return v; },
    async expire() { return 1; },
    async quit() {},
  };
}

test('RedisStore maps onto a node-redis client (JSON round-trip + incr)', async () => {
  const s = new RedisStore(fakeRedis());
  await s.set('k', { hello: 'world' });
  assert.deepStrictEqual(await s.get('k'), { hello: 'world' });
  assert.strictEqual(await s.incr('n', 1), 1);
  assert.strictEqual(await s.incr('n', 1), 2);
});

test('createStateStore: memory by default, RedisStore from an injected client', async () => {
  const prev = process.env.REDIS_URL; delete process.env.REDIS_URL;
  assert.ok((await createStateStore()) instanceof MemoryStore);
  assert.ok((await createStateStore({ client: fakeRedis() })) instanceof RedisStore);
  if (prev) process.env.REDIS_URL = prev;
});

test('rate limiter allows up to max within a window, then blocks (shared via the store)', async () => {
  const store = new MemoryStore();
  const rl = createRateLimiter(store, { max: 3, windowMs: 60_000 });
  const now = 1_000_000;
  assert.strictEqual(await rl.hit('ip1', now), true);
  assert.strictEqual(await rl.hit('ip1', now), true);
  assert.strictEqual(await rl.hit('ip1', now), true);
  assert.strictEqual(await rl.hit('ip1', now), false, '4th in-window is blocked');
  assert.strictEqual(await rl.hit('ip2', now), true, 'a different id is independent');
  assert.strictEqual(await rl.hit('ip1', now + 60_000), true, 'next window resets');
});

test('two limiters sharing one store enforce ONE limit (the multi-instance property)', async () => {
  const store = new MemoryStore();             // stands in for shared Redis
  const a = createRateLimiter(store, { max: 2, windowMs: 60_000 });
  const b = createRateLimiter(store, { max: 2, windowMs: 60_000 });   // a second "instance"
  const now = 2_000_000;
  assert.strictEqual(await a.hit('ip', now), true);
  assert.strictEqual(await b.hit('ip', now), true);
  assert.strictEqual(await a.hit('ip', now), false, 'the shared store enforces the limit across instances');
});
