// test/yesgate.shared.test.mjs
// The SINGLE SOURCE OF TRUTH for the Yes-Gate logic (yesgate.shared.js) had no test — yet
// its exact output is what the Node core serves AND what the public "See it run" page inlines.
// A silent change here would drift the page from the core with nothing to catch it. These
// tests pin the behaviour every re-export depends on: policy.js, lantern.js, router.js, llm.js.

import { test } from 'node:test';
import assert from 'node:assert';
import {
  LIBRARY, compile, frameworks, evaluate, transition, answerFor,
  SIGNALS, RISK_SCORE, RISK_TIER,
} from '../src/core/yesgate.shared.js';

test('compile: a known framework returns its full record', () => {
  const c = compile('eu-ai-act');
  assert.equal(c.name, 'EU AI Act');
  assert.match(c.gateQuestion, /Art\. 9–15/);
  assert.ok(Array.isArray(c.pathToYes) && c.pathToYes.length >= 1);
});

test('compile: an UNKNOWN framework degrades to a generic, still-usable gate', () => {
  const c = compile('some-future-reg');
  assert.equal(c.name, 'some-future-reg');           // echoes the id, never crashes
  assert.ok(c.gateQuestion.length > 0);
  assert.ok(c.pathToYes.includes('Sign'));
});

test('frameworks: lists every library entry as {id, name}', () => {
  const fw = frameworks();
  assert.equal(fw.length, Object.keys(LIBRARY).length);
  for (const f of fw) {
    assert.ok(f.id && f.name);
    assert.equal(f.name, LIBRARY[f.id].name);
  }
});

test('evaluate: hiring text is HIGH risk and raises the three employment gates', () => {
  const r = evaluate('We built an AI to screen job candidates and rank resumes.');
  assert.equal(r.risk, 'high');
  assert.equal(r.riskIndex, RISK_SCORE.high);
  assert.equal(r.tier, RISK_TIER.high);
  const ids = r.gates.map((g) => g.id);
  for (const want of ['gate:nyc-ll144', 'gate:eu-ai-act', 'gate:eeoc']) {
    assert.ok(ids.includes(want), `expected ${want}`);
  }
  // every fresh gate starts un-attested: decision "no", act "get" (the path TO Yes)
  for (const g of r.gates) {
    assert.equal(g.decision, 'no');
    assert.equal(g.act, 'get');
    assert.ok(Array.isArray(g.path) && g.path.length >= 1);
  }
});

test('evaluate: overlapping signals do NOT duplicate a framework', () => {
  // "hiring" + "candidate" both carry eu-ai-act; it must appear once.
  const r = evaluate('hiring candidate screening applicant resume employ');
  const euCount = r.gates.filter((g) => g.id === 'gate:eu-ai-act').length;
  assert.equal(euCount, 1);
});

test('evaluate: HIGH beats MED when a text trips both', () => {
  // "chatbot" is med; "patient" is high — the risk is the max, not the first.
  const r = evaluate('a chatbot that discusses patient medical history');
  assert.equal(r.risk, 'high');
});

test('evaluate: a med-only signal reads as med', () => {
  const r = evaluate('a content assistant that summarizes articles');
  assert.equal(r.risk, 'med');
  assert.equal(r.riskIndex, RISK_SCORE.med);
});

test('evaluate: no signal falls back to NIST AI RMF at low risk', () => {
  const r = evaluate('a small internal spreadsheet macro');
  assert.equal(r.risk, 'low');
  assert.equal(r.tier, RISK_TIER.low);
  assert.deepEqual(r.gates.map((g) => g.id), ['gate:nist-ai-rmf']);
});

test('evaluate: empty / non-string input never throws', () => {
  assert.equal(evaluate('').risk, 'low');
  assert.equal(evaluate(undefined).risk, 'low');
  assert.equal(evaluate(42).risk, 'low');
});

test('transition: the four lifecycle events map to the right (decision, act)', () => {
  const gate = { id: 'gate:gdpr', decision: 'no', act: 'get' };
  assert.deepEqual(pick(transition(gate, 'attested')), { decision: 'yes', act: 'stay' });
  assert.deepEqual(pick(transition(gate, 'drift')), { decision: 'no', act: 'stay' });
  assert.deepEqual(pick(transition(gate, 'incident')), { decision: 'no', act: 'recover' });
  assert.deepEqual(pick(transition(gate, 'remediated')), { decision: 'yes', act: 'stay' });
});

test('transition: is PURE — the input gate is not mutated, an unknown event is a no-op copy', () => {
  const gate = { id: 'gate:gdpr', decision: 'no', act: 'get' };
  const out = transition(gate, 'not-an-event');
  assert.deepEqual(pick(out), { decision: 'no', act: 'get' });   // unchanged
  assert.notEqual(out, gate);                                    // but a distinct object
  assert.equal(gate.act, 'get');                                 // original untouched
});

test('answerFor: routes the two special prompts and a safe default', () => {
  assert.match(answerFor('Tell me about the EU AI Act'), /conformity evidence/);
  assert.match(answerFor('we are hiring with AI'), /LL144/);
  assert.match(answerFor('something unrelated'), /path to Yes/i);
  assert.doesNotThrow(() => answerFor());   // no arg → default, no crash
});

test('the risk tables agree with the tiers the SIGNALS emit', () => {
  // guards a rename: every risk a signal can emit must have a score and a tier.
  const emitted = new Set(SIGNALS.map((s) => s.risk).concat('low'));
  for (const r of emitted) {
    assert.ok(r in RISK_SCORE, `RISK_SCORE missing ${r}`);
    assert.ok(r in RISK_TIER, `RISK_TIER missing ${r}`);
  }
});

function pick(g) { return { decision: g.decision, act: g.act }; }
