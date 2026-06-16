// test/worktree.test.mjs
// #3 — the worktree mutation path. An agent authors a real file change in an
// isolated worktree: a reviewable diff + a signed receipt, the main tree
// untouched, nothing committed. Path escapes and bad scopes fail closed. Driven
// end-to-end through the governed loop, leaving a verifiable receipt trail.

import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-wt-test-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');
const STORE = path.join(TMP, 'secrets.json');
fs.writeFileSync(STORE, JSON.stringify({ owner: 'lab', scopes: { 'self-host': 'M', 'github-deploy': 'M2' }, rotated: {} }));

const beacon = await import('../src/core/beacon.js');
const { WorktreeRunner } = await import('../src/core/worktree.js');
const { createGovernedCore } = await import('../src/core/govapi.js');
const { FileProvider } = await import('../src/core/secrets.fileprovider.js');

// A throwaway git repo to mutate (so we never touch the real one).
const REPO = path.join(TMP, 'repo');
fs.mkdirSync(REPO);
const g = (args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' });
g(['init', '-q']); g(['config', 'user.email', 't@t']); g(['config', 'user.name', 'T']);
fs.writeFileSync(path.join(REPO, 'README.md'), '# repo\n');
g(['add', '-A']); g(['commit', '-q', '-m', 'init']);

test('proposes a file change as a diff + receipt; main tree untouched, nothing committed', async () => {
  const before = beacon.ledgerCount();
  const r = new WorktreeRunner({ repoDir: REPO }).proposeFileChange({ relPath: 'docs/NEW.md', content: '# new file\nhello\n' });
  assert.match(r.diff, /docs\/NEW\.md/);
  assert.match(r.diff, /\+# new file/);
  assert.ok(r.additions >= 1);
  assert.match(r.diffHash, /^[0-9a-f]{64}$/);
  // the real tree never saw the file, and HEAD is unchanged (no commit)
  assert.strictEqual(fs.existsSync(path.join(REPO, 'docs/NEW.md')), false);
  assert.strictEqual(execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' }).trim(), '');
  assert.strictEqual(g(['rev-list', '--count', 'HEAD']).trim(), '1', 'no new commit');
  // one metadata-only mutation receipt (diff hash, never the diff body)
  assert.strictEqual(beacon.ledgerCount(), before + 1);
  const rec = JSON.parse(fs.readFileSync(beacon.ledgerFile(), 'utf8').trim().split('\n').pop()).record;
  assert.strictEqual(rec.kind, 'mutation');
  assert.strictEqual(rec.action, 'file-change-proposed');
  assert.strictEqual(JSON.stringify(rec).includes('hello'), false, 'the diff body is never in the ledger');
});

test('path escape fails closed', async () => {
  const wt = new WorktreeRunner({ repoDir: REPO });
  assert.throws(() => wt.proposeFileChange({ relPath: '../escape.md', content: 'x' }), (e) => e.reason === 'path-escape');
  assert.throws(() => wt.proposeFileChange({ relPath: '/etc/passwd', content: 'x' }), (e) => e.reason === 'bad-path');
});

test('end-to-end through the governed loop: propose -> approve -> author change, receipt trail verifies', async () => {
  const core = createGovernedCore({ secrets: new FileProvider({ storePath: STORE }), repoDir: REPO });
  // a member asks to publish a file (irreversible -> human gate)
  const { pendingId, requiresHumanGate } = await core.propose('publish a self-hosted changelog file', { actor: 'agent:self-host' });
  assert.strictEqual(requiresHumanGate, true);
  const decided = await core.decide(pendingId, 'approve', { scope: 'self-host' });
  assert.ok(decided.grant && decided.grant.token, 'approval brokered a self-host token');
  const change = await core.proposeFileChange({ token: decided.grant.token, relPath: 'CHANGELOG.md', content: '# Changelog\n- governed self-hosted change\n' });
  assert.match(change.diff, /CHANGELOG\.md/);
  // the mutation receipt links back to the approving proposal
  const recs = fs.readFileSync(beacon.ledgerFile(), 'utf8').trim().split('\n').map((l) => JSON.parse(l).record);
  const mut = recs.filter((r) => r.action === 'file-change-proposed').pop();
  assert.strictEqual(mut.detail.parent, decided.proposalId, 'mutation receipt chains to the proposal');
  assert.strictEqual(beacon.verifyLedger().valid, true, 'the whole receipt trail verifies');
  // wrong scope fails closed
  const p2 = await core.propose('publish another file', { actor: 'agent:self-host' });
  const d2 = await core.decide(p2.pendingId, 'approve', { scope: 'github-deploy' });
  await assert.rejects(() => core.proposeFileChange({ token: d2.grant.token, relPath: 'x.md', content: 'x' }), /needs scope 'self-host'/);
});
