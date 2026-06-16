// test/orgs.test.mjs
// #4 — orgs/teams + delegated RBAC. Membership + roles + teams, fail-closed on
// unknown orgs/roles/duplicates.

import { test } from 'node:test';
import assert from 'node:assert';
import { Orgs, ORG_ROLES } from '../src/core/orgs.js';

test('create org with a delegated steward, members with roles, teams', () => {
  const orgs = new Orgs({ now: () => 1 });
  orgs.createOrg('acme', 'Acme Corp', { steward: 'oidc:ken' });
  assert.ok(orgs.hasRole('acme', 'oidc:ken', 'org-steward'), 'creator-steward is org-steward');

  orgs.setMember('acme', 'oidc:bob', { roles: ['reviewer', 'auditor'] });
  assert.ok(orgs.hasRole('acme', 'oidc:bob', 'reviewer') && orgs.hasRole('acme', 'oidc:bob', 'auditor'));
  assert.ok(!orgs.hasRole('acme', 'oidc:bob', 'org-steward'));

  orgs.createTeam('acme', 'eu', 'EU Team', { lead: 'oidc:bob' });
  orgs.addToTeam('acme', 'eu', 'oidc:ken');
  const v = orgs.get('acme');
  assert.equal(v.members.length, 2);
  assert.equal(v.teams[0].members.length, 2);            // lead + added
  assert.equal(orgs.list()[0].teams, 1);

  orgs.removeMember('acme', 'oidc:bob');
  assert.equal(orgs.get('acme').members.length, 1);
  assert.ok(!orgs.get('acme').teams[0].members.includes('oidc:bob'), 'removed from teams too');
});

test('fails closed on unknown org, duplicate org, bad role', () => {
  const orgs = new Orgs();
  assert.throws(() => orgs.setMember('nope', 'x'), /no org/);
  orgs.createOrg('a', 'A');
  assert.throws(() => orgs.createOrg('a', 'A'), /already exists/);
  assert.throws(() => orgs.setMember('a', 'x', { roles: ['king'] }), /unknown role/);
  assert.throws(() => orgs.addToTeam('a', 'ghost', 'x'), /no team/);
});

test('every documented role is accepted', () => {
  const orgs = new Orgs();
  orgs.createOrg('o', 'O');
  for (const r of ORG_ROLES) assert.doesNotThrow(() => orgs.setMember('o', `m:${r}`, { roles: [r] }));
});
