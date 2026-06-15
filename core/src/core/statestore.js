// src/core/statestore.js
// SHARED STATE SEAM (#1 — horizontal scale). Today the live state that breaks
// multi-instance — pending proposals, brokered grants, caps usage, the rate-limit
// buckets, the halted flag — lives in per-process Maps. This is the abstraction
// they migrate to so ANY instance can serve ANY request:
//   • MemoryStore (default) — per-process, dependency-free, behaviour unchanged.
//   • RedisStore  (opt-in)  — shared across instances; needs REDIS_URL + `redis`.
//
// Minimal KV + atomic counter API (get/set/del/incr with TTL) — enough for the
// rate limiter (wired now) and the governed-loop state (documented migration in
// plan/scale-architecture.md). The Redis client is injectable so the adapter is
// proven without a live server.

export class MemoryStore {
  constructor() { this.kv = new Map(); this.exp = new Map(); }
  _gc(k) { const e = this.exp.get(k); if (e !== undefined && Date.now() > e) { this.kv.delete(k); this.exp.delete(k); } }
  async get(k) { this._gc(k); return this.kv.has(k) ? this.kv.get(k) : null; }
  async set(k, v, ttlMs) { this.kv.set(k, v); if (ttlMs) this.exp.set(k, Date.now() + ttlMs); else this.exp.delete(k); return v; }
  async del(k) { this.kv.delete(k); this.exp.delete(k); }
  async incr(k, by = 1, ttlMs) { this._gc(k); const v = (this.kv.get(k) || 0) + by; this.kv.set(k, v); if (ttlMs && !this.exp.has(k)) this.exp.set(k, Date.now() + ttlMs); return v; }
  async close() {}
}

// Redis adapter. `client` is injectable (fake for tests); otherwise it lazy-loads
// the optional `redis` package — kept opt-in so the core default stays
// dependency-free. Expects a node-redis v4-style client (get/set/incrBy/expire/del).
export class RedisStore {
  static async connect(url = process.env.REDIS_URL) {
    let redis;
    try { redis = await import('redis'); }
    catch { throw new Error('RedisStore needs the `redis` package — run `npm i redis` (kept optional to preserve the dependency-free default)'); }
    const client = redis.createClient({ url });
    await client.connect();
    return new RedisStore(client);
  }
  constructor(client) { this.client = client; }
  async get(k) { const v = await this.client.get(k); if (v === null || v === undefined) return null; try { return JSON.parse(v); } catch { return v; } }
  async set(k, v, ttlMs) { const s = typeof v === 'string' ? v : JSON.stringify(v); await this.client.set(k, s, ttlMs ? { PX: ttlMs } : undefined); return v; }
  async del(k) { await this.client.del(k); }
  async incr(k, by = 1, ttlMs) { const v = await this.client.incrBy(k, by); if (ttlMs && v === by) await this.client.expire(k, Math.ceil(ttlMs / 1000)); return v; }
  async close() { try { await this.client.quit(); } catch { /* already closed */ } }
}

// Pick a store: Redis when REDIS_URL is set, else in-process memory.
export async function createStateStore(opts = {}) {
  if (opts.client) return new RedisStore(opts.client);
  if (process.env.REDIS_URL) return RedisStore.connect();
  return new MemoryStore();
}
