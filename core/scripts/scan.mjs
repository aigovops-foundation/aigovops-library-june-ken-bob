#!/usr/bin/env node
// scripts/scan.mjs — Phase D: the prose governance skills, made EXECUTABLE as a
// build gate (dependency-free, runs in CI next to the governance gate).
//   • accessibility-audit  (a11y.js)      → audits every shipped HTML page (WCAG subset)
//   • security-privacy-review (scanners.js) → scans shipped config + docs for secrets
// Secrets + a11y failures BLOCK the build; PII / high-entropy are reported as warnings
// (they false-positive on IPs and op:// refs, so they inform rather than fail).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit } from '../src/core/a11y.js';
import { scanSecrets, scanPII, scanEntropy } from '../src/core/scanners.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.resolve(HERE, '..');
const ROOT = path.resolve(CORE, '..');
const read = (p) => fs.readFileSync(p, 'utf8');
const gather = (dir, exts) => (fs.existsSync(path.join(ROOT, dir)) ? fs.readdirSync(path.join(ROOT, dir)) : [])
  .filter((f) => exts.some((e) => f.endsWith(e))).map((f) => path.join(dir, f));

let blocking = 0, warns = 0;

// 1) accessibility-audit → the public pages
console.log('— accessibility-audit (WCAG 2.2 AA subset) —');
const pubDir = path.join(CORE, 'public');
for (const p of fs.readdirSync(pubDir).filter((f) => f.endsWith('.html'))) {
  const r = audit(read(path.join(pubDir, p)));
  console.log(`  ${r.pass ? 'OK ' : 'XX '} ${p}  score=${r.score}${r.findings.length ? '  ' + r.findings.map((f) => `${f.type}:${f.count}`).join(' ') : ''}`);
  if (!r.pass) blocking += r.findings.reduce((s, f) => s + f.count, 0);
}

// 2) security-privacy-review → shipped config + docs
console.log('— security-privacy-review (secrets block; pii/entropy warn) —');
for (const rel of [...gather('deploy', ['.yml', '.yaml', '.tmpl', '.md', '.sh']), ...gather('plan', ['.md'])]) {
  const text = read(path.join(ROOT, rel));
  const secrets = scanSecrets(text);
  const soft = scanPII(text).length + scanEntropy(text).length;
  if (secrets.length) { console.log(`  XX ${rel}  secrets=${secrets.length}`); blocking += secrets.length; }
  else if (soft) { warns++; }
}
if (warns) console.log(`  ~~ ${warns} file(s) with PII/entropy hits (warn — IPs and op:// refs, not secrets)`);

console.log(blocking === 0 ? `\n✅ scan PASSED${warns ? ` (${warns} warnings)` : ''}` : `\n❌ scan FAILED — ${blocking} blocking finding(s)`);
process.exit(blocking === 0 ? 0 : 1);
