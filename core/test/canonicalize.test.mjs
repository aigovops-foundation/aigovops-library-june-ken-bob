// test/canonicalize.test.mjs
// Ticket 10 — the Beacon canonicalizer must implement RFC 8785 (JCS) so receipts
// are byte-for-byte reproducible and cross-implementation verifiable.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolate beacon's keys/ledger (canonicalize is pure, but importing beacon
// freezes KEYS_DIR — keep it off the repo).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-jcs-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');
const { canonicalize } = await import('../src/core/beacon.js');

test('object keys sort by UTF-16 code units', () => {
  // a(97) < b(98) < z(122) < é(233)
  assert.equal(canonicalize({ b: 1, a: 2, 'é': 3, z: 4 }), '{"a":2,"b":1,"z":4,"é":3}');
  // nested sort
  assert.equal(canonicalize({ x: { d: 1, c: 2 } }), '{"x":{"c":2,"d":1}}');
});

test('numbers use ECMAScript Number::toString (RFC 8785 §3.2.2.3 vectors)', () => {
  assert.equal(canonicalize(1e30), '1e+30');
  assert.equal(canonicalize(0.002), '0.002');               // 2e-3
  assert.equal(canonicalize(1e-27), '1e-27');               // 0.000...001
  assert.equal(canonicalize(5e-324), '5e-324');             // smallest denormal
  assert.equal(canonicalize(333333333.33333329), '333333333.3333333');
  assert.equal(canonicalize(4.5), '4.5');
  assert.equal(canonicalize(-0), '0');                      // negative zero → "0"
  assert.equal(canonicalize(9007199254740992), '9007199254740992');
});

test('strings use minimal escapes, lowercase \\uXXXX, no needless escaping', () => {
  assert.equal(canonicalize(''), '"\\u000f"');        // control char → lowercase 
  assert.equal(canonicalize('\n'), '"\\n"');                // shorthand for newline
  assert.equal(canonicalize('A/B'), '"A/B"');               // forward slash NOT escaped
  assert.equal(canonicalize("it's"), '"it\'s"');            // apostrophe NOT escaped
  assert.equal(canonicalize('"\\'), '"\\"\\\\"');           // quote + backslash escaped
  assert.equal(canonicalize('€'), '"€"');                   // printable non-ASCII kept literal
});

test('the RFC 8785 worked example: order + number array', () => {
  const input = {
    numbers: [333333333.33333329, 1e30, 4.50, 2e-3, 0.000000000000000000000000001],
    string: 'text',
    literals: [null, true, false],
  };
  const out = canonicalize(input);
  // property order is literals < numbers < string (UTF-16 sort)
  assert.ok(out.indexOf('"literals"') < out.indexOf('"numbers"'));
  assert.ok(out.indexOf('"numbers"') < out.indexOf('"string"'));
  // the number array matches the RFC's canonical serialization exactly
  assert.ok(out.includes('"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27]'));
  assert.ok(out.includes('"literals":[null,true,false]'));
});

test('idempotent + round-trips through JSON.parse', () => {
  const input = { z: [1, { b: 2, a: 'x' }], a: 'é/\n' };
  const once = canonicalize(input);
  assert.equal(canonicalize(JSON.parse(once)), once, 'canonical form is stable');
  assert.deepEqual(JSON.parse(once), input, 'no data lost');
});

test('rejects values JCS cannot represent', () => {
  assert.throws(() => canonicalize(NaN), /non-finite/);
  assert.throws(() => canonicalize(Infinity), /non-finite/);
  assert.throws(() => canonicalize(undefined), /unsupported type/);
  assert.throws(() => canonicalize(10n), /unsupported type/);
});
