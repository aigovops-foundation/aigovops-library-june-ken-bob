// test/scan.test.mjs — Phase D: the prose skills as a build gate have teeth, and
// the shipped pages stay accessible.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit } from '../src/core/a11y.js';
import { scanSecrets } from '../src/core/scanners.js';

const PUB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

test('every shipped public page passes the accessibility-audit subset', () => {
  for (const f of fs.readdirSync(PUB).filter((x) => x.endsWith('.html'))) {
    const r = audit(fs.readFileSync(path.join(PUB, f), 'utf8'));
    assert.ok(r.pass, `${f} fails a11y: ${JSON.stringify(r.findings)}`);
  }
});

test('the secret scanner has teeth (a planted token is caught)', () => {
  assert.ok(scanSecrets('ghp_' + 'a'.repeat(36)).length > 0, 'a GitHub token must be flagged');
  assert.strictEqual(scanSecrets('just some prose with op://AiGovOps/x/y refs').length, 0, 'op:// refs are not secrets');
});
