// src/core/secrets.vaultprovider.js
// VAULTPROVIDER — the `community` / `enclave` adapter for the SecretsProvider
// contract (Ticket 2). Same interface, same receipt shape, same fail-closed
// semantics as FileProvider — but the ephemeral credential is minted by
// HashiCorp Vault instead of derived locally.
//
//   FileProvider  (lab)        — secrets.fileprovider.js
//   VaultProvider (community)  — THIS FILE
//
// Swapping is CONFIG-ONLY (see secrets.factory.js / SECRETS_PROFILE). The gate,
// govapi, and tools call the identical methods and never change.
//
// Brokering pattern (mint → scope → expire → log → revoke) on Vault primitives:
//   • mint   : POST auth/token/create — a short-lived CHILD token, scoped by a
//              per-scope policy. The child `client_token` is the opaque `token`
//              we hand to a sandboxed tool. It is NEVER the admin/master token.
//   • scope  : the child token carries only `policyFor(scope)`.
//   • expire : the child token has the requested TTL; Vault enforces it
//              server-side, and we enforce the same TTL locally (fail-closed on
//              an injected clock, exactly like FileProvider).
//   • log    : every issue/renew/revoke emits ONE metadata-only Beacon receipt.
//   • revoke : POST auth/token/revoke-accessor — immediate, by accessor (so we
//              never need to keep the child token around to kill it).
//
// DEPENDENCY-FREE + SYNCHRONOUS by design, so the contract matches FileProvider
// byte-for-byte (the gate stays synchronous). The default transport shells out
// to `curl` (present on every Vault host); inject `opts.request` to use any
// other synchronous transport — and that is exactly what the contract tests do.

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

import * as beacon from './beacon.js';
import { SecretsProvider, SecretsError, refFor, denyReason, isExpired, receiptDetail } from './secrets.shared.js';

// Default per-scope Vault policy name. A scope 'github-deploy' maps to the
// policy 'aigov-github-deploy', which a Vault admin grants only the paths that
// scope legitimately needs. The child token carries nothing else.
export function policyFor(scope) { return `aigov-${scope}`; }

// A synchronous Vault HTTP transport backed by curl. Returns { status, json }.
// No third-party dependency; curl ships with every Vault deployment image.
function curlTransport(addr, adminToken) {
  return ({ method = 'GET', path, body = null, token = adminToken }) => {
    const url = `${addr.replace(/\/$/, '')}/v1/${path.replace(/^\//, '')}`;
    const args = ['-s', '-S', '-w', '\n%{http_code}', '-X', method, '-H', `X-Vault-Token: ${token || ''}`];
    if (body != null) args.push('-H', 'Content-Type: application/json', '-d', JSON.stringify(body));
    args.push(url);
    let out;
    try {
      out = execFileSync('curl', args, { encoding: 'utf8', timeout: 15_000 });
    } catch (e) {
      throw new SecretsError('vault-unreachable', `Vault request failed: ${e.message}`);
    }
    const nl = out.lastIndexOf('\n');
    const status = parseInt(out.slice(nl + 1).trim(), 10);
    const head = out.slice(0, nl);
    let json = null;
    try { json = head ? JSON.parse(head) : null; } catch { json = null; }
    return { status, json };
  };
}

export class VaultProvider extends SecretsProvider {
  /**
   * @param {Object} [opts]
   * @param {string}   [opts.addr]       Vault address (default $VAULT_ADDR)
   * @param {string}   [opts.token]      admin/master token used to mint children (default $VAULT_TOKEN)
   * @param {string}   [opts.kvMount]    KV v2 mount holding scope metadata (default $VAULT_KV_MOUNT or 'secret')
   * @param {string}   [opts.owner]      registry owner label for describe() (default 'community')
   * @param {Function} [opts.request]    synchronous transport ({method,path,body,token}) -> {status,json}; injectable for tests
   * @param {Function} [opts.now]        clock: () => epoch ms (injectable for tests)
   * @param {Function} [opts.randomId]   id minter: () => string (injectable for tests)
   * @param {Function} [opts.emit]       receipt emitter (default beacon.emit; injectable for tests)
   */
  constructor(opts = {}) {
    super();
    this.addr = opts.addr || process.env.VAULT_ADDR || null;
    this.adminToken = opts.token || process.env.VAULT_TOKEN || null;
    this.kvMount = opts.kvMount || process.env.VAULT_KV_MOUNT || 'secret';
    this.owner = opts.owner || process.env.VAULT_OWNER || 'community';
    this.now = opts.now || (() => Date.now());
    this.randomId = opts.randomId || (() => crypto.randomBytes(18).toString('hex'));
    this.emit = opts.emit || ((meta) => beacon.emit(meta));
    if (opts.request) {
      this.request = opts.request;
    } else {
      if (!this.addr || !this.adminToken) {
        // Live Vault not configured. Fail closed loudly on use rather than
        // silently degrading — the factory keeps `lab` as the safe default.
        this.request = () => { throw new SecretsError('vault-unconfigured', 'VAULT_ADDR and VAULT_TOKEN are required for the Vault profile'); };
      } else {
        this.request = curlTransport(this.addr, this.adminToken);
      }
    }
    this._grants = new Map();   // grantId -> internal grant (token, accessor, expiry, revoked)
    this._byToken = new Map();  // token   -> grantId
  }

  _ok(res, action) {
    if (!res || res.status < 200 || res.status >= 300) {
      const reason = res && res.status === 403 ? 'forbidden' : 'vault-error';
      throw new SecretsError(reason, `Vault ${action} returned ${res ? res.status : 'no-response'}`);
    }
    return res.json;
  }

  // A scope is "known" iff its metadata exists in the KV registry. Mirrors
  // FileProvider's unknown-scope fail-closed without ever reading the value.
  _metadata(scope) {
    const res = this.request({ method: 'GET', path: `${this.kvMount}/metadata/${scope}` });
    if (res && res.status === 404) throw new SecretsError('unknown-scope', `no secret for scope '${scope}'`);
    return this._ok(res, 'metadata read');
  }

  _publicGrant(g) {
    return { grantId: g.grantId, scope: g.scope, token: g.token, issuedAt: g.issuedAt, expiresAt: g.expiresAt, ref: g.ref };
  }

  // --- contract -------------------------------------------------------------
  issue(scope, ttlSeconds, requestedBy, opts = {}) {
    this._metadata(scope);                       // fail closed if the scope is unknown
    if (!(ttlSeconds > 0)) throw new SecretsError('bad-ttl', 'ttlSeconds must be > 0');
    const res = this.request({
      method: 'POST', path: 'auth/token/create',
      body: { policies: [policyFor(scope)], ttl: `${ttlSeconds}s`, renewable: true, num_uses: 0, meta: { scope, requestedBy: requestedBy || 'gate' } }
    });
    const json = this._ok(res, 'token/create');
    const auth = json && json.auth;
    if (!auth || !auth.client_token) throw new SecretsError('vault-error', 'token/create returned no client_token');
    const issuedAt = this.now();
    const expiresAt = issuedAt + ttlSeconds * 1000;
    const ref = refFor(scope);
    const g = { grantId: this.randomId(), scope, token: auth.client_token, accessor: auth.accessor || null, issuedAt, expiresAt, ref, revoked: false, requestedBy };
    this._grants.set(g.grantId, g);
    this._byToken.set(g.token, g.grantId);
    this.emit({
      kind: 'secret', actor: requestedBy || 'gate', action: 'issue',
      detail: receiptDetail({ op: 'issue', scope, ttlSeconds, expiresAt, ref, requestedBy, decision: 'allow', parent: opts.parent || null })
    });
    return this._publicGrant(g);
  }

  renew(grantId, ttlSeconds) {
    const g = this._grants.get(grantId);
    if (!g || g.revoked) throw new SecretsError('not-renewable', 'unknown or revoked grant'); // fail closed
    if (!(ttlSeconds > 0)) throw new SecretsError('bad-ttl', 'ttlSeconds must be > 0');
    const res = this.request({ method: 'POST', path: 'auth/token/renew-accessor', body: { accessor: g.accessor, increment: `${ttlSeconds}s` } });
    this._ok(res, 'token/renew-accessor');
    g.expiresAt = this.now() + ttlSeconds * 1000;
    this.emit({
      kind: 'secret', actor: g.requestedBy || 'gate', action: 'renew',
      detail: receiptDetail({ op: 'renew', scope: g.scope, ttlSeconds, expiresAt: g.expiresAt, ref: g.ref, requestedBy: g.requestedBy, decision: 'allow' })
    });
    return this._publicGrant(g);
  }

  revoke(grantId) {
    const g = this._grants.get(grantId);
    if (!g) throw new SecretsError('unknown-grant', 'unknown grant');
    const res = this.request({ method: 'POST', path: 'auth/token/revoke-accessor', body: { accessor: g.accessor } });
    this._ok(res, 'token/revoke-accessor');
    g.revoked = true;
    this.emit({
      kind: 'secret', actor: g.requestedBy || 'gate', action: 'revoke',
      detail: receiptDetail({ op: 'revoke', scope: g.scope, ttlSeconds: 0, expiresAt: g.expiresAt, ref: g.ref, requestedBy: g.requestedBy, decision: 'revoke' })
    });
    return { revoked: true };
  }

  describe(ref) {
    const scope = ref && ref.startsWith('secret:') ? ref.slice('secret:'.length) : ref;
    const meta = this._metadata(scope);          // throws unknown-scope if absent — NO secret returned
    const now = this.now();
    let activeGrants = 0;
    for (const g of this._grants.values()) {
      if (g.scope === scope && !g.revoked && !isExpired(g, now)) activeGrants++;
    }
    // Vault KV v2 metadata exposes updated_time + optional custom_metadata; both
    // are non-secret. We surface rotation + owner, never the value.
    const m = (meta && meta.data) || {};
    const custom = m.custom_metadata || {};
    return {
      ref: refFor(scope),
      owner: custom.owner || this.owner,
      scope,
      lastRotated: custom.lastRotated || (m.updated_time ? String(m.updated_time).slice(0, 10) : null),
      activeGrants
    };
  }

  // --- the "use" path -------------------------------------------------------
  // Fails closed locally first (unknown/expired/revoked under this.now()), then
  // confirms server-side with a self-lookup. The master/admin token is never
  // handed back — only success metadata.
  redeem(token) {
    const grantId = this._byToken.get(token);
    const g = grantId ? this._grants.get(grantId) : null;
    const reason = denyReason(g, this.now());
    if (reason) throw new SecretsError(reason, `token denied: ${reason}`); // FAIL CLOSED
    const res = this.request({ method: 'GET', path: 'auth/token/lookup-self', token: g.token });
    if (res && res.status === 403) throw new SecretsError('expired', 'token denied: expired'); // Vault revoked/expired it
    this._ok(res, 'token/lookup-self');
    return { ok: true, scope: g.scope, ref: g.ref };
  }
}

export function createVaultProvider(opts) { return new VaultProvider(opts); }
