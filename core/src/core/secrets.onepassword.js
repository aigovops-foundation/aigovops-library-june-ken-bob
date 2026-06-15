// src/core/secrets.onepassword.js
// ONEPASSWORDPROVIDER — the SecretsProvider whose backing store is 1Password.
// API keys live in a 1Password vault; the gate brokers them as short-lived,
// scoped tokens exactly like FileProvider/VaultProvider — an agent never sees the
// stored credential. Same contract, same metadata-only receipts.
//
//   scope 'github-deploy'  ->  op://<OP_VAULT>/github-deploy/<OP_FIELD>
//
// Config-only swap via the factory (SECRETS_PROFILE=1password). The op read is
// injectable so the contract is proven without touching a real vault.

import crypto from 'node:crypto';
import * as beacon from './beacon.js';
import { SecretsProvider, SecretsError, refFor, denyReason, isExpired, receiptDetail } from './secrets.shared.js';
import { opRead, opAvailable } from './op.js';

export class OnePasswordProvider extends SecretsProvider {
  constructor(opts = {}) {
    super();
    this.vault = opts.vault || process.env.OP_VAULT || 'AiGovOps';
    this.field = opts.field || process.env.OP_FIELD || 'credential';
    this.owner = opts.owner || process.env.OP_OWNER || 'foundation';
    this.opRun = opts.opRun || null;            // injectable op transport (tests)
    this.now = opts.now || (() => Date.now());
    this.randomId = opts.randomId || (() => crypto.randomBytes(18).toString('hex'));
    this.emit = opts.emit || ((m) => beacon.emit(m));
    this._grants = new Map();
    this._byToken = new Map();
  }

  _opRefFor(scope) { return `op://${this.vault}/${scope}/${this.field}`; }

  // Read the stored credential for a scope — fail closed if op is unavailable or
  // the item is missing. The value is used internally and never returned to a tool.
  _masterFor(scope) {
    if (!this.opRun && !opAvailable()) {
      throw new SecretsError('op-unavailable', 'the 1Password CLI (op) is not available — install op + set OP_SERVICE_ACCOUNT_TOKEN, or `op signin`');
    }
    try { return opRead(this._opRefFor(scope), { run: this.opRun }); }
    catch (e) { throw new SecretsError('unknown-scope', `no 1Password item for scope '${scope}': ${e.message}`); }
  }

  _publicGrant(g) { return { grantId: g.grantId, scope: g.scope, token: g.token, issuedAt: g.issuedAt, expiresAt: g.expiresAt, ref: g.ref }; }

  issue(scope, ttlSeconds, requestedBy, opts = {}) {
    this._masterFor(scope);                     // fail closed if the item is absent
    if (!(ttlSeconds > 0)) throw new SecretsError('bad-ttl', 'ttlSeconds must be > 0');
    const issuedAt = this.now();
    const expiresAt = issuedAt + ttlSeconds * 1000;
    const ref = refFor(scope);
    const g = { grantId: this.randomId(), scope, token: this.randomId(), issuedAt, expiresAt, ref, revoked: false, requestedBy };
    this._grants.set(g.grantId, g); this._byToken.set(g.token, g.grantId);
    this.emit({ kind: 'secret', actor: requestedBy || 'gate', action: 'issue',
      detail: receiptDetail({ op: 'issue', scope, ttlSeconds, expiresAt, ref, requestedBy, decision: 'allow', parent: opts.parent || null }) });
    return this._publicGrant(g);
  }

  renew(grantId, ttlSeconds) {
    const g = this._grants.get(grantId);
    if (!g || g.revoked) throw new SecretsError('not-renewable', 'unknown or revoked grant');
    if (!(ttlSeconds > 0)) throw new SecretsError('bad-ttl', 'ttlSeconds must be > 0');
    g.expiresAt = this.now() + ttlSeconds * 1000;
    this.emit({ kind: 'secret', actor: g.requestedBy || 'gate', action: 'renew',
      detail: receiptDetail({ op: 'renew', scope: g.scope, ttlSeconds, expiresAt: g.expiresAt, ref: g.ref, requestedBy: g.requestedBy, decision: 'allow' }) });
    return this._publicGrant(g);
  }

  revoke(grantId) {
    const g = this._grants.get(grantId);
    if (!g) throw new SecretsError('unknown-grant', 'unknown grant');
    g.revoked = true;
    this.emit({ kind: 'secret', actor: g.requestedBy || 'gate', action: 'revoke',
      detail: receiptDetail({ op: 'revoke', scope: g.scope, ttlSeconds: 0, expiresAt: g.expiresAt, ref: g.ref, requestedBy: g.requestedBy, decision: 'revoke' }) });
    return { revoked: true };
  }

  describe(ref) {
    const scope = ref && ref.startsWith('secret:') ? ref.slice('secret:'.length) : ref;
    this._masterFor(scope);                     // throws unknown-scope if absent — NO secret returned
    const now = this.now();
    let activeGrants = 0;
    for (const g of this._grants.values()) if (g.scope === scope && !g.revoked && !isExpired(g, now)) activeGrants++;
    return { ref: refFor(scope), owner: this.owner, scope, lastRotated: null, activeGrants };
  }

  redeem(token) {
    const grantId = this._byToken.get(token);
    const g = grantId ? this._grants.get(grantId) : null;
    const reason = denyReason(g, this.now());
    if (reason) throw new SecretsError(reason, `token denied: ${reason}`);
    void this._masterFor(g.scope);
    return { ok: true, scope: g.scope, ref: g.ref };
  }
}

export function createOnePasswordProvider(opts) { return new OnePasswordProvider(opts); }
