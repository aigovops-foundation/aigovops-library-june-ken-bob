#!/usr/bin/env node
// core/scripts/export-evidence.mjs
// SIGNED EVIDENCE EXPORT (Ticket 10, second half).
// Packages the whole ledger into a self-contained bundle an auditor verifies
// OFFLINE with openssl + the published public key — no network, no AiGovOps code.
// Per receipt it writes the canonical (RFC 8785) record bytes, the raw Ed25519
// signature, and the chain's `prev` hash; plus a verify.sh that checks every
// signature (openssl) and the append-only hash chain (shasum).
//
// Run:  cd core && node scripts/export-evidence.mjs [outDir]   (default ./evidence-bundle)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Keep keys/ledger inside core/ regardless of CWD (tests override via env first).
if (!process.env.KEYS_DIR) process.env.KEYS_DIR = path.resolve(__dirname, '..', 'keys');
if (!process.env.LEDGER_DIR) process.env.LEDGER_DIR = path.resolve(__dirname, '..', 'ledger');

const beacon = await import('../src/core/beacon.js');

const VERIFY_SH = `#!/usr/bin/env bash
# Offline verification of an AiGovOps evidence bundle — openssl + shasum only.
# No network, no AiGovOps code. Verifies every Ed25519 signature against the
# published public key, and the append-only hash chain.
#
# Needs OpenSSL 3.x (Ed25519). macOS ships LibreSSL, which lacks Ed25519 — if so
# this script tells you and points to the bundled Node verifier (verify.mjs),
# which works anywhere Node runs.
set -euo pipefail
DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PUB="$DIR/public-key.pem"
if ! openssl pkey -pubin -in "$PUB" -noout >/dev/null 2>&1; then
  echo "This openssl build cannot load Ed25519 keys (e.g. macOS LibreSSL)."
  echo "Use OpenSSL 3.x, or run the bundled Node verifier:  node \\"$DIR/verify.mjs\\""
  exit 2
fi
sha() { if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1; else sha256sum "$1" | cut -d' ' -f1; fi; }
fail=0; n=0; prev="null"
for msg in "$DIR"/entries/*.msg; do
  [ -e "$msg" ] || { echo "no entries found"; exit 1; }
  base="\${msg%.msg}"
  if ! openssl pkeyutl -verify -pubin -inkey "$PUB" -rawin -in "$msg" -sigfile "$base.sig" >/dev/null 2>&1; then
    echo "BAD SIGNATURE: $(basename "$base")"; fail=1
  fi
  stored="$(cat "$base.prev")"
  if [ "$stored" != "$prev" ]; then echo "BROKEN CHAIN at $(basename "$base"): expected $prev, got $stored"; fail=1; fi
  prev="$(sha "$msg")"; n=$((n+1))
done
if [ "$fail" -eq 0 ]; then echo "verified $n entries (signatures + chain) — offline, openssl only"; else echo "verification FAILED"; fi
exit $fail
`;

// A self-contained Node verifier shipped in the bundle — works anywhere Node
// runs (Node's crypto always supports Ed25519), so the bundle is verifiable even
// where openssl lacks Ed25519. No AiGovOps code, no dependencies.
const VERIFY_MJS = `#!/usr/bin/env node
// Offline verification of an AiGovOps evidence bundle — Node built-ins only.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const pub = crypto.createPublicKey(fs.readFileSync(path.join(dir, 'public-key.pem')));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const msgs = fs.readdirSync(path.join(dir, 'entries')).filter((f) => f.endsWith('.msg')).sort();
let fail = 0, prev = 'null';
for (const m of msgs) {
  const base = m.slice(0, -4);
  const msg = fs.readFileSync(path.join(dir, 'entries', base + '.msg'));
  const sig = fs.readFileSync(path.join(dir, 'entries', base + '.sig'));
  if (!crypto.verify(null, msg, pub, sig)) { console.log('BAD SIGNATURE:', base); fail = 1; }
  const stored = fs.readFileSync(path.join(dir, 'entries', base + '.prev'), 'utf8');
  if (stored !== prev) { console.log('BROKEN CHAIN at', base, '- expected', prev, 'got', stored); fail = 1; }
  prev = sha(msg);
}
console.log(fail ? 'verification FAILED' : ('verified ' + msgs.length + ' entries (signatures + chain) - node, offline'));
process.exit(fail);
`;

export function exportEvidence(outDir) {
  const f = beacon.ledgerFile();
  const signed = fs.existsSync(f)
    ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];

  fs.mkdirSync(outDir, { recursive: true });
  fs.rmSync(path.join(outDir, 'entries'), { recursive: true, force: true }); // no stale entries
  fs.mkdirSync(path.join(outDir, 'entries'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'public-key.pem'), beacon.publicKeyPem());

  let chainHead = null;
  signed.forEach((s, i) => {
    const name = String(i).padStart(4, '0');
    const canon = beacon.canonicalize(s.record);                 // RFC 8785 bytes
    fs.writeFileSync(path.join(outDir, 'entries', `${name}.msg`), canon);
    fs.writeFileSync(path.join(outDir, 'entries', `${name}.sig`), Buffer.from(s.sig, 'base64')); // raw Ed25519
    fs.writeFileSync(path.join(outDir, 'entries', `${name}.prev`), s.record.prev === null ? 'null' : String(s.record.prev));
    chainHead = beacon.sha256(canon);
  });

  const manifest = {
    profile: 'aigovops-beacon.v1',
    canonicalization: 'RFC 8785 (JCS)',
    algorithm: 'ed25519',
    entries: signed.length,
    verified: beacon.verifyLedger().valid,   // self-check at export time
    chainHead,
    verifiers: ['verify.sh (openssl 3.x)', 'verify.mjs (node, anywhere)'],
  };
  fs.writeFileSync(path.join(outDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  const sh = path.join(outDir, 'verify.sh');
  fs.writeFileSync(sh, VERIFY_SH);
  fs.chmodSync(sh, 0o755);
  fs.writeFileSync(path.join(outDir, 'verify.mjs'), VERIFY_MJS);

  return { outDir, ...manifest };
}

function main() {
  const outDir = path.resolve(process.argv[2] || path.join(process.cwd(), 'evidence-bundle'));
  const r = exportEvidence(outDir);
  console.log(`\n📦 Evidence bundle → ${r.outDir}`);
  console.log(`   entries: ${r.entries}  ·  self-verify: ${r.verified}  ·  ${r.canonicalization}`);
  console.log(`   verify offline (openssl 3.x):  bash ${path.join(r.outDir, 'verify.sh')}`);
  console.log(`   verify offline (node, anywhere):  node ${path.join(r.outDir, 'verify.mjs')}\n`);
  process.exit(r.verified ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (e) { console.error('export-evidence error:', e.message); process.exit(1); }
}
