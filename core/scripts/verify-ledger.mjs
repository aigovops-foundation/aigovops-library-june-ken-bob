// scripts/verify-ledger.mjs — verify every signature AND the hash-chain offline.
import { verifyLedger } from '../src/core/beacon.js';
const r = verifyLedger();
console.log(JSON.stringify(r, null, 2));
process.exit(r.valid ? 0 : 1);
