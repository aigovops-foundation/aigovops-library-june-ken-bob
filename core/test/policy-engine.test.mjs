// test/policy-engine.test.mjs
// Ticket 7: the policy seam. The JS engine reproduces the gate's current
// decisions (agent.propose); the OPA engine marshals input/output correctly
// (via an injected fake transport) and matches the JS engine; a real-`opa`
// parity check runs only where the binary exists (documented blocker otherwise).

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-policy-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const { JsPolicyEngine, OpaPolicyEngine, createPolicyEngine, buildOpaArgs, opaAvailable, IRREVERSIBLE_VERBS } = await import('../src/core/policy-engine.js');
const { propose } = await import('../src/core/agent.js');
const { execFileSync } = await import('node:child_process');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POLICY_DIR = path.resolve(__dirname, '..', 'policy');

const INTENTS = [
  'deploy the site', 'delete the user', 'publish the report', 'send the email',
  'pay the invoice', 'grant access', 'merge the PR',
  'summarize the document', 'read the ledger', 'draft a plan', 'classify a problem',
];

test('JsPolicyEngine reproduces agent.propose requiresHumanGate exactly', () => {
  const js = new JsPolicyEngine();
  for (const intent of INTENTS) {
    assert.strictEqual(js.evaluate({ intent }).requiresHumanGate, propose(intent).requiresHumanGate, `mismatch on: ${intent}`);
  }
});

test('JsPolicyEngine sets requiredLevel act for irreversible, propose otherwise', () => {
  const js = new JsPolicyEngine();
  assert.strictEqual(js.evaluate({ intent: 'deploy now' }).requiredLevel, 'act');
  assert.strictEqual(js.evaluate({ intent: 'summarize this' }).requiredLevel, 'propose');
  assert.deepStrictEqual(js.evaluate({ intent: 'deploy and merge' }).reasons.sort(), ['matched irreversible verb: deploy', 'matched irreversible verb: merge']);
});

test('buildOpaArgs reads stdin input and queries the gate decision', () => {
  const args = buildOpaArgs({ policyDir: POLICY_DIR });
  assert.ok(args.includes('-I'), 'reads input from stdin');
  assert.ok(args.includes('-d') && args.includes(POLICY_DIR), 'loads the policy dir');
  assert.ok(args.includes('data.aigov.gate.decision'), 'queries the decision document');
  assert.deepStrictEqual([args[0], args[1], args[2]], ['eval', '--format', 'json']);
});

test('OpaPolicyEngine parses an opa-eval envelope and matches the JS engine', () => {
  const js = new JsPolicyEngine();
  // Fake `opa eval`: compute the decision the same way the rego would, wrapped
  // in opa's JSON result envelope. Verifies marshalling, not the rego itself.
  const fakeOpa = ({ inputJson }) => {
    const intent = JSON.parse(inputJson).intent.toLowerCase();
    const matched = IRREVERSIBLE_VERBS.filter((v) => intent.includes(v));
    const irreversible = matched.length > 0;
    const value = { irreversible, requiresHumanGate: irreversible, requiredLevel: irreversible ? 'act' : 'propose', reasons: matched.map((v) => `matched irreversible verb: ${v}`) };
    return JSON.stringify({ result: [{ expressions: [{ value }] }] });
  };
  const opa = new OpaPolicyEngine({ policyDir: POLICY_DIR, runOpa: fakeOpa });
  for (const intent of INTENTS) {
    assert.deepStrictEqual(opa.evaluate({ intent }), js.evaluate({ intent }), `OPA vs JS mismatch on: ${intent}`);
  }
});

test('OpaPolicyEngine fails closed when opa is absent and not injected', () => {
  const opa = new OpaPolicyEngine({ policyDir: POLICY_DIR, requireOpa: true });
  if (!opaAvailable()) {
    assert.throws(() => opa.evaluate({ intent: 'deploy' }), (e) => e.reason === 'opa-unavailable');
  } else {
    assert.ok(true, 'opa present — covered by the parity test below');
  }
});

test('createPolicyEngine: js explicit, auto falls back to JS without opa', () => {
  assert.ok(createPolicyEngine({ engine: 'js' }) instanceof JsPolicyEngine);
  const auto = createPolicyEngine({ engine: 'auto', policyDir: POLICY_DIR });
  if (!opaAvailable()) assert.ok(auto instanceof JsPolicyEngine, 'auto -> JS when opa absent');
});

// Real-binary parity: only where `opa` is installed (Linux enclave / CI image).
test('real opa reproduces the JS engine decisions', { skip: !opaAvailable() }, () => {
  const js = new JsPolicyEngine();
  for (const intent of INTENTS) {
    const out = execFileSync('opa', buildOpaArgs({ policyDir: POLICY_DIR }), { input: JSON.stringify({ intent }), encoding: 'utf8' });
    const value = JSON.parse(out).result[0].expressions[0].value;
    assert.strictEqual(value.requiresHumanGate, js.evaluate({ intent }).requiresHumanGate, `opa mismatch on: ${intent}`);
  }
});
