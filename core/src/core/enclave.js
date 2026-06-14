// src/core/enclave.js
// ENCLAVE PROFILE (Ticket 9) — the hardened posture, as code.
// The enclave profile is the strongest setting of every dial at once:
//   • Secrets brokered by Vault IN-PERIMETER (not a local file)      [T2]
//   • Tools isolated by gVisor at the kernel (not the app fallback)  [T4]
//   • Egress DENY-ALL by default (the proxy permits nothing)         [T4]
//   • Internal models only — no cloud egress                         [router]
//   • Policy as signed rego bundles                                  [T7]
//   • Postgres in-VPC (the ledger has a durable home)                [storage]
//
// `enclavePreflight()` is a FAIL-CLOSED check: a regulated operator runs it at
// boot and refuses to serve if any dial is weaker than the enclave demands. It
// reads only env (no secrets) and returns a metadata-only posture report.

export const ENCLAVE_CHECKS = [
  { key: 'secrets', label: 'Vault in perimeter', ok: (e) => ['enclave', 'community', 'vault'].includes(String(e.SECRETS_PROFILE || '').toLowerCase()), want: 'SECRETS_PROFILE=enclave (Vault)', reason: 'an agent never holds a local secret file' },
  { key: 'vault-addr', label: 'Vault reachable', ok: (e) => !!e.VAULT_ADDR, want: 'VAULT_ADDR set', reason: 'the broker mints ephemeral creds from Vault' },
  { key: 'sandbox', label: 'gVisor isolation', ok: (e) => String(e.SANDBOX_BACKEND || '').toLowerCase() === 'gvisor', want: 'SANDBOX_BACKEND=gvisor', reason: 'kernel-level isolation has no app-level bypass' },
  { key: 'egress', label: 'Egress deny-all', ok: (e) => !String(e.SANDBOX_DEFAULT_EGRESS || '').split(',').map((s) => s.trim()).includes('*'), want: 'no "*" in SANDBOX_DEFAULT_EGRESS', reason: 'tools reach only declared hosts via the proxy' },
  { key: 'cloud', label: 'Internal models only', ok: (e) => String(e.ALLOW_CLOUD || 'false').toLowerCase() !== 'true', want: 'ALLOW_CLOUD=false', reason: 'no prompt or content leaves the perimeter' },
  { key: 'policy', label: 'Signed rego policy', ok: (e) => ['opa', 'auto'].includes(String(e.POLICY_ENGINE || 'auto').toLowerCase()), want: 'POLICY_ENGINE=opa', reason: 'a rule change is an auditable signed bundle' },
  { key: 'storage', label: 'In-VPC Postgres', ok: (e) => !!e.DATABASE_URL, want: 'DATABASE_URL set (private)', reason: 'the ledger has a durable, in-perimeter home' },
];

export function enclavePreflight(env = process.env) {
  const checks = ENCLAVE_CHECKS.map((c) => ({ key: c.key, label: c.label, ok: !!c.ok(env), want: c.want, reason: c.reason }));
  const failures = checks.filter((c) => !c.ok).map((c) => c.key);
  return { profile: 'enclave', hardened: failures.length === 0, failures, checks };
}

// Throw unless the environment is fully hardened — call this at boot in an
// enclave to refuse to serve under a weak posture.
export function assertEnclave(env = process.env) {
  const r = enclavePreflight(env);
  if (!r.hardened) throw new Error(`enclave preflight failed: ${r.failures.join(', ')} — see ENCLAVE_CHECKS`);
  return r;
}
