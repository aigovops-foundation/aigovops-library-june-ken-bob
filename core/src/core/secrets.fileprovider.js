// src/core/secrets.fileprovider.js
// FILEPROVIDER — the `lab` adapter for the SecretsProvider contract.
// Backing store is a LOCAL, GITIGNORED file (secrets.local.json) or, later, the
// OS keychain. It proves the whole brokering pattern end-to-end without Vault:
//   mint → scope → expire → log → revoke.
//
// Guarantees:
//   • the issued `token` is a fresh opaque id, NEVER the master secret;
//   • a token past expiresAt fails closed; a revoked token fails closed;
//   • every issue/renew/revoke emits exactly ONE signed, metadata-only Beacon
//     receipt (no secret material ever reaches the ledger);
//   • describe() returns registry metadata only.
//
// Grants are kept in memory (ephemeral by design — that's the point of a broker).
// VaultProvider (Ticket 2) implements the SAME contract against real dynamic
// secrets; swapping is config-only (PROFILE), no caller changes.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import * as beacon from './beacon.js';
import { MemoryStore } from './statestore.js';
import { SecretsProvider, SecretsError, refFor, denyReason, isExpired, receiptDetail } from './secrets.shared.js';

export class FileProvider extends SecretsProvider {
  /**
   * @param {Object} [opts]
   * @param {string}   [opts.storePath]  backing store path (default $SECRETS_FILE or ./secrets.local.json)
   * @param {Function} [opts.now]        clock: () => epoch ms (injectable for tests)
   * @param {Function} [opts.randomId]   id minter: () => string (injectable for tests)
   * @param {Function} [opts.emit]       receipt emitter (default beacon.emit; injectable for tests)
   */
  constructor(opts = {}) {
    super();
    this.storePath = opts.storePath || process.env.SECRETS_FILE || path.resolve('secrets.local.json');
    this.now = opts.now || (() => Date.now());
    this.randomId = opts.randomId || (() => crypto.randomBytes(18).toString('hex'));
    this.emit = opts.emit || ((meta) => beacon.emit(meta));
    // A4b: brokered grants live in the SHARED state store (default a per-instance
    // MemoryStore = single-node, unchanged) so a token issued on one replica can be
    // redeemed on another — the broker is no longer per-process. Same security
    // semantics (opaque token, expiry, revoke-by-flag, one receipt per op); only
    // the backing store moved. useStore() late-binds the cluster store at boot.
    this.gstore = opts.store || new MemoryStore();
    this._active = new Map();   // scope -> count, metadata only (describe's activeGrants)
    this._store = this._loadStore();
  }

  useStore(store) { if (store) this.gstore = store; }

  // Grant keys + a generous TTL so denyReason (using the injectable clock) governs
  // expiry, while the store still cleans up eventually.
  _gKey(grantId) { return `grant:g:${grantId}`; }
  _tKey(token) { return `grant:t:${token}`; }
  _ttlMs(expiresAt) { return Math.max(1000, (expiresAt - this.now())) + 600_000; }

  // --- backing store (never committed) --------------------------------------
  _loadStore() {
    if (!fs.existsSync(this.storePath)) {
      // No store yet: empty scopes. issue() on an unknown scope fails closed.
      return { owner: 'lab', scopes: {}, rotated: {} };
    }
    const raw = JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
    return { owner: raw.owner || 'lab', scopes: raw.scopes || {}, rotated: raw.rotated || {} };
  }

  _masterFor(scope) {
    const m = this._store.scopes[scope];
    if (m === undefined) throw new SecretsError('unknown-scope', `no secret for scope '${scope}'`);
    return m;
  }

  _publicGrant(g) {
    return { grantId: g.grantId, scope: g.scope, token: g.token, issuedAt: g.issuedAt, expiresAt: g.expiresAt, ref: g.ref };
  }

  async _putGrant(g) {
    const ttl = this._ttlMs(g.expiresAt);
    await this.gstore.set(this._gKey(g.grantId), g, ttl);
    await this.gstore.set(this._tKey(g.token), g.grantId, ttl);
  }
  async _getByToken(token) { const id = await this.gstore.get(this._tKey(token)); return id ? this.gstore.get(this._gKey(id)) : null; }

  // --- contract (async: grants live in the shared store) --------------------
  async issue(scope, ttlSeconds, requestedBy, opts = {}) {
    this._masterFor(scope); // fail closed if the scope has no secret
    if (!(ttlSeconds > 0)) throw new SecretsError('bad-ttl', 'ttlSeconds must be > 0');
    const issuedAt = this.now();
    const expiresAt = issuedAt + ttlSeconds * 1000;
    const ref = refFor(scope);
    const g = { grantId: this.randomId(), scope, token: this.randomId(), issuedAt, expiresAt, ref, revoked: false, requestedBy };
    await this._putGrant(g);
    this._active.set(scope, (this._active.get(scope) || 0) + 1);
    this.emit({
      kind: 'secret', actor: requestedBy || 'gate', action: 'issue',
      detail: receiptDetail({ op: 'issue', scope, ttlSeconds, expiresAt, ref, requestedBy, decision: 'allow', parent: opts.parent || null })
    });
    return this._publicGrant(g);
  }

  async renew(grantId, ttlSeconds) {
    const g = await this.gstore.get(this._gKey(grantId));
    if (!g || g.revoked) throw new SecretsError('not-renewable', 'unknown or revoked grant'); // fail closed
    if (!(ttlSeconds > 0)) throw new SecretsError('bad-ttl', 'ttlSeconds must be > 0');
    g.expiresAt = this.now() + ttlSeconds * 1000;
    await this._putGrant(g);
    this.emit({
      kind: 'secret', actor: g.requestedBy || 'gate', action: 'renew',
      detail: receiptDetail({ op: 'renew', scope: g.scope, ttlSeconds, expiresAt: g.expiresAt, ref: g.ref, requestedBy: g.requestedBy, decision: 'allow' })
    });
    return this._publicGrant(g);
  }

  async revoke(grantId) {
    const g = await this.gstore.get(this._gKey(grantId));
    if (!g) throw new SecretsError('unknown-grant', 'unknown grant');
    g.revoked = true;
    await this._putGrant(g);                          // keep the revoked flag until natural expiry
    this._active.set(g.scope, Math.max(0, (this._active.get(g.scope) || 0) - 1));
    this.emit({
      kind: 'secret', actor: g.requestedBy || 'gate', action: 'revoke',
      detail: receiptDetail({ op: 'revoke', scope: g.scope, ttlSeconds: 0, expiresAt: g.expiresAt, ref: g.ref, requestedBy: g.requestedBy, decision: 'revoke' })
    });
    return { revoked: true };
  }

  async describe(ref) {
    // accept either a ref ('secret:scope') or a bare scope
    const scope = ref && ref.startsWith('secret:') ? ref.slice('secret:'.length) : ref;
    this._masterFor(scope); // throws unknown-scope if absent — NO secret returned
    return {
      ref: refFor(scope),
      owner: this._store.owner,
      scope,
      lastRotated: this._store.rotated[scope] || null,
      activeGrants: this._active.get(scope) || 0,        // per-process metadata (not security-critical)
    };
  }

  // --- the "use" path (gate/tool presents the token back) -------------------
  // Fails closed on unknown/expired/revoked. Returns success metadata only; the
  // master secret is used internally and never handed to the caller.
  async redeem(token) {
    const g = await this._getByToken(token);
    const reason = denyReason(g, this.now());
    if (reason) throw new SecretsError(reason, `token denied: ${reason}`); // FAIL CLOSED
    void this._masterFor(g.scope);                     // confirm validity; never returns master material
    return { ok: true, scope: g.scope, ref: g.ref };
  }
}

export function createFileProvider(opts) { return new FileProvider(opts); }
