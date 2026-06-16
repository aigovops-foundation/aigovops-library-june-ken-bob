// test/quota.test.mjs
// #6 — per-identity quota, store-backed so it is cluster-wide; tiered by role;
// fails open on a broken store (availability — the IP limiter is still in front).

import { test } from 'node:test';
import assert from 'node:assert';
import { createQuota, tierFor } from '../src/core/quota.js';
import { MemoryStore } from '../src/core/statestore.js';

test('tierFor maps identity → tier', () => {
  assert.equal(tierFor(null), 'anon');
  assert.equal(tierFor({ role: 'member' }), 'member');
  assert.equal(tierFor({ role: 'steward' }), 'steward');
});

test('counts per identity and blocks over the tier limit', async () => {
  const store = new MemoryStore();
  const q = createQuota(store, { limits: { member: 2, steward: 5, anon: 1 } });
  const ken = { id: 'oidc:ken', role: 'member' };
  assert.ok((await q.check(ken)).allowed);
  assert.ok((await q.check(ken)).allowed);
  assert.ok(!(await q.check(ken)).allowed, '3rd request over the member limit of 2');
  assert.ok((await q.check({ id: 'oidc:bob', role: 'member' })).allowed, 'a different identity has its own window');
});

test('quota is cluster-wide: a second instance shares the counter', async () => {
  const store = new MemoryStore();
  const ken = { id: 'oidc:ken', role: 'member' };
  const a = createQuota(store, { limits: { member: 2 } });
  const b = createQuota(store, { limits: { member: 2 } });   // a different replica, same store
  await a.check(ken); await a.check(ken);
  assert.ok(!(await b.check(ken)).allowed, 'replica B sees A’s consumption');
});

test('fails open on a broken store', async () => {
  const broken = { incr: async () => { throw new Error('store down'); } };
  const r = await createQuota(broken).check({ id: 'x', role: 'member' });
  assert.ok(r.allowed && r.degraded);
});
