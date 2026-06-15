// src/core/op.js
// 1PASSWORD CLI BRIDGE (dependency-free). The single place the core shells out to
// `op` to resolve secrets by reference (op://Vault/Item/field). Every backend
// credential (Postgres, Vault, Keycloak, OIDC, cloud-model keys) is stored in
// 1Password and read through here — never written to a committed file.
//
// Auth model (the operator's setup, NOT done here): either an interactive
// `op signin`, or a **service-account token** in `OP_SERVICE_ACCOUNT_TOKEN`
// (the no-paste, automatable path — see deploy/README). This module NEVER
// triggers an interactive prompt in tests: a transport is injectable, and the
// default runner only runs when `op` is actually configured.

import { execFileSync } from 'node:child_process';

// Is the `op` binary present? (Presence ≠ signed in; reads still fail closed.)
export function opAvailable() {
  try { execFileSync('op', ['--version'], { stdio: 'pipe', timeout: 5000 }); return true; }
  catch { return false; }
}

// True when op can run non-interactively (a service-account token is set). The
// safe mode for automation — no biometric/desktop prompt.
export function opAutomatable() {
  return !!process.env.OP_SERVICE_ACCOUNT_TOKEN && opAvailable();
}

const OP_REF = /^op:\/\/[^/]+\/[^/]+\/.+$/;
export function isOpRef(ref) { return typeof ref === 'string' && OP_REF.test(ref); }

// Read a single secret by op:// reference. `run` is injectable for tests; the
// default shells `op read` (only when configured — otherwise throws, fail-closed).
export function opRead(ref, { run } = {}) {
  if (!isOpRef(ref)) throw new Error(`not an op:// reference: ${ref}`);
  const runner = run || defaultRunner;
  return String(runner(['read', '--no-newline', ref])).trim();
}

function defaultRunner(args) {
  if (!opAvailable()) throw new Error('the 1Password CLI (op) is not installed');
  // Require non-interactive auth so automation never hangs on a prompt.
  if (!process.env.OP_SERVICE_ACCOUNT_TOKEN) {
    throw new Error('op is not configured for automation — set OP_SERVICE_ACCOUNT_TOKEN (service account) or run `op signin` for interactive use');
  }
  return execFileSync('op', args, { encoding: 'utf8', timeout: 15_000 });
}

// Resolve an env value that may be a literal OR an op:// reference. Used by the
// boot path so any config var can transparently come from 1Password.
export function resolveSecret(value, opts) {
  return isOpRef(value) ? opRead(value, opts) : value;
}
