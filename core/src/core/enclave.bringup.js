// src/core/enclave.bringup.js
// ENCLAVE HOST BRING-UP — the detection + rendering logic behind the bring-up kit.
//
// enclave.js answers "is the POSTURE hardened?" (env dials only). This module
// answers the two questions that come before and after it:
//
//   PREFLIGHT — is each COMPONENT present on this host?      (docker, runsc,
//               vault, keycloak, postgres, opa)               → what's missing
//   VERIFY    — did each dial actually flip GREEN at runtime? (gVisor really
//               enforcing, Vault serving, opa evaluating rego, OIDC discovery
//               reachable, Postgres writing)                  → proof, not config
//
// Both are FAIL-CLOSED: unknown/unprobeable is treated as absent, never as
// present. Every probe is injectable (`run`, `fetchJson`) so the whole thing is
// unit-testable on a laptop that has none of these components installed — which
// is exactly how it is tested.
//
// Dependency-free by design: only node: builtins, and the probes shell out to
// binaries that exist on the enclave host anyway.

import { execFileSync } from 'node:child_process';

// --- the default injectable runner -------------------------------------------
// Returns { ok, stdout } — NEVER throws, so a missing binary reads as absent.
export function defaultRun(argv, { timeout = 5000, input } = {}) {
  try {
    const opts = { stdio: 'pipe', timeout, encoding: 'utf8' };
    if (input !== undefined) opts.input = input;   // `opa eval -I` reads stdin
    const stdout = execFileSync(argv[0], argv.slice(1), opts);
    return { ok: true, stdout: String(stdout || '') };
  } catch (e) {
    // A non-zero exit still carries stdout worth reporting (e.g. `vault status`
    // exits 2 when sealed) — surface it, but mark the probe failed.
    return { ok: false, stdout: String((e && e.stdout) || ''), error: String((e && e.message) || e) };
  }
}

// First non-empty line, trimmed — how every one of these tools reports version.
export function firstLine(s) {
  return String(s || '').split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
}

// --- components ---------------------------------------------------------------
// `unlocks` names the ticket each component turns green, so a missing row in the
// preflight table explains what capability the operator does NOT yet have.
export const COMPONENTS = [
  {
    key: 'node', label: 'Node 20+', required: true,
    probe: ['node', '--version'],
    unlocks: 'the governed core itself',
    install: 'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs',
  },
  {
    key: 'docker', label: 'Docker engine', required: true,
    probe: ['docker', '--version'],
    unlocks: 'the container runtime every other component runs in',
    install: 'curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker "$USER"',
  },
  {
    key: 'runsc', label: 'gVisor (runsc)', required: true,
    // Matches gvisorAvailable() in sandbox.gvisor.js: the binary OR a docker
    // runtime named runsc counts. Checked in that order.
    probe: ['runsc', '--version'],
    altProbe: ['docker', 'info', '--format', '{{json .Runtimes}}'],
    altMatch: /runsc/,
    unlocks: 'T4 — kernel-level tool isolation (SANDBOX_BACKEND=gvisor) + mutation tools',
    install: 'see deploy/enclave/install-components.sh (installs runsc + registers the docker runtime)',
  },
  {
    key: 'vault', label: 'HashiCorp Vault', required: true,
    probe: ['vault', 'version'],
    unlocks: 'T2 — secrets brokered in-perimeter (SECRETS_PROFILE=enclave); an agent never holds a raw secret',
    install: 'see deploy/enclave/install-components.sh (apt repo: hashicorp)',
  },
  {
    key: 'opa', label: 'Open Policy Agent', required: true,
    probe: ['opa', 'version'],
    unlocks: 'T7 — Yes-Gate rules as signed rego bundles (POLICY_ENGINE=opa)',
    install: 'see deploy/enclave/install-components.sh (release binary to /usr/local/bin/opa)',
  },
  {
    key: 'psql', label: 'PostgreSQL client', required: true,
    probe: ['psql', '--version'],
    unlocks: 'durable in-VPC ledger home (DATABASE_URL)',
    install: 'sudo apt-get install -y postgresql-client',
  },
  {
    key: 'keycloak', label: 'Keycloak (container)', required: true,
    // Keycloak is a container, not a binary: presence == an image is pulled.
    probe: ['docker', 'image', 'inspect', 'quay.io/keycloak/keycloak:24.0'],
    unlocks: 'T8 — OIDC identity + per-member onboarding (steward group)',
    install: 'docker pull quay.io/keycloak/keycloak:24.0',
  },
  {
    key: 'curl', label: 'curl', required: false,
    probe: ['curl', '--version'],
    unlocks: 'the Vault transport used by VaultProvider (secrets.vaultprovider.js)',
    install: 'sudo apt-get install -y curl',
  },
];

/**
 * Probe every component. FAIL-CLOSED: any probe that errors, times out, or is
 * unrecognisable counts as missing.
 * @param {Object} [opts]
 * @param {Function} [opts.run] injectable runner (argv) -> { ok, stdout }
 * @param {Array}    [opts.components]
 * @returns {{ok:boolean, missing:string[], components:Array}}
 */
export function preflight(opts = {}) {
  const run = opts.run || defaultRun;
  const list = opts.components || COMPONENTS;
  const components = list.map((c) => {
    let present = false;
    let version = '';
    const r = run(c.probe);
    if (r && r.ok && firstLine(r.stdout)) { present = true; version = firstLine(r.stdout); }
    // Second chance for components with an alternate discovery path (runsc).
    if (!present && c.altProbe) {
      const alt = run(c.altProbe);
      if (alt && alt.ok && c.altMatch && c.altMatch.test(String(alt.stdout || ''))) {
        present = true; version = 'registered as a docker runtime';
      }
    }
    return { key: c.key, label: c.label, required: !!c.required, present, version, unlocks: c.unlocks, install: c.install };
  });
  const missing = components.filter((c) => c.required && !c.present).map((c) => c.key);
  return { ok: missing.length === 0, missing, components };
}

// --- template rendering -------------------------------------------------------
// `${VAR}` substitution over a text template. FAIL-CLOSED: an unresolved
// placeholder is an error, never a silently-empty config value (an empty
// VAULT_ADDR or OIDC_ISSUER would fail open at boot).
export class TemplateError extends Error {
  constructor(missing) {
    super(`template has unresolved variables: ${missing.join(', ')}`);
    this.name = 'TemplateError';
    this.missing = missing;
  }
}

export const TEMPLATE_VAR = /\$\{([A-Z0-9_]+)\}/g;

export function templateVars(tmpl) {
  return [...new Set(String(tmpl).match(TEMPLATE_VAR)?.map((m) => m.slice(2, -1)) || [])];
}

/**
 * Render a config/env template.
 * @param {string} tmpl
 * @param {Object} vars
 * @param {Object} [opts] { allowMissing:boolean }
 */
export function renderTemplate(tmpl, vars = {}, opts = {}) {
  const missing = [];
  const out = String(tmpl).replace(TEMPLATE_VAR, (_m, name) => {
    const v = vars[name];
    if (v === undefined || v === null || v === '') { missing.push(name); return `\${${name}}`; }
    return String(v);
  });
  if (missing.length && !opts.allowMissing) throw new TemplateError([...new Set(missing)]);
  return out;
}

// --- runtime verification -----------------------------------------------------
// Each check PROVES a dial rather than reading config. `prove` gets the injected
// { run, env } and returns { ok, detail }. Never throws — a thrown probe is a
// failed check (fail-closed).
export const VERIFY_CHECKS = [
  {
    key: 'gvisor-enforcing',
    label: 'gVisor genuinely enforcing',
    // The canonical proof: inside a runsc container the guest kernel IS gVisor
    // and says so in dmesg. A runc container prints the host kernel instead, so
    // this cannot pass by accident on a fallback sandbox.
    prove: ({ run }) => {
      const r = run(['docker', 'run', '--rm', '--runtime=runsc', 'alpine', 'dmesg'], { timeout: 60000 });
      const ok = !!r.ok && /gvisor/i.test(String(r.stdout || ''));
      return { ok, detail: ok ? 'runsc guest kernel confirmed via dmesg' : 'no gVisor guest kernel — the sandbox would fall back to ProcessSandbox' };
    },
  },
  {
    key: 'vault-serving',
    label: 'Vault serving + unsealed',
    prove: ({ run, env }) => {
      const addr = env.VAULT_ADDR || 'http://127.0.0.1:8200';
      const r = run(['curl', '-sS', '--max-time', '10', `${addr}/v1/sys/health`], { timeout: 15000 });
      let body = null;
      try { body = JSON.parse(String(r.stdout || '')); } catch { /* fail-closed below */ }
      const ok = !!body && body.initialized === true && body.sealed === false;
      return { ok, detail: ok ? `initialized + unsealed at ${addr}` : `not ready at ${addr} (init/unseal is a HUMAN step — see HUMAN-STEPS.md)` };
    },
  },
  {
    key: 'opa-evaluating',
    label: 'opa evaluating the rego rule',
    // Proves the SAME rule the JS engine uses returns the SAME decision from
    // rego — an irreversible verb must come back irreversible.
    prove: ({ run, env }) => {
      const dir = env.POLICY_DIR || 'policy';
      const r = run(['opa', 'eval', '--format', 'json', '-I', '-d', dir, 'data.aigov.gate.decision'], { timeout: 20000, input: JSON.stringify({ intent: 'publish the report' }) });
      let v = null;
      try {
        const p = JSON.parse(String(r.stdout || ''));
        v = p?.result?.[0]?.expressions?.[0]?.value;
      } catch { /* fail-closed below */ }
      const ok = !!v && v.irreversible === true && v.requiresHumanGate === true;
      return { ok, detail: ok ? 'rego agrees: "publish" is irreversible + human-gated' : 'opa did not return the expected decision document' };
    },
  },
  {
    key: 'oidc-discovery',
    label: 'OIDC discovery reachable',
    prove: ({ run, env }) => {
      const iss = env.OIDC_ISSUER;
      if (!iss) return { ok: false, detail: 'OIDC_ISSUER not set' };
      const r = run(['curl', '-sS', '--max-time', '10', `${iss}/.well-known/openid-configuration`], { timeout: 15000 });
      let body = null;
      try { body = JSON.parse(String(r.stdout || '')); } catch { /* fail-closed below */ }
      const ok = !!body && typeof body.issuer === 'string' && body.issuer === iss;
      return { ok, detail: ok ? `issuer matches (${iss})` : `discovery did not return issuer=${iss}` };
    },
  },
  {
    key: 'postgres-ledger',
    label: 'Postgres accepting ledger writes',
    // Round-trips a real row through the same table PgStore uses, then removes
    // it — proof of write access, not just connectivity.
    prove: ({ run, env }) => {
      const url = env.DATABASE_URL;
      if (!url) return { ok: false, detail: 'DATABASE_URL not set' };
      const sql = "CREATE TABLE IF NOT EXISTS aigov_ledger (seq BIGSERIAL PRIMARY KEY, signed JSONB NOT NULL, ts TIMESTAMPTZ DEFAULT now()); "
        + "INSERT INTO aigov_ledger(signed) VALUES ('{\"probe\":true}'::jsonb); "
        + "DELETE FROM aigov_ledger WHERE signed @> '{\"probe\":true}'::jsonb; SELECT 'ledger-ok';";
      const r = run(['psql', url, '-tAc', sql], { timeout: 20000 });
      const ok = !!r.ok && /ledger-ok/.test(String(r.stdout || ''));
      return { ok, detail: ok ? 'write + read + delete round-trip succeeded' : 'could not round-trip a row (check DATABASE_URL and grants)' };
    },
  },
];

/**
 * Run every runtime proof. FAIL-CLOSED: a throwing prove() is a failed check.
 * @param {Object} [opts] { run, env, checks }
 */
export function verify(opts = {}) {
  const run = opts.run || defaultRun;
  const env = opts.env || process.env;
  const list = opts.checks || VERIFY_CHECKS;
  const checks = list.map((c) => {
    let r;
    try { r = c.prove({ run, env }); }
    catch (e) { r = { ok: false, detail: `probe threw: ${String((e && e.message) || e)}` }; }
    return { key: c.key, label: c.label, ok: !!(r && r.ok), detail: (r && r.detail) || '' };
  });
  const failures = checks.filter((c) => !c.ok).map((c) => c.key);
  return { ok: failures.length === 0, failures, checks };
}
