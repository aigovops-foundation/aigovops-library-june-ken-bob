// test/provision.test.mjs
// Guards the four go-live provisioning artifacts so they stay valid and CONSISTENT
// with the rest of the deploy config (the op:// references and the OIDC client id).
// These scripts are run by a human; the test only proves they're well-formed.

import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const P = 'deploy/provision';

test('the provisioning shell scripts are valid bash', () => {
  for (const s of ['1-onepassword.sh', '3-vault.sh', '3-keycloak.sh']) {
    execFileSync('bash', ['-n', path.join(ROOT, P, s)]);   // throws on syntax error
  }
});

test('the Keycloak realm is valid JSON and matches the OIDC client id in the template', () => {
  const realm = JSON.parse(read(`${P}/3-keycloak-realm.json`));
  assert.strictEqual(realm.realm, 'aigovops');
  const client = realm.clients.find((c) => c.clientId === 'aigov-console');
  assert.ok(client && client.publicClient === false, 'confidential aigov-console client');
  assert.ok(client.redirectUris.some((u) => u.endsWith('/auth/oidc/callback')));
  // the template's OIDC_CLIENT_ID must equal the realm client id
  const tmpl = read('deploy/.env.1password.tmpl');
  assert.match(tmpl, /^OIDC_CLIENT_ID=aigov-console$/m);
  // steward + member groups exist (role mapping for the capability dial)
  assert.ok(realm.groups.some((g) => g.name === 'steward') && realm.groups.some((g) => g.name === 'member'));
});

test('the 1Password script creates items matching the op:// references', () => {
  const sh = read(`${P}/1-onepassword.sh`);
  // every op:// item/field referenced by the template must be created here
  for (const [item, field] of [['session', 'secret'], ['ops', 'steward-token'], ['oidc', 'client-secret'], ['vault', 'token'], ['postgres', 'url'], ['redis', 'url']]) {
    assert.match(sh, new RegExp(`mkitem\\s+${item}\\s+${field}`), `1-onepassword.sh should create ${item}/${field}`);
  }
  // broker scopes match the VaultProvider/1Password convention
  assert.match(sh, /github-deploy/);
  assert.match(sh, /self-host/);
});

test('cloud-init installs docker + op and the runbook covers all four steps', () => {
  const ci = read(`${P}/2-cloud-init.yaml`);
  assert.match(ci, /get\.docker\.com/);
  assert.match(ci, /1password-cli/);
  assert.match(ci, /aigovops-library/);
  const rm = read(`${P}/README.md`);
  for (const step of ['1-onepassword.sh', 'cloud-init', '3-vault.sh', '3-keycloak.sh', '4-Caddyfile']) {
    assert.ok(rm.includes(step), `runbook references ${step}`);
  }
});
