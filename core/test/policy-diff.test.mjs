// test/policy-diff.test.mjs
// #5 — runtime policy + the policy-change review flow. The decision-diff shows
// which intents flip when the rule changes; the governed loop classifies through
// the policy engine at runtime.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-pdiff-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');
const STORE = path.join(TMP, 'secrets.json');
fs.writeFileSync(STORE, JSON.stringify({ owner: 'lab', scopes: { 'github-deploy': 'M' }, rotated: {} }));

const { JsPolicyEngine, IRREVERSIBLE_VERBS } = await import('../src/core/policy-engine.js');
const { policyDiff } = await import('../src/core/policy-diff.js');
const { createGovernedCore } = await import('../src/core/govapi.js');
const { FileProvider } = await import('../src/core/secrets.fileprovider.js');

test('removing a verb loosens — the decision-diff flags the disappearing gate', async () => {
  const baseline = new JsPolicyEngine();
  const candidate = new JsPolicyEngine({ verbs: IRREVERSIBLE_VERBS.filter((v) => v !== 'deploy') });
  const diff = policyDiff({ baseline, candidate, intents: ['deploy the site', 'summarize the doc', 'delete the row'] });
  assert.strictEqual(diff.flipped, 1);
  assert.strictEqual(diff.loosened, 1, 'a gate disappeared');
  assert.strictEqual(diff.tightened, 0);
  assert.match(diff.flips[0].intent, /deploy/);
  assert.strictEqual(diff.flips[0].from.requiresHumanGate, true);
  assert.strictEqual(diff.flips[0].to.requiresHumanGate, false);
});

test('adding a verb tightens — a new gate appears', async () => {
  const baseline = new JsPolicyEngine();
  const candidate = new JsPolicyEngine({ verbs: IRREVERSIBLE_VERBS.concat(['email']) });
  const diff = policyDiff({ baseline, candidate, intents: ['email the team', 'read the file'] });
  assert.strictEqual(diff.tightened, 1);
  assert.strictEqual(diff.loosened, 0);
});

test('identical policy yields a zero diff', async () => {
  const diff = policyDiff({ baseline: new JsPolicyEngine(), candidate: new JsPolicyEngine() });
  assert.strictEqual(diff.flipped, 0);
});

test('the governed loop classifies through the runtime policy engine', async () => {
  // inject a custom policy: only "launch" is irreversible
  const policy = new JsPolicyEngine({ verbs: ['launch'] });
  const core = createGovernedCore({ secrets: new FileProvider({ storePath: STORE }), policy });
  assert.strictEqual((await core.propose('deploy the site')).requiresHumanGate, false, 'deploy is not gated under this policy');
  assert.strictEqual((await core.propose('launch the rocket')).requiresHumanGate, true, 'launch is gated under this policy');
});
