// test/identity.test.mjs
// Ticket 8 (core) — roles map to a capability level AND an oversight scope.

import { test } from 'node:test';
import assert from 'node:assert';
import { identify, member, can } from '../src/core/identity.js';

test('roles map to capability level + oversight scope', () => {
  const s = identify({ id: 'bob', role: 'steward' });
  assert.equal(s.role, 'steward'); assert.equal(s.level, 'auto'); assert.equal(s.scope, 'all');
  const m = identify({ id: 'x', role: 'member' });
  assert.equal(m.level, 'propose'); assert.equal(m.scope, 'own');
  assert.equal(identify({ role: 'wizard' }).role, 'member', 'unknown role falls back to member');
});

test('anon member back-compat (id + caps preserved, now carries role)', () => {
  const m = member();
  assert.equal(m.id, 'member:anon');
  assert.equal(m.role, 'member');
  assert.ok(m.caps, 'keeps the caps field server.js relies on');
});

test('can() respects the unified 4-level dial', () => {
  assert.equal(can({ level: 'auto' }, 'act'), true);
  assert.equal(can({ level: 'act' }, 'act'), true);
  assert.equal(can({ level: 'propose' }, 'act'), false);
});
