// test/enclave.bringup.test.mjs
// The enclave bring-up kit: component detection is fail-closed, template
// rendering refuses to fail open, and every runtime proof is exercised against
// injected fakes — so the whole kit is testable on a laptop that has none of
// gVisor, Vault, opa, Keycloak or Postgres installed.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const {
  COMPONENTS, preflight, verify, VERIFY_CHECKS,
  renderTemplate, templateVars, TemplateError, firstLine, defaultRun,
} = await import('../src/core/enclave.bringup.js');

// A runner that reports every probe as absent.
const NOTHING = () => ({ ok: false, stdout: '', error: 'not found' });
// A runner that reports everything present.
const EVERYTHING = () => ({ ok: true, stdout: 'v1.2.3\n' });

// --- component detection ------------------------------------------------------

test('preflight reports every required component missing on a bare host', () => {
  const r = preflight({ run: NOTHING });
  assert.strictEqual(r.ok, false);
  for (const c of COMPONENTS.filter((c) => c.required)) {
    assert.ok(r.missing.includes(c.key), `${c.key} should be reported missing`);
  }
  // Optional components are never counted as blocking.
  assert.ok(!r.missing.includes('curl'), 'optional curl must not block');
});

test('preflight passes when every probe answers', () => {
  const r = preflight({ run: EVERYTHING });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.missing, []);
  assert.ok(r.components.every((c) => c.present));
});

test('every component explains what it unlocks', () => {
  for (const c of preflight({ run: NOTHING }).components) {
    assert.ok(c.unlocks && c.unlocks.length > 8, `${c.key} must say what it unlocks`);
    assert.ok(c.install, `${c.key} must say how to install it`);
  }
});

test('runsc is detected via the docker runtime list when the binary is absent', () => {
  // Mirrors gvisorAvailable(): no runsc binary, but docker has the runtime.
  const run = (argv) => {
    if (argv[0] === 'runsc') return { ok: false, stdout: '' };
    if (argv[0] === 'docker' && argv[1] === 'info') return { ok: true, stdout: '{"runc":{},"runsc":{"path":"/usr/local/bin/runsc"}}' };
    return { ok: false, stdout: '' };
  };
  const r = preflight({ run, components: COMPONENTS.filter((c) => c.key === 'runsc') });
  assert.strictEqual(r.ok, true, 'runsc should be found via the docker runtime list');
  assert.match(r.components[0].version, /docker runtime/);
});

test('detection is FAIL-CLOSED: a probe that succeeds but says nothing is not present', () => {
  const r = preflight({ run: () => ({ ok: true, stdout: '   \n  ' }) });
  assert.strictEqual(r.ok, false, 'empty output must not count as installed');
});

test('defaultRun never throws on a missing binary', () => {
  const r = defaultRun(['definitely-not-a-real-binary-aigov']);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(typeof r.stdout, 'string');
});

test('firstLine picks the first non-empty trimmed line', () => {
  assert.strictEqual(firstLine('\n\n  Docker version 26.1.0  \nmore'), 'Docker version 26.1.0');
  assert.strictEqual(firstLine(''), '');
});

// --- template rendering -------------------------------------------------------

const TMPL_PATH = path.resolve(__dirname, '..', '..', 'deploy', 'enclave', 'templates', 'enclave.env.tmpl');

test('renderTemplate substitutes every variable', () => {
  const out = renderTemplate('A=${ONE}\nB=${TWO}', { ONE: 'x', TWO: 'y' });
  assert.strictEqual(out, 'A=x\nB=y');
});

test('renderTemplate is FAIL-CLOSED on a missing variable', () => {
  assert.throws(() => renderTemplate('A=${ONE}\nB=${TWO}', { ONE: 'x' }), TemplateError);
  try { renderTemplate('A=${ONE}', {}); }
  catch (e) { assert.deepStrictEqual(e.missing, ['ONE']); }
});

test('renderTemplate treats an EMPTY value as missing (an empty VAULT_ADDR fails open)', () => {
  assert.throws(() => renderTemplate('VAULT_ADDR=${VAULT_ADDR}', { VAULT_ADDR: '' }), TemplateError);
});

test('the shipped enclave.env template renders with the documented defaults', () => {
  const tmpl = fs.readFileSync(TMPL_PATH, 'utf8');
  const vars = {
    VAULT_ADDR: 'https://vault.internal:8200', VAULT_KV_MOUNT: 'secret',
    SANDBOX_IMAGE: 'node:20-alpine', SANDBOX_EGRESS_NET: 'aigov-egress',
    POLICY_DIR: '/app/core/policy',
    OIDC_ISSUER: 'https://id.internal/realms/aigovops', OIDC_CLIENT_ID: 'aigov-console',
    OIDC_REDIRECT_URI: 'https://console.internal/auth/oidc/callback', OIDC_STEWARD_GROUP: 'steward',
    DATABASE_URL: 'postgres://aigov@db.internal:5432/aigov',
    PORT: '8787', LEDGER_DIR: '/app/core/ledger', KEYS_DIR: '/app/core/keys',
  };
  const out = renderTemplate(tmpl, vars);            // throws if any var is unaccounted for
  assert.match(out, /^SECRETS_PROFILE=enclave$/m);
  assert.match(out, /^SANDBOX_BACKEND=gvisor$/m);
  assert.match(out, /^POLICY_ENGINE=opa$/m);
  assert.match(out, /^ALLOW_CLOUD=false$/m);
  assert.match(out, /^SANDBOX_DEFAULT_EGRESS=$/m, 'egress must render deny-all (empty)');
  assert.ok(!/\$\{/.test(out), 'no unresolved placeholders may survive');
});

test('render-env.sh supplies every variable the template needs', () => {
  const tmpl = fs.readFileSync(TMPL_PATH, 'utf8');
  const sh = fs.readFileSync(path.resolve(__dirname, '..', '..', 'deploy', 'enclave', 'render-env.sh'), 'utf8');
  for (const v of templateVars(tmpl)) {
    assert.match(sh, new RegExp(`export ${v}=`), `render-env.sh must export ${v}`);
  }
});

test('the rendered template carries NO secret values', () => {
  const tmpl = fs.readFileSync(TMPL_PATH, 'utf8');
  // The four secrets must appear only as commented placeholders, never assigned.
  for (const k of ['VAULT_TOKEN', 'OIDC_CLIENT_SECRET', 'SESSION_SECRET', 'STEWARD_TOKEN']) {
    assert.ok(!new RegExp(`^${k}=.+`, 'm').test(tmpl), `${k} must not be assigned in the template`);
    assert.ok(new RegExp(`#\\s*${k}=`, 'm').test(tmpl), `${k} must be present as a commented placeholder`);
  }
});

// --- runtime verification -----------------------------------------------------

// A fake host where every dial is genuinely green.
const GREEN_ENV = {
  VAULT_ADDR: 'https://vault.internal:8200',
  OIDC_ISSUER: 'https://id.internal/realms/aigovops',
  DATABASE_URL: 'postgres://aigov@db.internal:5432/aigov',
  POLICY_DIR: 'policy',
};
const greenRun = (argv) => {
  const a = argv.join(' ');
  if (a.includes('--runtime=runsc')) return { ok: true, stdout: '[  0.000000] Starting gVisor...\n' };
  if (a.includes('/v1/sys/health')) return { ok: true, stdout: JSON.stringify({ initialized: true, sealed: false }) };
  if (argv[0] === 'opa') return { ok: true, stdout: JSON.stringify({ result: [{ expressions: [{ value: { irreversible: true, requiresHumanGate: true, requiredLevel: 'act', reasons: ['matched irreversible verb: publish'] } }] }] }) };
  if (a.includes('openid-configuration')) return { ok: true, stdout: JSON.stringify({ issuer: GREEN_ENV.OIDC_ISSUER }) };
  if (argv[0] === 'psql') return { ok: true, stdout: 'ledger-ok\n' };
  return { ok: false, stdout: '' };
};

test('verify goes green when every dial genuinely proves out', () => {
  const r = verify({ run: greenRun, env: GREEN_ENV });
  assert.strictEqual(r.ok, true, JSON.stringify(r.failures));
  assert.strictEqual(r.checks.length, VERIFY_CHECKS.length);
});

test('verify fails every check on a host where nothing is running', () => {
  const r = verify({ run: NOTHING, env: GREEN_ENV });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.failures.length, VERIFY_CHECKS.length, 'all checks must fail closed');
});

test('gVisor check does NOT pass on a runc fallback', () => {
  // A runc container prints the HOST kernel — no gVisor banner. This is the
  // check that catches "SANDBOX_BACKEND=gvisor" silently falling back.
  const run = () => ({ ok: true, stdout: '[    0.000000] Linux version 6.5.0-generic (Ubuntu)\n' });
  const r = verify({ run, env: GREEN_ENV, checks: VERIFY_CHECKS.filter((c) => c.key === 'gvisor-enforcing') });
  assert.strictEqual(r.ok, false, 'a host kernel banner must not count as gVisor');
});

test('vault check fails closed when sealed', () => {
  const run = () => ({ ok: true, stdout: JSON.stringify({ initialized: true, sealed: true }) });
  const r = verify({ run, env: GREEN_ENV, checks: VERIFY_CHECKS.filter((c) => c.key === 'vault-serving') });
  assert.strictEqual(r.ok, false, 'a sealed Vault is not serving');
});

test('opa check fails when rego disagrees with the JS rule', () => {
  const run = () => ({ ok: true, stdout: JSON.stringify({ result: [{ expressions: [{ value: { irreversible: false } }] }] }) });
  const r = verify({ run, env: GREEN_ENV, checks: VERIFY_CHECKS.filter((c) => c.key === 'opa-evaluating') });
  assert.strictEqual(r.ok, false, '"publish" must come back irreversible');
});

test('OIDC check fails on an issuer mismatch (a misconfigured redirect target)', () => {
  const run = () => ({ ok: true, stdout: JSON.stringify({ issuer: 'https://evil.example/realms/aigovops' }) });
  const r = verify({ run, env: GREEN_ENV, checks: VERIFY_CHECKS.filter((c) => c.key === 'oidc-discovery') });
  assert.strictEqual(r.ok, false, 'the discovered issuer must equal OIDC_ISSUER');
});

test('checks that need env fail closed when it is absent', () => {
  const r = verify({ run: greenRun, env: {} });
  assert.ok(r.failures.includes('oidc-discovery'), 'no OIDC_ISSUER → fail');
  assert.ok(r.failures.includes('postgres-ledger'), 'no DATABASE_URL → fail');
});

test('a throwing probe is a FAILED check, never a passing one', () => {
  const run = () => { throw new Error('boom'); };
  const r = verify({ run, env: GREEN_ENV });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.failures.length, VERIFY_CHECKS.length, 'every check must fail');
  // The checks that actually reach the runner must report WHY, not fail silently.
  const threw = r.checks.filter((c) => /probe threw: boom/.test(c.detail));
  assert.ok(threw.length > 0, 'a thrown probe must surface its error in the detail');
  assert.ok(r.checks.every((c) => c.ok === false), 'no check may report ok on a throwing host');
});

// --- the kit's own shape ------------------------------------------------------

test('the kit ships the scripts the runbook and human checklist reference', () => {
  const root = path.resolve(__dirname, '..', '..');
  for (const f of [
    'deploy/enclave/install-components.sh',
    'deploy/enclave/render-env.sh',
    'deploy/enclave/enclave-up.sh',
    'deploy/enclave/HUMAN-STEPS.md',
    'deploy/enclave/templates/enclave.env.tmpl',
    'plan/enclave-host-bringup.md',
    'core/scripts/enclave-preflight.mjs',
    'core/scripts/enclave-verify.mjs',
  ]) {
    assert.ok(fs.existsSync(path.join(root, f)), `missing kit file: ${f}`);
  }
});

test('the core stays dependency-free by default', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
  assert.deepStrictEqual(pkg.dependencies, {}, 'the enclave kit must not add a runtime dependency');
});
