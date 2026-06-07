// test/scanners.test.mjs
// Step 5 — the secret/PII scanner backing the Guardian skill. Metadata-only:
// it reports finding TYPES and counts, never the matched value.

import { test } from 'node:test';
import assert from 'node:assert';
import { scanSecrets, scanPII, review } from '../src/core/scanners.js';

// AKIAIOSFODNN7EXAMPLE is AWS's own documented example key — safe to commit.
const FAKE_AWS = 'AKIAIOSFODNN7EXAMPLE';

test('detects secret material', () => {
  const types = scanSecrets(`aws=${FAKE_AWS}\n-----BEGIN PRIVATE KEY-----\nghp_${'A'.repeat(36)}`).map(f => f.type);
  assert.ok(types.includes('aws-access-key'));
  assert.ok(types.includes('private-key-pem'));
  assert.ok(types.includes('github-token'));
});

test('detects PII', () => {
  const types = scanPII('reach me at sam@example.com or 123-45-6789').map(f => f.type);
  assert.ok(types.includes('email'));
  assert.ok(types.includes('us-ssn'));
});

test('clean text is clean', () => {
  const r = review('The AiGovOps Library governs AI with a Yes-Gate and signed receipts.');
  assert.equal(r.clean, true);
  assert.equal(r.findings.length, 0);
});

test('findings are metadata-only — never the matched value', () => {
  const r = review(`token=${FAKE_AWS}`);
  assert.equal(r.clean, false);
  for (const f of r.findings) {
    const keys = Object.keys(f);
    assert.ok(!keys.includes('value') && !keys.includes('match'), 'no raw value in a finding');
  }
});
