// src/core/secrets.factory.js
// CONFIG-ONLY provider swap (Ticket 2 acceptance: "swapping providers needs no
// code change"). Every call site asks the factory for a SecretsProvider and gets
// the right backend for the environment — the gate/govapi/tools never branch.
//
//   PROFILE          backend         where
//   ---------------  --------------  ---------------------------------------
//   lab    (default) FileProvider    laptop / dev — local gitignored store
//   community        VaultProvider   shared enclave — HashiCorp Vault
//   enclave          VaultProvider   regulated air-gapped — Vault in perimeter
//
// Selected by opts.profile, then $SECRETS_PROFILE, then $PROFILE, else 'lab'.

import { FileProvider } from './secrets.fileprovider.js';
import { VaultProvider } from './secrets.vaultprovider.js';
import { OnePasswordProvider } from './secrets.onepassword.js';
import { opAvailable } from './op.js';

export const PROFILES = {
  lab: FileProvider,
  file: FileProvider,
  community: VaultProvider,
  enclave: VaultProvider,
  vault: VaultProvider,
  '1password': OnePasswordProvider,
  onepassword: OnePasswordProvider,
  op: OnePasswordProvider,
};

// The broker backend behind each profile — for at-a-glance reporting (/status).
const BACKEND = {
  lab: 'file', file: 'file',
  community: 'vault', enclave: 'vault', vault: 'vault',
  '1password': '1password', onepassword: '1password', op: '1password',
};

export function resolveProfile(opts = {}) {
  return String(opts.profile || process.env.SECRETS_PROFILE || process.env.PROFILE || 'lab').toLowerCase();
}

// Whether the `op` binary is installed. Static for the process lifetime, so we
// cache it — /status must never shell out a subprocess per request.
let _opInstalled;
function opInstalledCached() {
  if (_opInstalled === undefined) _opInstalled = opAvailable();
  return _opInstalled;
}

// A safe, secret-free summary of the active broker — surfaced in /status so the
// lab→prod cutover is visible without SSH. Reports the profile and backend, and
// for remote backends whether the runtime is wired (binary present, auth set) —
// never a token, address-only for Vault.
export function secretsPosture(opts = {}) {
  const profile = resolveProfile(opts);
  const backend = BACKEND[profile] || 'unknown';
  const out = { profile, backend };
  if (backend === '1password') {
    out.vault = process.env.OP_VAULT || 'AiGovOps';
    out.opInstalled = opInstalledCached();
    out.authConfigured = !!process.env.OP_SERVICE_ACCOUNT_TOKEN;   // token presence only
  } else if (backend === 'vault') {
    out.addr = process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
  }
  return out;
}

export function createSecretsProvider(opts = {}) {
  const profile = resolveProfile(opts);
  const Provider = PROFILES[profile];
  if (!Provider) throw new Error(`unknown secrets profile '${profile}' (expected one of: ${Object.keys(PROFILES).join(', ')})`);
  return new Provider(opts);
}
