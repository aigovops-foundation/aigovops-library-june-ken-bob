// test/a11y.test.mjs
// Step 5 — the static accessibility-audit backend (the provable, no-browser subset).

import { test } from 'node:test';
import assert from 'node:assert';
import { audit } from '../src/core/a11y.js';

test('flags a page with the common failures', () => {
  const types = audit('<html><body><img src="x"><a href="#"></a></body></html>').findings.map((f) => f.type);
  for (const t of ['img-missing-alt', 'missing-lang', 'missing-title', 'no-h1', 'missing-viewport', 'empty-link']) {
    assert.ok(types.includes(t), `should flag ${t}`);
  }
});

test('passes a clean page with score 100', () => {
  const good = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width"><title>Hi</title></head>' +
    '<body><h1>Hi</h1><img src="x" alt="a cat"><a href="/next">go</a></body></html>';
  const a = audit(good);
  assert.equal(a.pass, true);
  assert.equal(a.score, 100);
  assert.equal(a.standard, 'WCAG2.2-AA-subset');
});
