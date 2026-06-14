#!/usr/bin/env node
// core/scripts/policy-diff.mjs
// Show the DECISION-DIFF of a policy change, and sign the candidate bundle.
// A policy edit is reviewed not by reading rego but by seeing which real intents
// would flip between "needs a human gate" and "reversible". Loosening (a gate
// that DISAPPEARS) is flagged loudly.
//
// Usage:
//   node scripts/policy-diff.mjs --add <verb>      # candidate adds an irreversible verb
//   node scripts/policy-diff.mjs --remove <verb>   # candidate removes one (loosening!)
//   node scripts/policy-diff.mjs --sign            # also Beacon-sign the rego bundle (policy/)
//
// Without the opa binary the diff runs on the JS engine's verb list (data-driven);
// with opa + a candidate policy dir it would diff rego — same decision-diff shape.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.KEYS_DIR) process.env.KEYS_DIR = path.resolve(__dirname, '..', 'keys');
if (!process.env.LEDGER_DIR) process.env.LEDGER_DIR = path.resolve(__dirname, '..', 'ledger');

const { JsPolicyEngine, IRREVERSIBLE_VERBS } = await import('../src/core/policy-engine.js');
const { policyDiff } = await import('../src/core/policy-diff.js');
const { signBundle } = await import('../src/core/policy-bundle.js');

function parse(argv) {
  const o = { add: [], remove: [], sign: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--add') o.add.push(argv[++i]);
    else if (argv[i] === '--remove') o.remove.push(argv[++i]);
    else if (argv[i] === '--sign') o.sign = true;
  }
  return o;
}

function main() {
  const o = parse(process.argv.slice(2));
  const baseline = new JsPolicyEngine();                         // current rule
  const verbs = IRREVERSIBLE_VERBS.filter((v) => !o.remove.includes(v)).concat(o.add.filter((v) => !IRREVERSIBLE_VERBS.includes(v)));
  const candidate = new JsPolicyEngine({ verbs });              // proposed rule
  const diff = policyDiff({ baseline, candidate });

  console.log(`\nPolicy decision-diff — ${diff.flipped}/${diff.total} intents flip`);
  console.log(`  tightened (new gates): ${diff.tightened}   loosened (gates removed): ${diff.loosened}`);
  if (diff.loosened) console.log('  ⚠  LOOSENING — a human gate disappears. Review carefully.');
  for (const f of diff.flips) {
    console.log(`   • "${f.intent}"  gate ${f.from.requiresHumanGate}→${f.to.requiresHumanGate}  level ${f.from.requiredLevel}→${f.to.requiredLevel}`);
  }
  if (o.sign) {
    const { manifest, receipt } = signBundle(path.resolve(__dirname, '..', 'policy'));
    console.log(`\nSigned policy bundle: ${manifest.name} sha256=${manifest.sha256.slice(0, 16)}… kid=${receipt.kid}`);
  }
  console.log('');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
