// src/core/secrets.shared.js
// SINGLE SOURCE OF TRUTH for the SecretsProvider contract (Ticket 0).
// Environment-neutral (no Node, browser, fs, or crypto APIs) so the *contract*
// is defined once and every backend implements the same shape:
//   • FileProvider (lab)        — secrets.fileprovider.js
//   • VaultProvider (community) — later, Ticket 2; config-only swap via PROFILE
//
// Principle (Rev 2026.06): define the safety contract once at the interface;
// enforce it with the strongest backend each environment allows.
//
// THE BROKERING PATTERN (mint → scope → expire → log → revoke):
//   The gate is the ONLY caller. It asks the provider to `issue` a short-lived,
//   scoped, opaque `token`. A sandboxed tool receives that token and presents it
//   back (`redeem`) to act against a target — it never sees the master secret.
//   Every issue/renew/revoke emits exactly one signed, metadata-only receipt.

/**
 * @typedef {Object} Grant
 * @property {string} grantId    opaque grant id
 * @property {string} scope      logical secret name (e.g. 'github-deploy')
 * @property {string} token      opaque, short-lived credential — NEVER the master secret
 * @property {number} issuedAt   epoch ms
 * @property {number} expiresAt  epoch ms; use past this fails closed
 * @property {string} ref        stable registry reference, e.g. 'secret:github-deploy'
 *
 * @typedef {Object} Record
 * @property {string} ref
 * @property {string} owner
 * @property {string} scope
 * @property {?string} lastRotated  ISO date or null — NO secret material
 * @property {number} activeGrants  count of live (non-revoked, non-expired) grants
 */

// A stable, non-secret reference for a scope. Shaped like the op:// refs the
// VaultProvider will use, so callers don't change when the backend swaps.
export function refFor(scope) {
  return `secret:${scope}`;
}

// Pure TTL check — the fail-closed rule lives here so every backend agrees.
export function isExpired(grant, nowMs) {
  return !grant || typeof grant.expiresAt !== 'number' || nowMs >= grant.expiresAt;
}

// Why a token can't be used right now, or null if it's good. Backends call this
// so "fail closed" means the same thing everywhere.
export function denyReason(grant, nowMs) {
  if (!grant) return 'unknown-token';
  if (grant.revoked) return 'revoked';
  if (isExpired(grant, nowMs)) return 'expired';
  return null;
}

// Build the METADATA-ONLY receipt detail for one broker op. By construction it
// carries no secret material — only the shape of what happened. Backends pass
// this straight to Beacon as the receipt's `detail`.
export function receiptDetail({ op, scope, ttlSeconds, expiresAt, ref, requestedBy, decision }) {
  return { op, scope, ttlSeconds, expiresAt, ref, requestedBy, decision };
}

// Typed errors so callers (and tests) can assert the fail-closed path precisely.
export class SecretsError extends Error {
  constructor(reason, message) { super(message || reason); this.name = 'SecretsError'; this.reason = reason; }
}

// The contract. Backends extend this; the gate codes against THIS shape only.
// Methods throw until a backend implements them — so an unfinished adapter fails
// loudly rather than silently doing nothing.
export class SecretsProvider {
  /** @returns {Grant} */
  issue(/* scope, ttlSeconds, requestedBy */) { throw new SecretsError('not-implemented', 'issue() not implemented'); }
  /** @returns {Grant} */
  renew(/* grantId, ttlSeconds */) { throw new SecretsError('not-implemented', 'renew() not implemented'); }
  /** @returns {{revoked: true}} */
  revoke(/* grantId */) { throw new SecretsError('not-implemented', 'revoke() not implemented'); }
  /** @returns {Record} — registry view, NO secret material */
  describe(/* ref */) { throw new SecretsError('not-implemented', 'describe() not implemented'); }
}
