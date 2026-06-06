import { test } from 'node:test';
import assert from 'node:assert';
import * as beacon from '../src/core/beacon.js';
import { evaluate } from '../src/core/policy.js';

test('beacon signs and verifies a metadata-only receipt', () => {
  beacon.loadOrCreateKeys();
  const signed = beacon.sign(beacon.buildReceipt({ kind: 'prompt', actor: 'member:anon', action: 'ask', contentHash: beacon.sha256('hello') }));
  assert.equal(beacon.verifySigned(signed), true);
});

test('tampering breaks verification', () => {
  const signed = beacon.sign(beacon.buildReceipt({ kind: 'prompt', actor: 'member:anon', action: 'ask' }));
  signed.record.action = 'tampered';
  assert.equal(beacon.verifySigned(signed), false);
});

test('policy turns a hiring problem into high risk with the right gates', () => {
  const r = evaluate('a gen-AI tool that screens job candidates');
  assert.equal(r.risk, 'high');
  const fws = r.gates.map(g => g.framework);
  assert.ok(fws.includes('NYC Local Law 144'));
  assert.ok(r.gates.every(g => g.decision === 'no' && g.act === 'get'));
});
