// test/deploy.test.mjs
// Guards the deploy IaC so it can't silently drift: the stack lists the expected
// services, Prometheus scrapes the core, and the 1Password template holds ONLY
// op:// references (no raw secret values), so "every credential lives in
// 1Password" stays true.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('compose declares the full backend stack', () => {
  const c = read('deploy/docker-compose.yml');
  for (const svc of ['core:', 'postgres:', 'redis:', 'vault:', 'keycloak:', 'opa:', 'prometheus:', 'grafana:']) {
    assert.ok(c.includes(svc), `compose should declare ${svc}`);
  }
  assert.match(c, /SECRETS_PROFILE/);
  assert.match(c, /\/livez/, 'core has a healthcheck against /livez');
});

test('prometheus scrapes the core /metrics', () => {
  const p = read('deploy/prometheus.yml');
  assert.match(p, /metrics_path:\s*\/metrics/);
  assert.match(p, /core:8787/);
});

test('the 1Password template holds only op:// references for secrets', () => {
  const tmpl = read('deploy/.env.1password.tmpl');
  // every secret-bearing var must be an op:// ref (not a literal value)
  for (const key of ['SESSION_SECRET', 'STEWARD_TOKEN', 'OIDC_CLIENT_SECRET', 'DATABASE_URL', 'REDIS_URL', 'VAULT_TOKEN']) {
    const m = tmpl.match(new RegExp(`^${key}=(.+)$`, 'm'));
    assert.ok(m, `${key} present`);
    assert.match(m[1].trim(), /^op:\/\//, `${key} must be a 1Password reference, got: ${m[1]}`);
  }
});

test('bootstrap.sh renders from 1Password and health-checks; README documents the operator step', () => {
  const sh = read('deploy/bootstrap.sh');
  assert.match(sh, /op inject/);
  assert.match(sh, /docker compose/);
  assert.match(sh, /\/readyz/);
  assert.match(read('deploy/README.md'), /OP_SERVICE_ACCOUNT_TOKEN/);
});
