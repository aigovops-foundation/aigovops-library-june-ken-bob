// test/run-skill-generic.test.mjs
// Ticket A1 (remainder): the generic `run:` dispatch. A NEW skill becomes
// runnable by adding a `run: core:<module>#<fn>` line + an inputs schema — with
// NO change to run-skill.mjs. We register a fresh skill in a temp SKILLS_DIR and
// drive it through the same runner + ledger.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-genskill-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

// A brand-new skill, defined ONLY by its SKILL.md (no runner edit).
const SKILLS = path.join(TMP, 'skills');
fs.mkdirSync(path.join(SKILLS, 'gate-evaluate'), { recursive: true });
fs.writeFileSync(path.join(SKILLS, 'gate-evaluate', 'SKILL.md'), `---
name: gate-evaluate
description: Evaluate a problem through the Yes-Gate engine and return its gates.
run: core:policy.js#evaluate
inputs: {"type":"object","required":["input"],"properties":{"input":{"type":"string","minLength":1}}}
outputs: {"type":"object"}
---

# gate-evaluate

**Owning agent:** Lantern

## Human gate
None
`);
process.env.SKILLS_DIR = SKILLS;

const { listSkills, runSkill } = await import('../scripts/run-skill.mjs');
const beacon = await import('../src/core/beacon.js');

test('a new core: skill is runnable with no runner code change', () => {
  const s = listSkills().find((x) => x.name === 'gate-evaluate');
  assert.ok(s, 'the new skill is registered');
  assert.strictEqual(s.runnable, true, 'core: dispatch makes it runnable');
});

test('the generic invoker runs the core fn and emits one receipt', () => {
  const before = beacon.ledgerCount();
  const res = runSkill('gate-evaluate', { input: 'an AI tool that screens job candidates' });
  assert.ok(res.result && res.result.gates.length > 0, 'evaluate() result flows through');
  assert.strictEqual(res.receipt.action, 'gate-evaluate');
  assert.strictEqual(beacon.ledgerCount(), before + 1, 'exactly one receipt');
  assert.strictEqual(beacon.verifyLedger().valid, true);
});

test('declared inputs schema is enforced on the generic path', () => {
  assert.throws(() => runSkill('gate-evaluate', {}), /input validation failed/);
  assert.throws(() => runSkill('gate-evaluate', { input: '' }), /input validation failed/);
});
