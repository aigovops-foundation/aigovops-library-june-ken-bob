// src/core/oversight.js
// OVERSIGHT (Ticket 6, core) — one ledger, role-scoped views, and a steward-only
// kill switch. Stewards see every receipt and can halt; members see only their
// own effects. The live SSE console UI is the remaining (product) half of T6.

import fs from 'node:fs';
import * as beacon from './beacon.js';

function records() {
  const f = beacon.ledgerFile();
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).record);
}

// Role-scoped view: steward → the whole ledger; anyone else → only the receipts
// whose actor is them. Returns metadata-only records (there are no payloads).
export function ledgerView({ role = 'member', id = 'member:anon' } = {}) {
  const recs = records();
  return role === 'steward' ? recs : recs.filter((r) => r.actor === id);
}

// Only stewards may arm the global kill switch.
export function canKill(role) { return role === 'steward'; }
