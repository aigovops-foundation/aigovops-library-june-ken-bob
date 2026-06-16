#!/usr/bin/env node
// scripts/rotate-keys.mjs — rotate the Beacon signing key (#10). Archives the
// current public key (so historical receipts keep verifying), mints a new keypair,
// and emits a signed rotation receipt. Verifies the ledger across the rotation.
//   node scripts/rotate-keys.mjs
import * as beacon from '../src/core/beacon.js';

const before = beacon.keyring();
console.log('rotating signing key…  current:', before.current, ' retired keys:', before.all.length - 1);
const r = beacon.rotateKeys();
const v = beacon.verifyLedger();
console.log(JSON.stringify({ ...r, ledgerValid: v.valid, ledgerEntries: v.entries, keyring: beacon.keyring() }, null, 2));
process.exit(v.valid ? 0 : 1);
