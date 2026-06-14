#!/usr/bin/env node
// core/scripts/release.mjs
// SIGNED RELEASE (Ticket 9) — the "run-it-yourself, verify-offline" package.
// Builds a release manifest (every source file + its SHA-256, plus the SBOM
// hash), signs it with the core's Ed25519 key, and writes a self-contained dir:
//   release/MANIFEST.json        the manifest (canonical-friendly)
//   release/MANIFEST.sig.json    the Ed25519 signature envelope {record,sig,kid}
//   release/public-key.pem       the published verification key
//   release/sbom.cdx.json        the CycloneDX SBOM (dependency-free proof)
//   release/verify.mjs           an OFFLINE verifier — Node built-ins only
//
// An enclave operator can take this dir to an air-gapped host and confirm the
// release is authentic and unmodified with `node release/verify.mjs` — no
// network, no npm, no AiGovOps code.
//
// Run:  cd core && node scripts/release.mjs [outDir]   (default ./release)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.resolve(__dirname, '..');
if (!process.env.KEYS_DIR) process.env.KEYS_DIR = path.resolve(CORE, 'keys');

const beacon = await import('../src/core/beacon.js');
const { buildSbom } = await import('./sbom.mjs');

function listSource(dir, acc = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'ledger', 'keys', '.git', 'release', 'evidence-bundle'].includes(d.name)) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) listSource(p, acc);
    else if (/\.(mjs|js|json|md|rego|yml|yaml)$/.test(d.name)) acc.push(p);
  }
  return acc;
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export function buildReleaseManifest({ now = '1970-01-01T00:00:00Z' } = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(CORE, 'package.json'), 'utf8'));
  const sbom = buildSbom({ now });
  const files = listSource(CORE).sort().map((f) => ({ path: path.relative(CORE, f), sha256: sha256(fs.readFileSync(f)) }));
  const sourceHash = sha256(files.map((f) => `${f.path}:${f.sha256}`).join('\n'));
  return {
    name: pkg.name,
    version: pkg.version,
    generatedAt: now,
    dependencyCount: sbom.dependencyCount,
    sbomHash: sha256(JSON.stringify(sbom)),
    sourceHash,
    fileCount: files.length,
    files,
  };
}

// The offline verifier shipped in the release — Node built-ins only, no deps.
const VERIFY_MJS = `#!/usr/bin/env node
// Offline verification of an AiGovOps signed release. Node built-ins only.
// Checks: (1) the Ed25519 signature over MANIFEST matches public-key.pem;
//         (2) every listed file's SHA-256 matches (run from the source root).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const here = path.dirname(new URL(import.meta.url).pathname);
function canon(v){ if(v===null)return'null'; if(typeof v==='number')return String(v);
  if(typeof v==='boolean')return v?'true':'false'; if(typeof v==='string')return JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(canon).join(',')+']';
  return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}'; }
const manifest = JSON.parse(fs.readFileSync(path.join(here,'MANIFEST.json'),'utf8'));
const env = JSON.parse(fs.readFileSync(path.join(here,'MANIFEST.sig.json'),'utf8'));
const pub = crypto.createPublicKey(fs.readFileSync(path.join(here,'public-key.pem')));
const sigOk = crypto.verify(null, Buffer.from(canon(env.record),'utf8'), pub, Buffer.from(env.sig,'base64'));
if(!sigOk){ console.error('BAD SIGNATURE on MANIFEST'); process.exit(1); }
const root = process.argv[2] || path.resolve(here,'..');
let bad=0;
for(const f of manifest.files){ const p=path.join(root,f.path);
  if(!fs.existsSync(p)){ console.error('MISSING',f.path); bad++; continue; }
  const h=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  if(h!==f.sha256){ console.error('MODIFIED',f.path); bad++; } }
console.log(sigOk?'signature OK':'signature BAD', '— files checked',manifest.files.length,'mismatches',bad);
process.exit(bad?1:0);
`;

function main() {
  const outDir = process.argv[2] || path.join(CORE, 'release');
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = buildReleaseManifest({ now: new Date().toISOString() });
  const signed = beacon.sign(manifest);                       // Ed25519 over the canonical manifest
  fs.writeFileSync(path.join(outDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'MANIFEST.sig.json'), JSON.stringify(signed, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'public-key.pem'), beacon.publicKeyPem());
  fs.writeFileSync(path.join(outDir, 'sbom.cdx.json'), JSON.stringify(buildSbom({ now: new Date().toISOString() }), null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'verify.mjs'), VERIFY_MJS);
  console.log(`Signed release written: ${outDir}`);
  console.log(`  ${manifest.name}@${manifest.version} · ${manifest.fileCount} files · deps=${manifest.dependencyCount} · kid=${signed.kid}`);
  console.log(`  verify offline:  node ${path.join(outDir, 'verify.mjs')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
