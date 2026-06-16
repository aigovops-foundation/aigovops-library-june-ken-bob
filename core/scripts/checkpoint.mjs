#!/usr/bin/env node
// scripts/checkpoint.mjs — anchor the ledger (#9), or verify from the latest anchor.
//   node scripts/checkpoint.mjs          # create a checkpoint over the current head
//   node scripts/checkpoint.mjs verify   # segmented verify (O(n - checkpoint))
import { createCheckpoint, verifyFromCheckpoint, segmentsToArchive } from '../src/core/checkpoints.js';

const cmd = process.argv[2] || 'create';
if (cmd === 'verify') {
  const r = verifyFromCheckpoint();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.valid ? 0 : 1);
} else {
  console.log(JSON.stringify(createCheckpoint(), null, 2));
  console.log('archive insight:', JSON.stringify(segmentsToArchive()));
}
