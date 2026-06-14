// test/release.test.mjs
// Ticket 9: the SBOM proves zero supply chain, and the signed release verifies
// offline with Node built-ins (the air-gapped operator's check).

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-release-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const beacon = await import('../src/core/beacon.js');
const { buildSbom } = await import('../scripts/sbom.mjs');
const { buildReleaseManifest } = await import('../scripts/release.mjs');

test('SBOM is CycloneDX 1.5 and asserts a dependency-free core', () => {
  const sbom = buildSbom({ now: '2026-06-14T00:00:00Z' });
  assert.strictEqual(sbom.bomFormat, 'CycloneDX');
  assert.strictEqual(sbom.specVersion, '1.5');
  assert.strictEqual(sbom.dependencyCount, 0, 'the core has zero third-party runtime deps');
  assert.deepStrictEqual(sbom.components, [], 'no library components');
  assert.strictEqual(sbom.metadata.component.properties.find((p) => p.name === 'aigovops:dependency-free').value, 'true');
});

test('release manifest hashes the source tree and the SBOM deterministically', () => {
  const a = buildReleaseManifest({ now: '2026-06-14T00:00:00Z' });
  const b = buildReleaseManifest({ now: '2026-06-14T00:00:00Z' });
  assert.strictEqual(a.sourceHash, b.sourceHash, 'stable source hash');
  assert.ok(a.fileCount > 0 && a.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256)));
  assert.ok(a.files.some((f) => f.path === 'src/core/beacon.js'), 'includes core source');
});

test('the signed manifest verifies offline against the published public key', () => {
  const manifest = buildReleaseManifest({ now: '2026-06-14T00:00:00Z' });
  const signed = beacon.sign(manifest);                 // what release.mjs writes to MANIFEST.sig.json
  const pub = crypto.createPublicKey(beacon.publicKeyPem());
  // Re-derive the canonical bytes exactly as an offline verifier would.
  const canon = (v) => v === null ? 'null'
    : typeof v === 'number' ? String(v)
    : typeof v === 'boolean' ? (v ? 'true' : 'false')
    : typeof v === 'string' ? JSON.stringify(v)
    : Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
    : '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  const ok = crypto.verify(null, Buffer.from(canon(signed.record), 'utf8'), pub, Buffer.from(signed.sig, 'base64'));
  assert.strictEqual(ok, true, 'Ed25519 signature verifies with Node built-ins only');
  // tamper: flip the version -> signature must fail
  const tampered = { ...signed.record, version: signed.record.version + '-evil' };
  assert.strictEqual(crypto.verify(null, Buffer.from(canon(tampered), 'utf8'), pub, Buffer.from(signed.sig, 'base64')), false);
});
