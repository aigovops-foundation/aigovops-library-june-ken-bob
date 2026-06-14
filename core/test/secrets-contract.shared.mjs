// test/secrets-contract.shared.mjs
// The SecretsProvider CONTRACT, written once and run against every backend
// (FileProvider and VaultProvider) so "identical contract tests pass against
// both" is literally true — see secrets.contract.test.mjs.
//
// A backend is described by a factory: makeProvider({ now, emit }) -> provider,
// already bound to a single known `scope` whose master/admin material is `master`.
// Methods are awaited so the suite works whether a backend is sync (File) or
// would be async — File's plain returns await fine.

import assert from 'node:assert';

const clock = (startMs) => { let t = startMs; return { now: () => t, advance: (ms) => { t += ms; } }; };

export function runContract({ test, label, makeProvider, master, scope, beacon }) {
  // 1 — the issued token is not the master/admin secret
  test(`[${label}] issued token is not the master secret`, async () => {
    const p = makeProvider({ emit: () => {} });
    const g = await p.issue(scope, 60, 'gate');
    assert.notStrictEqual(g.token, master);
    assert.ok(g.token.length >= 16, 'token should be a long opaque id');
    assert.strictEqual(g.ref, `secret:${scope}`);
  });

  // 2 — a token used after expiresAt fails closed
  test(`[${label}] a token used after expiry fails closed`, async () => {
    const c = clock(1_000_000);
    const p = makeProvider({ now: c.now, emit: () => {} });
    const g = await p.issue(scope, 1, 'gate');                 // ttl 1s
    assert.strictEqual((await p.redeem(g.token)).ok, true);    // valid now
    c.advance(1_500);                                          // past expiresAt
    await assert.rejects(async () => p.redeem(g.token), (e) => e.reason === 'expired');
  });

  // 3 — revoke makes the token fail closed immediately
  test(`[${label}] revoke makes the token fail closed immediately`, async () => {
    const p = makeProvider({ emit: () => {} });
    const g = await p.issue(scope, 600, 'gate');
    assert.strictEqual((await p.redeem(g.token)).ok, true);
    assert.deepStrictEqual(await p.revoke(g.grantId), { revoked: true });
    await assert.rejects(async () => p.redeem(g.token), (e) => e.reason === 'revoked');
  });

  // 4 — each op emits exactly one signed receipt; no secret material in the ledger
  test(`[${label}] each op emits exactly one signed receipt, no secret material`, async () => {
    const p = makeProvider({});                                // default emit -> real Beacon ledger (temp)
    const before = beacon.ledgerCount();
    const g = await p.issue(scope, 60, 'gate');
    assert.strictEqual(beacon.ledgerCount(), before + 1, 'issue emits exactly one');
    await p.renew(g.grantId, 120);
    assert.strictEqual(beacon.ledgerCount(), before + 2, 'renew emits exactly one');
    await p.revoke(g.grantId);
    assert.strictEqual(beacon.ledgerCount(), before + 3, 'revoke emits exactly one');

    assert.strictEqual(beacon.verifyLedger().valid, true, 'ledger signatures + chain verify');

    const fs = await import('node:fs');
    const raw = fs.readFileSync(beacon.ledgerFile(), 'utf8');
    assert.strictEqual(raw.includes(master), false, 'no secret material in the ledger');
    const lines = raw.trim().split('\n').filter(Boolean).slice(-3).map((l) => JSON.parse(l).record);
    assert.deepStrictEqual(lines.map((r) => r.action), ['issue', 'renew', 'revoke']);
    assert.ok(lines.every((r) => r.kind === 'secret' && r.detail && r.detail.scope === scope));
  });

  // 5 — describe() returns registry metadata only, no secret
  test(`[${label}] describe() returns metadata and no secret`, async () => {
    const p = makeProvider({ emit: () => {} });
    await p.issue(scope, 600, 'gate');
    const rec = await p.describe('secret:' + scope);
    assert.strictEqual(rec.scope, scope);
    assert.strictEqual(rec.ref, `secret:${scope}`);
    assert.strictEqual(rec.activeGrants, 1);
    assert.ok(typeof rec.owner === 'string' && rec.owner.length > 0, 'owner present');
    assert.ok('lastRotated' in rec, 'lastRotated present');
    assert.strictEqual(JSON.stringify(rec).includes(master), false, 'describe leaks no secret');
  });

  // 6 — an unknown scope fails closed (issues nothing)
  test(`[${label}] an unknown scope fails closed`, async () => {
    const p = makeProvider({ emit: () => {} });
    await assert.rejects(async () => p.issue('no-such-scope-xyz', 60, 'gate'), (e) => e.reason === 'unknown-scope');
  });
}
