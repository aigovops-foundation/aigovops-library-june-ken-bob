// test/secrets.test.mjs
// Ticket 0 acceptance tests — the SecretsProvider contract via FileProvider.
// Proves the broker pattern: mint -> scope -> expire -> log -> revoke, with no
// secret material ever leaving the provider or reaching the ledger.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const MASTER = 'MASTER-SECRET-DO-NOT-LEAK-7f3a9c2b';
const SCOPE = 'github-deploy';

// Hermetic temp dirs. Set BEFORE importing beacon so its keys/ledger are isolated.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-secrets-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const beacon = await import('../src/core/beacon.js');
const { FileProvider } = await import('../src/core/secrets.fileprovider.js');
const { SecretsError } = await import('../src/core/secrets.shared.js');

function writeStore() {
  const p = path.join(TMP, `store-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(p, JSON.stringify({
    owner: 'lab',
    scopes: { [SCOPE]: MASTER },
    rotated: { [SCOPE]: '2026-06-06' }
  }));
  return p;
}
function clock(startMs) { let t = startMs; return { now: () => t, advance: (ms) => { t += ms; } }; }
const noEmit = () => {}; // for tests that don't assert on receipts

// 1 — token is not the master secret
test('issued token is not the master secret', () => {
  const p = new FileProvider({ storePath: writeStore(), emit: noEmit });
  const g = p.issue(SCOPE, 60, 'gate');
  assert.notStrictEqual(g.token, MASTER);
  assert.ok(g.token.length >= 16, 'token should be a long opaque id');
  assert.strictEqual(g.ref, 'secret:github-deploy');
});

// 2 — a token used after expiresAt fails closed
test('a token used after expiry fails closed', () => {
  const c = clock(1_000_000);
  const p = new FileProvider({ storePath: writeStore(), now: c.now, emit: noEmit });
  const g = p.issue(SCOPE, 1, 'gate'); // ttl 1s
  assert.strictEqual(p.redeem(g.token).ok, true);     // valid right now
  c.advance(1_500);                                    // move past expiresAt
  assert.throws(() => p.redeem(g.token), (e) => e instanceof SecretsError && e.reason === 'expired');
});

// 3 — revoke makes the token fail closed immediately
test('revoke makes the token fail closed immediately', () => {
  const p = new FileProvider({ storePath: writeStore(), emit: noEmit });
  const g = p.issue(SCOPE, 600, 'gate');
  assert.strictEqual(p.redeem(g.token).ok, true);
  assert.deepStrictEqual(p.revoke(g.grantId), { revoked: true });
  assert.throws(() => p.redeem(g.token), (e) => e instanceof SecretsError && e.reason === 'revoked');
});

// 4 — each op emits exactly one signed ledger receipt; no secret in the ledger
test('each op emits exactly one signed receipt, with no secret material', () => {
  const p = new FileProvider({ storePath: writeStore() }); // default emit -> real Beacon ledger (temp)
  const before = beacon.ledgerCount();
  const g = p.issue(SCOPE, 60, 'gate');
  assert.strictEqual(beacon.ledgerCount(), before + 1, 'issue emits exactly one');
  p.renew(g.grantId, 120);
  assert.strictEqual(beacon.ledgerCount(), before + 2, 'renew emits exactly one');
  p.revoke(g.grantId);
  assert.strictEqual(beacon.ledgerCount(), before + 3, 'revoke emits exactly one');

  const v = beacon.verifyLedger();
  assert.strictEqual(v.valid, true, 'ledger signatures + chain verify');

  const raw = fs.readFileSync(beacon.ledgerFile(), 'utf8');
  assert.strictEqual(raw.includes(MASTER), false, 'no secret material in the ledger');

  const lines = raw.trim().split('\n').filter(Boolean).slice(-3).map((l) => JSON.parse(l).record);
  assert.deepStrictEqual(lines.map((r) => r.action), ['issue', 'renew', 'revoke']);
  assert.ok(lines.every((r) => r.kind === 'secret' && r.detail && r.detail.scope === SCOPE));
});

// 5 — describe() returns metadata only, no secret
test('describe() returns owner/scope/rotation metadata and no secret', () => {
  const p = new FileProvider({ storePath: writeStore(), emit: noEmit });
  p.issue(SCOPE, 600, 'gate');
  const rec = p.describe('secret:' + SCOPE);
  assert.strictEqual(rec.scope, SCOPE);
  assert.strictEqual(rec.owner, 'lab');
  assert.strictEqual(rec.ref, 'secret:github-deploy');
  assert.strictEqual(rec.lastRotated, '2026-06-06');
  assert.strictEqual(rec.activeGrants, 1);
  assert.strictEqual(JSON.stringify(rec).includes(MASTER), false, 'describe leaks no secret');
});

// 6 — the backing secret file is gitignored and not tracked
test('the backing secret file is gitignored and not tracked', () => {
  const root = path.resolve('..'); // tests run from core/
  const gi = [path.join(root, '.gitignore'), path.resolve('.gitignore')]
    .map((f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''))
    .join('\n');
  assert.ok(/secrets\.local\.json/.test(gi), 'secrets.local.json must appear in .gitignore');

  let inGit = true;
  try { execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, stdio: 'pipe' }); }
  catch { inGit = false; }
  if (inGit) {
    let tracked = false;
    try {
      execFileSync('git', ['ls-files', '--error-unmatch', 'core/secrets.local.json'], { cwd: root, stdio: 'pipe' });
      tracked = true;
    } catch { tracked = false; }
    assert.strictEqual(tracked, false, 'secrets.local.json must not be tracked by git');
  }
});
