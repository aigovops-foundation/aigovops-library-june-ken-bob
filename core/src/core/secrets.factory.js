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

export const PROFILES = {
  lab: FileProvider,
  file: FileProvider,
  community: VaultProvider,
  enclave: VaultProvider,
  vault: VaultProvider,
};

export function resolveProfile(opts = {}) {
  return String(opts.profile || process.env.SECRETS_PROFILE || process.env.PROFILE || 'lab').toLowerCase();
}

export function createSecretsProvider(opts = {}) {
  const profile = resolveProfile(opts);
  const Provider = PROFILES[profile];
  if (!Provider) throw new Error(`unknown secrets profile '${profile}' (expected one of: ${Object.keys(PROFILES).join(', ')})`);
  return new Provider(opts);
}
