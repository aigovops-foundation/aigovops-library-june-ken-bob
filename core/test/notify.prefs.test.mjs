// test/notify.prefs.test.mjs — #7 per-member channel preferences (store-backed).
import { test } from 'node:test';
import assert from 'node:assert';
import { createNotifyPrefs } from '../src/core/notify.prefs.js';
import { MemoryStore } from '../src/core/statestore.js';

test('defaults, validated updates, dashboard always-on, muted kinds', async () => {
  const prefs = createNotifyPrefs(new MemoryStore());
  assert.deepStrictEqual(await prefs.get('oidc:ken'), { channels: ['dashboard'], mutedKinds: [], digest: false });

  const next = await prefs.set('oidc:ken', { channels: ['telegram'], mutedKinds: ['report'], digest: true });
  assert.deepStrictEqual(next.channels.sort(), ['dashboard', 'telegram'], 'dashboard always present');
  assert.deepStrictEqual(next.mutedKinds, ['report']);
  assert.equal(next.digest, true);

  await assert.rejects(() => prefs.set('oidc:ken', { channels: ['pager'] }), /unknown channel/);
  await assert.rejects(() => prefs.set('oidc:ken', { mutedKinds: ['nope'] }), /unknown kind/);
});

test('resolve: filters to a member’s channels, mutes by kind, keeps dashboard', async () => {
  const prefs = createNotifyPrefs(new MemoryStore());
  await prefs.set('m', { channels: ['telegram'], mutedKinds: ['report'] });

  const r1 = await prefs.resolve('m', 'alert', ['telegram', 'sms']);
  assert.ok(!r1.muted);
  assert.deepStrictEqual(r1.channels.sort(), ['dashboard', 'telegram'], 'sms dropped (not in prefs)');

  const r2 = await prefs.resolve('m', 'report');
  assert.ok(r2.muted && r2.channels.length === 1 && r2.channels[0] === 'dashboard', 'muted kind → dashboard only');
});

test('persists across instances (cluster-wide via the shared store)', async () => {
  const store = new MemoryStore();
  await createNotifyPrefs(store).set('m', { digest: true });
  assert.equal((await createNotifyPrefs(store).get('m')).digest, true);
});
