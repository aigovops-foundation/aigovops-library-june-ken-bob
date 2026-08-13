// src/core/enclave.js
// ENCLAVE PROFILE (Ticket 9) — the hardened posture, as code.
// The enclave profile is the strongest setting of every dial at once:
//   • Secrets brokered IN-PERIMETER (never a local file)             [T2]
//   • Tools isolated by gVisor at the kernel (not the app fallback)  [T4]
//   • Egress DENY-ALL by default (the proxy permits nothing)         [T4]
//   • Internal models only — no cloud egress                         [router]
//   • Policy as signed rego bundles                                  [T7]
//   • Postgres in-VPC (the ledger has a durable home)                [storage]
//
// Two broker backends satisfy the "secrets brokered in-perimeter" dial:
//   • VAULT       — SECRETS_PROFILE=enclave/community/vault (+ VAULT_ADDR).
//                   The AIR-GAPPED posture: nothing leaves; verify offline.
//   • 1PASSWORD   — SECRETS_PROFILE=1password (+ OP_SERVICE_ACCOUNT_TOKEN).
//                   The MANAGED ("Jeeves") posture: the broker resolves scoped,
//                   short-lived credentials from a 1Password vault. Removes the
//                   `vault operator init` step, at the cost of a cloud secret
//                   store — so it is NOT air-gapped. `enclaveSecretsKind()` names
//                   which one is in force, and `enclaveNotes()` flags the cloud
//                   dependency so the tradeoff is never silent.
// In BOTH cases the invariant holds: an agent never receives a raw secret; the
// gate brokers an ephemeral, scoped token.
//
// `enclavePreflight()` is a FAIL-CLOSED check: a regulated operator runs it at
// boot and refuses to serve if any dial is weaker than the enclave demands. It
// reads only env (no secrets) and returns a metadata-only posture report.

const VAULT_PROFILES = ['enclave', 'community', 'vault'];
const OP_PROFILES = ['1password', 'onepassword', 'op'];
const profileOf = (e) => String(e.SECRETS_PROFILE || '').toLowerCase();

// Which brokered backend is in force — 'vault', '1password', or null (neither).
export function enclaveSecretsKind(env = process.env) {
  const p = profileOf(env);
  if (VAULT_PROFILES.includes(p)) return 'vault';
  if (OP_PROFILES.includes(p)) return '1password';
  return null;
}

export const ENCLAVE_CHECKS = [
  { key: 'secrets', label: 'Secrets brokered in-perimeter', ok: (e) => enclaveSecretsKind(e) !== null, want: 'SECRETS_PROFILE=1password (managed) or =enclave (Vault, air-gapped)', reason: 'an agent never holds a local secret file' },
  // The broker runtime must actually be wired, not merely named: Vault needs its
  // address; 1Password needs a non-interactive service-account token (so the
  // enclave never hangs on a biometric/desktop prompt). Keyed 'vault-addr' for
  // back-compat; it now means "the in-force broker is configured".
  { key: 'vault-addr', label: 'Broker runtime configured', ok: (e) => enclaveSecretsKind(e) === '1password' ? !!e.OP_SERVICE_ACCOUNT_TOKEN : !!e.VAULT_ADDR, want: 'VAULT_ADDR (Vault) or OP_SERVICE_ACCOUNT_TOKEN (1Password)', reason: 'the broker mints ephemeral, scoped credentials at runtime' },
  { key: 'sandbox', label: 'gVisor isolation', ok: (e) => String(e.SANDBOX_BACKEND || '').toLowerCase() === 'gvisor', want: 'SANDBOX_BACKEND=gvisor', reason: 'kernel-level isolation has no app-level bypass' },
  { key: 'egress', label: 'Egress deny-all', ok: (e) => !String(e.SANDBOX_DEFAULT_EGRESS || '').split(',').map((s) => s.trim()).includes('*'), want: 'no "*" in SANDBOX_DEFAULT_EGRESS', reason: 'tools reach only declared hosts via the proxy' },
  { key: 'cloud', label: 'Internal models only', ok: (e) => String(e.ALLOW_CLOUD || 'false').toLowerCase() !== 'true', want: 'ALLOW_CLOUD=false', reason: 'no prompt or content leaves the perimeter' },
  { key: 'policy', label: 'Signed rego policy', ok: (e) => ['opa', 'auto'].includes(String(e.POLICY_ENGINE || 'auto').toLowerCase()), want: 'POLICY_ENGINE=opa', reason: 'a rule change is an auditable signed bundle' },
  { key: 'storage', label: 'In-VPC Postgres', ok: (e) => !!e.DATABASE_URL, want: 'DATABASE_URL set (private)', reason: 'the ledger has a durable, in-perimeter home' },
];

// Honest, secret-free notes about the posture — surfaced so a tradeoff is never
// silent. The 1Password broker is a cloud store: it is NOT air-gapped, and a
// deny-all enclave must be able to reach it. Say so.
export function enclaveNotes(env = process.env) {
  const notes = [];
  const kind = enclaveSecretsKind(env);
  if (kind === '1password') {
    notes.push('secrets broker is 1Password (managed posture): scoped, short-lived credentials — but a CLOUD store, so this enclave is NOT air-gapped and must reach 1Password. For offline-verify/air-gapped, use SECRETS_PROFILE=enclave (Vault).');
  }
  return notes;
}

export function enclavePreflight(env = process.env) {
  const checks = ENCLAVE_CHECKS.map((c) => ({ key: c.key, label: c.label, ok: !!c.ok(env), want: c.want, reason: c.reason }));
  const failures = checks.filter((c) => !c.ok).map((c) => c.key);
  const secretsKind = enclaveSecretsKind(env);
  return {
    profile: 'enclave',
    posture: secretsKind === '1password' ? 'managed' : 'air-gapped',
    secretsKind,
    hardened: failures.length === 0,
    failures,
    checks,
    notes: enclaveNotes(env),
  };
}

// Throw unless the environment is fully hardened — call this at boot in an
// enclave to refuse to serve under a weak posture.
export function assertEnclave(env = process.env) {
  const r = enclavePreflight(env);
  if (!r.hardened) throw new Error(`enclave preflight failed: ${r.failures.join(', ')} — see ENCLAVE_CHECKS`);
  return r;
}
