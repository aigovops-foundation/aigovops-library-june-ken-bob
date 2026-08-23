// test/run-skill-receipts.test.mjs
// Ladder row 12b — EVERY skill run leaves exactly one receipt, whatever the outcome.
//
// The gap this closes, measured on 2026-08-23 before the change: five invocations produced
// ONE receipt. Only the success recorded anything. A gate refusal, a prose skill with no
// backend, a validation error and an unknown skill each left nothing — so an agent attempting
// a red, irreversible skill and being refused was the one event in the whole system that
// vanished without trace. A ledger that records only what succeeded is a ledger of good news.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-receipts-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const { runSkill, getSkill, listSkills } = await import('../scripts/run-skill.mjs');

const LEDGER = () => path.join(process.env.LEDGER_DIR, 'beacons.ndjson');
const records = () => (fs.existsSync(LEDGER())
  ? fs.readFileSync(LEDGER(), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).record)
  : []);
const count = () => records().length;
const last = () => records().at(-1);

// Runs fn and returns how many receipts the ledger gained, swallowing a throw so the
// count is measured either way — a run that failed is still a run.
function gained(fn) {
  const before = count();
  try { fn(); } catch { /* the throw is asserted separately */ }
  return count() - before;
}

/* ── one receipt per run, on every path ───────────────────────────────────────── */

test('a successful run leaves exactly one receipt — not two', () => {
  // The handler already signs its own domain evidence. The wrapper must not add a second,
  // or the ledger stops being a run log and becomes a mixture.
  assert.equal(gained(() => runSkill('framework-map', { input: 'an AI tool that screens job candidates' })), 1);
});

test('a GATE REFUSAL leaves a receipt — the attempt is the thing worth recording', () => {
  assert.equal(gained(() => runSkill('op-github-deploy', {})), 1);
  const r = last();
  assert.equal(r.action, 'op-github-deploy');
  assert.equal(r.detail.outcome, 'refused');
  assert.equal(r.detail.gated, true);
});

test('a prose skill with no backend leaves a receipt', () => {
  const prose = listSkills().find(s => !s.runnable);
  assert.ok(prose, 'a prose skill must exist for this test to mean anything');
  assert.equal(gained(() => runSkill(prose.name, {})), 1);
  assert.equal(last().detail.outcome, 'not-runnable');
});

test('a run that throws still leaves a receipt, and still throws', () => {
  assert.equal(gained(() => runSkill('framework-map', {})), 1);
  assert.equal(last().detail.outcome, 'failed');
  assert.throws(() => runSkill('framework-map', {}), /needs --input/,
    'the caller must see exactly the error it saw before');
});

test('an unknown skill is a recorded run, not a silent nothing', () => {
  assert.equal(gained(() => runSkill('does-not-exist', {})), 1);
  assert.equal(last().detail.errorKind, 'unknown-skill');
});

test('every outcome is distinguishable in the ledger', () => {
  const seen = new Set(records().filter(r => r.detail?.via === 'runner').map(r => r.detail.outcome));
  for (const o of ['refused', 'not-runnable', 'failed']) {
    assert.ok(seen.has(o), `outcome "${o}" should appear in the ledger`);
  }
});

/* ── what a receipt may never carry ───────────────────────────────────────────── */

test('the INPUT never reaches the ledger — only its hash', () => {
  const canary = 'CANARY-c7f1a9-do-not-log-this-string';
  runSkill('framework-map', { input: canary });
  assert.ok(!fs.readFileSync(LEDGER(), 'utf8').includes(canary),
    'caller input must appear only as a contentHash, never verbatim');
});

test('an error MESSAGE never reaches the ledger, even when it would be convenient', () => {
  // Error strings are the obvious place for caller input to leak into a ledger that gets
  // published. The receipt carries a coarse errorKind and nothing else; "the messages happen
  // to be field-level today" is an assumption, not a control.
  const canary = 'CANARY-9b2e44-inside-an-error';
  try { runSkill(canary, {}); } catch { /* expected */ }
  const text = fs.readFileSync(LEDGER(), 'utf8');
  assert.ok(!text.includes('unknown skill:'), 'no error message text in the ledger');
  const r = last();
  assert.equal(r.detail.errorKind, 'unknown-skill');
  for (const k of ['reason', 'message', 'error', 'stack']) {
    assert.equal(r.detail[k], undefined, `detail must carry no free-text "${k}"`);
  }
});

test('a run receipt carries no payload, ever', () => {
  const r = records().filter(x => x.detail?.via === 'runner').at(-1);
  assert.equal(r.payload, undefined);
  assert.equal(r.content, undefined);
  assert.ok(typeof r.contentHash === 'string' && /^[0-9a-f]{64}$/.test(r.contentHash),
    'the input is present as a sha256 and in no other form');
});

/* ── the invariant, over the whole registry ───────────────────────────────────── */

test('EVERY skill in the registry leaves exactly one receipt when run', () => {
  // The guard: a new skill, runnable or not, gated or not, cannot be added in a way that
  // runs without recording. Before row 12b this assertion failed for 11 of 17 skills.
  for (const s of listSkills()) {
    const n = gained(() => runSkill(s.name, {}));
    assert.equal(n, 1, `${s.name} left ${n} receipt(s), expected exactly 1`);
  }
});

test('the gated skill still refuses to act — recording it is not permitting it', () => {
  const out = runSkill('op-github-deploy', {});
  assert.equal(out.ran, false, 'a receipt must never become an execution');
  assert.equal(out.gated, true);
});

test('the receipt records the DECLARED risk class, so the ledger says what was attempted', () => {
  assert.equal(getSkill('op-github-deploy').risk, 'red');
  runSkill('op-github-deploy', {});
  assert.equal(last().detail.risk, 'red');
  assert.equal(last().detail.outcome, 'refused');
});

test('recording risk did not become enforcing it', () => {
  // Deliberate and worth stating: `risk:` is parsed and recorded, and drives nothing. The
  // blocking check still keys off the handler name, so a second red skill given a handler
  // would not be stopped by it. estate-mailer is classed red and has no handler today, which
  // is the only reason that is theoretical. Changing enforcement is a founder's call.
  const red = listSkills().filter(s => getSkill(s.name).risk === 'red');
  assert.ok(red.length >= 2, 'two skills are classed red');
  assert.deepEqual(red.map(s => s.name).sort(), ['estate-mailer', 'op-github-deploy']);
  assert.equal(getSkill('estate-mailer').runnable, false,
    'if estate-mailer ever gains a handler, the hardcoded gate must be revisited first');
});
