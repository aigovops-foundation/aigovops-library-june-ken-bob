// src/core/policy-bundle.js
// SIGNED POLICY BUNDLES (Ticket 7). A policy change is itself an auditable
// artifact: we hash the .rego files, build a deterministic manifest, and emit
// ONE Beacon receipt for the bundle. An auditor can later recompute the hash and
// confirm the running policy matches a signed receipt in the ledger.
//
// Metadata only — the receipt carries file names + hashes, never anything secret.

import fs from 'node:fs';
import path from 'node:path';
import * as beacon from './beacon.js';

// Deterministic manifest of a policy directory: every .rego file, sorted, with
// its sha256, plus a bundle hash over the sorted "name:hash" lines.
export function bundleManifest(policyDir, { name = 'aigov-gate' } = {}) {
  const files = fs.readdirSync(policyDir)
    .filter((f) => f.endsWith('.rego'))
    .sort()
    .map((f) => ({ name: f, sha256: beacon.sha256(fs.readFileSync(path.join(policyDir, f), 'utf8')) }));
  const bundleSha = beacon.sha256(files.map((f) => `${f.name}:${f.sha256}`).join('\n'));
  return { name, files, count: files.length, sha256: bundleSha };
}

// Sign a bundle: emit exactly one metadata-only receipt and return it with the
// manifest. The bundle hash is the receipt's contentHash.
export function signBundle(policyDir, { name = 'aigov-gate', emit = beacon.emit } = {}) {
  const manifest = bundleManifest(policyDir, { name });
  const receipt = emit({
    kind: 'policy', actor: 'steward', action: 'bundle',
    contentHash: manifest.sha256,
    detail: { op: 'policy-bundle', name: manifest.name, count: manifest.count, files: manifest.files },
  });
  return { manifest, receipt };
}

// Recompute and compare against an expected bundle hash (e.g. from a receipt).
export function verifyBundle(policyDir, expectedSha, { name = 'aigov-gate' } = {}) {
  const manifest = bundleManifest(policyDir, { name });
  return { ok: manifest.sha256 === expectedSha, actual: manifest.sha256, expected: expectedSha };
}
