#!/usr/bin/env node
// core/scripts/loop-demo.mjs
// PROVE THE LOOP (Ticket A2, step 4).
// Drives one full governed cycle through govapi —
//   propose → decide(approve) → runTool(sandboxed) → verify
// — in a hermetic temp ledger, and prints the linked receipt trail (proposal →
// brokered secret → tool-run, each chained and signed). Exported as runDemo() so
// CI asserts the receipts link and the chain verifies.
//
// Run:  cd core && node scripts/loop-demo.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Hermetic temp dirs BEFORE importing the core (beacon freezes KEYS_DIR at load).
// If the caller already set them (tests), respect that.
if (!process.env.KEYS_DIR || !process.env.LEDGER_DIR) {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-loopdemo-'));
  process.env.KEYS_DIR = process.env.KEYS_DIR || path.join(TMP, 'keys');
  process.env.LEDGER_DIR = process.env.LEDGER_DIR || path.join(TMP, 'ledger');
}

const { createGovernedCore } = await import('../src/core/govapi.js');
const { FileProvider } = await import('../src/core/secrets.fileprovider.js');
const { Caps } = await import('../src/core/caps.js');
const beacon = await import('../src/core/beacon.js');

const SCOPE = 'github-deploy';

export async function runDemo() {
  const storePath = path.join(os.tmpdir(), `aigov-loopdemo-store-${process.pid}.json`);
  fs.writeFileSync(storePath, JSON.stringify({ owner: 'lab', scopes: { [SCOPE]: 'MASTER-DO-NOT-LEAK' }, rotated: {} }));

  const caps = new Caps();
  caps.setProfile('agent:maker', { level: 'act', maxSpend: 100 });
  const core = createGovernedCore({ secrets: new FileProvider({ storePath }), caps });

  // 1) the agent proposes an irreversible build action
  const { pendingId, requiresHumanGate } = await core.propose('deploy the library site', { actor: 'agent:maker' });
  // 2) the human approves → caps pass → a scoped token is brokered
  const decided = await core.decide(pendingId, 'approve', { scope: SCOPE, ttlSeconds: 60, cost: { requiredLevel: 'act', spend: 1 } });
  // 3) the tool runs sandboxed, presenting the brokered token (fails closed without one)
  const result = await core.runTool({ token: decided.grant.token, code: 'export default async () => "built the thing";' });
  // 4) verify the whole ledger
  const verify = core.verify();

  fs.rmSync(storePath, { force: true });

  const trail = fs.readFileSync(beacon.ledgerFile(), 'utf8').trim().split('\n').filter(Boolean)
    .map((l) => JSON.parse(l))
    .map((s) => ({ id: beacon.receiptId(s.record), kind: s.record.kind, action: s.record.action, parent: s.record.detail?.parent ?? null }));

  return {
    requiresHumanGate,
    proposalId: decided.proposalId,
    tokenIsMaster: decided.grant.token === 'MASTER-DO-NOT-LEAK',
    toolOk: result.ok,
    toolResult: result.result,
    verify,
    trail,
  };
}

async function main() {
  const d = await runDemo();
  console.log('\n☑️  Cloud-Mary — prove the loop (propose → decide → runTool → verify)\n');
  console.log(`  human gate required:  ${d.requiresHumanGate}`);
  console.log(`  token is master:      ${d.tokenIsMaster}   (must be false)`);
  console.log(`  tool ran ok:          ${d.toolOk}  → "${d.toolResult}"`);
  console.log(`  ledger verifies:      ${d.verify.valid}  (${d.verify.entries} entries)\n`);
  console.log('  Receipt trail (each row: kind/action — parent link):');
  for (const r of d.trail) {
    const tag = r.id === d.proposalId ? '  ← the proposal' : (r.parent === d.proposalId ? `  → links to proposal` : '');
    console.log(`    • ${(r.kind + '/' + r.action).padEnd(22)} ${r.id.slice(0, 10)}…${tag}`);
  }
  console.log('');
  process.exit(d.verify.valid && d.toolOk && !d.tokenIsMaster ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('loop-demo error:', e); process.exit(1); });
}
