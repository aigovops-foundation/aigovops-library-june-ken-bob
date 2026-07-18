#!/usr/bin/env node
// scripts/enclave-verify.mjs — "did every dial actually flip green?"
//
//   npm run enclave:verify              # proves each dial at RUNTIME; exits 1 on any failure
//   npm run enclave:verify -- --json
//
// This is deliberately NOT a config read. Each check exercises the real thing:
// a runsc container reports the gVisor guest kernel, Vault answers /sys/health
// unsealed, `opa` evaluates the shipped rego and agrees "publish" is
// irreversible, OIDC discovery returns a matching issuer, and Postgres accepts a
// real ledger row and gives it back. FAIL-CLOSED throughout.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from '../src/core/enclave.bringup.js';
import { enclavePreflight } from '../src/core/enclave.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_MODE = process.argv.includes('--json');

// The shipped rego lives at core/policy — default POLICY_DIR to it so the check
// works from any cwd.
const env = { ...process.env, POLICY_DIR: process.env.POLICY_DIR || path.resolve(__dirname, '..', 'policy') };

const posture = enclavePreflight(env);
const res = verify({ env });

if (JSON_MODE) {
  console.log(JSON.stringify({ posture, runtime: res }, null, 2));
  process.exit(res.ok && posture.hardened ? 0 : 1);
}

const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

console.log('\n  ENCLAVE VERIFY — runtime proof, not configuration\n');
for (const c of res.checks) {
  console.log(`  ${c.ok ? g('✓') : r('✗')} ${c.label.padEnd(32)} ${dim(c.detail)}`);
}
console.log(`\n  ${posture.hardened ? g('✓') : r('✗')} env posture hardened ${posture.hardened ? '' : dim('(' + posture.failures.join(', ') + ')')}`);

const allGreen = res.ok && posture.hardened;
console.log(allGreen
  ? `\n  ${g('ENCLAVE GREEN')} — T2 Vault · T4 gVisor · T7 rego · T8 OIDC · durable ledger\n`
  : `\n  ${r('NOT GREEN')} — ${res.failures.concat(posture.hardened ? [] : ['posture']).join(', ')}\n`);

process.exit(allGreen ? 0 : 1);
