// test/agents.test.mjs
// Phase 2 — the propose-only agent runtime: routes intent → agent → skill,
// always returns a proposal, never auto-acts.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-agents-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const { route, dispatch, listAgents } = await import('../src/core/agents.js');

// deterministic responder so we don't depend on Ollama
const respond = async ({ prompt }) => ({ text: `[reply] ${prompt.slice(0, 12)}`, model: { provider: 'test' } });

test('route picks the right agent, Concierge is the fallback', () => {
  assert.equal(route('what regulations apply to my hiring AI?'), 'lantern');
  assert.equal(route('is this safe to publish? scan for secrets'), 'guardian');
  assert.equal(route('check accessibility / wcag'), 'aperture');
  assert.equal(route('what shipped this week? status report'), 'herald');
  assert.equal(route('hello there'), 'concierge');
});

test('dispatch runs the agent skill and returns a proposal (propose-only)', async () => {
  const out = await dispatch('an AI tool that screens job candidates', { respond });
  assert.equal(out.agent, 'lantern');
  assert.ok(out.skill && out.skill.result.result.gates.length > 0, 'ran framework-map');
  assert.equal(out.proposal.requiresHumanGate !== undefined, true);
  assert.ok(out.reply.startsWith('[reply]'));
  assert.match(out.note, /propose-only/);
});

test('an irreversible intent is flagged for the human gate, not executed', async () => {
  const out = await dispatch('delete the production ledger', { respond });
  assert.equal(out.proposal.requiresHumanGate, true);
});

test('listAgents enumerates the staff', () => {
  const names = listAgents().map((a) => a.name);
  for (const n of ['lantern', 'guardian', 'aperture', 'herald', 'sentinel', 'beacon', 'concierge']) assert.ok(names.includes(n));
});
