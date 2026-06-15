// src/core/ratelimit.js
// DISTRIBUTED RATE LIMITER (#1/#6). A fixed-window limiter backed by the shared
// state store, so the limit is enforced ACROSS instances (not per-process like
// the old in-memory bucket map). MemoryStore keeps the single-node default;
// RedisStore makes it cluster-wide. Counting is atomic (store.incr).

export function createRateLimiter(store, { max = 60, windowMs = 60_000, prefix = 'rl' } = {}) {
  return {
    // Returns true if the request is allowed, false if over the limit.
    async hit(id, now = Date.now()) {
      const windowKey = `${prefix}:${id}:${Math.floor(now / windowMs)}`;
      const n = await store.incr(windowKey, 1, windowMs);
      return n <= max;
    },
  };
}
