#!/usr/bin/env node
// scripts/enclave-preflight.mjs — "what is missing on this host?"
//
//   npm run enclave:preflight            # table; exits 1 if anything required is missing
//   npm run enclave:preflight -- --json  # machine-readable (for the shell kit)
//
// FAIL-CLOSED: an unprobeable component counts as missing. Reports BOTH halves
// of readiness — the components installed (this file) and the env posture
// (enclave.js) — because a host can have every binary and still be misconfigured.

import { preflight } from '../src/core/enclave.bringup.js';
import { enclavePreflight } from '../src/core/enclave.js';

const JSON_MODE = process.argv.includes('--json');

const pre = preflight();
const posture = enclavePreflight(process.env);

if (JSON_MODE) {
  console.log(JSON.stringify({ components: pre, posture }, null, 2));
  process.exit(pre.ok ? 0 : 1);
}

const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

console.log('\n  ENCLAVE PREFLIGHT — components on this host\n');
for (const c of pre.components) {
  const mark = c.present ? g('✓') : (c.required ? r('✗') : dim('–'));
  const ver = c.present ? dim(c.version) : dim(c.required ? 'MISSING' : 'optional, absent');
  console.log(`  ${mark} ${c.label.padEnd(24)} ${ver}`);
  if (!c.present) console.log(`      ${dim('unlocks:')} ${c.unlocks}`);
}

console.log('\n  ENV POSTURE — the enclave dials (enclave.js)\n');
for (const c of posture.checks) {
  console.log(`  ${c.ok ? g('✓') : r('✗')} ${c.label.padEnd(24)} ${c.ok ? '' : dim('want ' + c.want)}`);
}

if (!pre.ok) {
  console.log(`\n  ${r('missing:')} ${pre.missing.join(', ')}`);
  console.log('  install them:  sudo bash deploy/enclave/install-components.sh\n');
} else if (!posture.hardened) {
  console.log(`\n  ${r('posture not hardened:')} ${posture.failures.join(', ')}`);
  console.log('  render the env:  bash deploy/enclave/render-env.sh\n');
} else {
  console.log(`\n  ${g('all components present and the posture is hardened')} — run npm run enclave:verify\n`);
}

process.exit(pre.ok ? 0 : 1);
