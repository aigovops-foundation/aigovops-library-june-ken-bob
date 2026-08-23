// test/red-gate.test.mjs
// Ladder row 12c — the boundary is keyed on the DECLARED class, not on a skill's name.
//
// What it used to be: `handlerKey === 'op-github-deploy'`. One skill, by name. A second red
// skill given a backend would have walked straight past it. estate-mailer was already classed
// red and had no handler, which was the only reason the gap was theoretical — a control that
// happened to be correct because nobody had yet added the file that broke it.
//
// The test that matters is the FIRST one: a brand-new skill, declared red, with a backend that
// genuinely works. Under the old gate it would have executed.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-redgate-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const SKILLS = path.join(TMP, 'skills');
// Two skills, IDENTICAL except for `risk:`. Same working backend, same inputs. The only thing
// that may decide whether one runs is the declared class.
const write = (name, risk) => {
  fs.mkdirSync(path.join(SKILLS, name), { recursive: true });
  fs.writeFileSync(path.join(SKILLS, name, 'SKILL.md'), `---
name: ${name}
principle: P1
owner: bobrapp
agent: Lantern
risk: ${risk}
department: governance
description: A skill with a real backend, used to prove the class check decides.
run: core:policy.js#evaluate
inputs: {"type":"object","required":["input"],"properties":{"input":{"type":"string","minLength":1}}}
outputs: {"type":"object"}
---

# ${name}

**Owning agent:** Lantern

## Human gate
None
`);
};
write('danger-red', 'red');
write('safe-green', 'green');
process.env.SKILLS_DIR = SKILLS;

const { runSkill, getSkill } = await import('../scripts/run-skill.mjs');

const LEDGER = () => path.join(process.env.LEDGER_DIR, 'beacons.ndjson');
const records = () => (fs.existsSync(LEDGER())
  ? fs.readFileSync(LEDGER(), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).record)
  : []);
const last = () => records().at(-1);

/* ── the gap row 12c closes ───────────────────────────────────────────────────── */

test('a NEW red skill with a WORKING backend is refused — the case the old gate missed', () => {
  assert.equal(getSkill('danger-red').runnable, true, 'its backend really does dispatch');
  const before = records().length;
  const out = runSkill('danger-red', { input: 'an AI tool that screens job candidates' });

  assert.equal(out.ran, false, 'it must not execute');
  assert.equal(out.gated, true);
  assert.equal(out.risk, 'red');
  assert.equal(out.result, undefined, 'no backend result — the invoker was never reached');
  assert.equal(records().length, before + 1, 'the attempt is still recorded, exactly once');
  assert.equal(last().detail.outcome, 'refused');
  assert.notEqual(last().detail.via, 'core', 'a core: receipt here would mean the backend ran');
});

test('the SAME backend runs when the skill is not red — the class decides, not breakage', () => {
  const out = runSkill('safe-green', { input: 'an AI tool that screens job candidates' });
  assert.ok(out.result, 'a green skill with this backend still produces a result');
  assert.equal(last().detail.via, 'core');
});

test('--approve does not unlock a red skill', () => {
  // Red is not a permission an agent can be granted at the command line. It is work a human
  // does themselves; --approve changes only what the refusal says.
  const out = runSkill('danger-red', { input: 'x', approve: true });
  assert.equal(out.ran, false);
  assert.equal(out.result, undefined);
  assert.match(out.reason, /approved or not/);
});

test('the refusal names the SKILL.md a human should read', () => {
  assert.match(runSkill('danger-red', { input: 'x' }).reason, /plan\/skills\/danger-red\/SKILL\.md/);
});

test('enforcement is not keyed on any skill name', () => {
  // The regression this file exists for. `danger-red` is a name the runner has never heard of,
  // and it is stopped anyway.
  // Asserted against CODE only. The comments deliberately quote the old check to record what
  // was removed and why, and a test that cannot tell those apart would force the history out.
  const code = fs.readFileSync(new URL('../scripts/run-skill.mjs', import.meta.url), 'utf8')
    .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(code, /handlerKey === '[a-z-]+'/,
    'a name-keyed gate is what row 12c removed; it must not come back');
  assert.doesNotMatch(code, /=== 'op-github-deploy'/, 'nor by any other comparison');
});

test('a skill with no declared risk still falls back to the irreversible list', () => {
  // CI forbids a skill without `risk:`, but SKILLS_DIR is overridable and the boundary should
  // not depend on CI having run.
  fs.mkdirSync(path.join(SKILLS, 'op-github-deploy'), { recursive: true });
  fs.writeFileSync(path.join(SKILLS, 'op-github-deploy', 'SKILL.md'), `---
name: op-github-deploy
description: No risk field at all.
---

# op-github-deploy

## Human gate
Bob or Ken.
`);
  const out = runSkill('op-github-deploy', {});
  assert.equal(out.ran, false, 'the fallback still refuses when the class is missing');
  assert.equal(out.gated, true);
});
