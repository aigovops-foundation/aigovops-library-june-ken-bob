// src/core/quota.js
// PER-IDENTITY QUOTAS (#6 — abuse prevention at scale). The IP rate limiter
// (ratelimit.js) stops a single host hammering the door; this stops a single
// IDENTITY from over-consuming across hosts/sessions. Store-backed, so the quota
// is CLUSTER-WIDE (same MemoryStore→RedisStore swap as the rate limiter). The
// allowance is tiered — a steward gets more headroom than a member than anon —
// which is the abuse-side mirror of the capability dial.

export const QUOTA_BY_TIER = { anon: 30, member: 120, steward: 600 };   // requests per window

export function tierFor(identity) {
  if (!identity) return 'anon';
  return identity.role === 'steward' ? 'steward' : 'member';
}

export function createQuota(store, { windowMs = 60_000, prefix = 'q', limits = QUOTA_BY_TIER } = {}) {
  return {
    // Count one request against the identity's window. Returns { allowed, count,
    // max, tier }. Fails OPEN on a store error (availability over strictness — the
    // IP limiter is still in front), but never throws into the request path.
    async check(identity, now = Date.now()) {
      const tier = tierFor(identity);
      const max = limits[tier] ?? limits.member;
      const id = (identity && identity.id) || 'anon';
      const key = `${prefix}:${id}:${Math.floor(now / windowMs)}`;
      try {
        const n = await store.incr(key, 1, windowMs);
        return { allowed: n <= max, count: n, max, tier };
      } catch {
        return { allowed: true, count: 0, max, tier, degraded: true };
      }
    },
  };
}
