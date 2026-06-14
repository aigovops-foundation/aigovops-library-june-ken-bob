#!/usr/bin/env node
// core/scripts/sbom.mjs
// SBOM (Ticket 9) — a CycloneDX 1.5 Software Bill of Materials for the governed
// core. The core is intentionally dependency-free, so the strongest claim this
// makes is verifiable: ZERO third-party runtime components — no supply chain to
// audit. An enclave operator ships this alongside the signed release.
//
// Run:  cd core && node scripts/sbom.mjs [outFile]   (default ./sbom.cdx.json)
// Pure: reads package.json + the source tree; no network, no dependencies.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.resolve(__dirname, '..');

function listSource(dir, acc = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'ledger', 'keys', '.git'].includes(d.name)) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) listSource(p, acc);
    else if (/\.(mjs|js)$/.test(d.name)) acc.push(p);
  }
  return acc;
}

export function buildSbom({ now = '1970-01-01T00:00:00Z' } = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(CORE, 'package.json'), 'utf8'));
  const deps = Object.keys(pkg.dependencies || {});
  const files = listSource(CORE).sort();
  // Hash the whole source set into one stable component hash.
  const h = crypto.createHash('sha256');
  for (const f of files) h.update(path.relative(CORE, f) + '\0' + fs.readFileSync(f));
  const sourceHash = h.digest('hex');

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp: now,
      tools: [{ vendor: 'AiGovOps', name: 'sbom.mjs', version: pkg.version }],
      component: {
        type: 'application',
        name: pkg.name,
        version: pkg.version,
        licenses: [{ license: { id: pkg.license || 'Apache-2.0' } }],
        hashes: [{ alg: 'SHA-256', content: sourceHash }],
        properties: [
          { name: 'aigovops:files', value: String(files.length) },
          { name: 'aigovops:runtime', value: 'node>=' + (pkg.engines?.node || '20').replace(/[^\d.]/g, '') },
          { name: 'aigovops:dependency-free', value: String(deps.length === 0) },
        ],
      },
    },
    // The whole point: no third-party runtime components.
    components: deps.map((name) => ({ type: 'library', name, version: pkg.dependencies[name] })),
    dependencyCount: deps.length,
  };
}

function main() {
  const out = process.argv[2] || path.join(CORE, 'sbom.cdx.json');
  const sbom = buildSbom({ now: new Date().toISOString() });
  fs.writeFileSync(out, JSON.stringify(sbom, null, 2) + '\n');
  console.log(`SBOM written: ${out}`);
  console.log(`  component: ${sbom.metadata.component.name}@${sbom.metadata.component.version}`);
  console.log(`  third-party runtime components: ${sbom.dependencyCount} (dependency-free=${sbom.metadata.component.properties.find((p) => p.name === 'aigovops:dependency-free').value})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
