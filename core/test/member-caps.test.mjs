// test/member-caps.test.mjs
// #6 — per-member capability profiles + onboarding. A member is onboarded narrow
// (propose); reaching 'act' (the level that brokers a credential) needs a steward
// to turn the dial — enforced end-to-end through the governed loop.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-mcaps-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');
const STORE = path.join(TMP, 'secrets.json');
fs.writeFileSync(STORE, JSON.stringify({ owner: 'lab', scopes: { 'github-deploy': 'M' }, rotated: {} }));

const { Caps } = await import('../src/core/caps.js');
const { MemberCaps, PROFILES } = await import('../src/core/member-caps.js');
const { createGovernedCore } = await import('../src/core/govapi.js');
const { FileProvider } = await import('../src/core/secrets.fileprovider.js');
const { identify } = await import('../src/core/identity.js');

test('onboarding assigns the default profile for the role (idempotent)', async () => {
  const mc = new MemberCaps();
  const m = mc.onboard(identify({ id: 'oidc:alice', role: 'member' }));
  assert.strictEqual(m.level, 'propose');
  const s = mc.onboard(identify({ id: 'oidc:ken', role: 'steward' }));
  assert.strictEqual(s.level, 'auto');
  // idempotent — onboarding again doesn't reset a changed dial
  mc.setLevel('oidc:alice', 'act');
  assert.strictEqual(mc.onboard(identify({ id: 'oidc:alice', role: 'member' })).level, 'act');
});

test('seed() pre-loads profiles from config without a live login', async () => {
  const mc = new MemberCaps();
  mc.seed([{ id: 'oidc:bob', role: 'member', level: 'act' }, { id: 'oidc:sue', role: 'steward' }]);
  assert.strictEqual(mc.get('oidc:bob').level, 'act');
  assert.strictEqual(mc.get('oidc:sue').level, 'auto');
});

test('a member at propose is paused at an act action until a steward raises the dial', async () => {
  const caps = new Caps();
  const mc = new MemberCaps({ caps });
  mc.onboard(identify({ id: 'oidc:maker', role: 'member' }));     // default: propose
  const core = createGovernedCore({ secrets: new FileProvider({ storePath: STORE }), caps });

  // an irreversible (act-level) action: the member is capped, no grant brokered
  let { pendingId } = await core.propose('deploy the site', { actor: 'oidc:maker' });
  let res = await core.decide(pendingId, 'approve', { scope: 'github-deploy' });   // requiredLevel 'act' from policy
  assert.strictEqual(res.approved, false);
  assert.strictEqual(res.capped, true);
  assert.match(res.reason, /capped:level/);

  // a steward turns the dial up; next request goes through
  mc.setLevel('oidc:maker', 'act');
  ({ pendingId } = await core.propose('deploy the site', { actor: 'oidc:maker' }));
  res = await core.decide(pendingId, 'approve', { scope: 'github-deploy' });
  assert.strictEqual(res.approved, true);
  assert.ok(res.grant && res.grant.token);

  // and the dial turns back down, effective immediately
  mc.setLevel('oidc:maker', 'read');
  ({ pendingId } = await core.propose('deploy the site', { actor: 'oidc:maker' }));
  res = await core.decide(pendingId, 'approve', { scope: 'github-deploy' });
  assert.strictEqual(res.approved, false, 'dialing down takes effect on the next request');
});

test('default profiles are narrow by construction', async () => {
  assert.strictEqual(PROFILES.member.level, 'propose');
  assert.ok(PROFILES.member.maxSpend < Infinity);
  assert.strictEqual(PROFILES.steward.level, 'auto');
});
