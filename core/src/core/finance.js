// src/core/finance.js
// COMMUNITY / FINANCE (Phase 5) — DESIGN + STUB ONLY. No real money moves here.
// A PaymentProvider interface + StubProvider so membership/finance flows are
// testable end to end; a real processor (e.g. Stripe) plugs in behind the same
// interface later — which is an irreversibility-boundary step (account + keys, and
// a real charge goes through the human-approved gate). Receipts are metadata-only:
// amount/plan/memo, NEVER card data or PII.

import * as beacon from './beacon.js';

export const PLANS = {
  lab: { id: 'lab', priceUsd: 0, blurb: 'local-first, $0 — run it yourself' },
  community: { id: 'community', priceUsd: 9, blurb: 'hosted community access' },
  enclave: { id: 'enclave', priceUsd: 0, blurb: 'run-it-yourself; offline-verifiable; support by contract' },
};

export class PaymentProvider {
  async subscribe() { throw new Error('not-implemented'); }
  async charge() { throw new Error('not-implemented'); }
  status() { throw new Error('not-implemented'); }
}

// Stub: records the intent + emits a metadata-only receipt; moves NO money.
export class StubPaymentProvider extends PaymentProvider {
  constructor({ emit = beacon.emit } = {}) { super(); this.emit = emit; this.subs = new Map(); }

  async subscribe(memberId, planId) {
    const plan = PLANS[planId];
    if (!plan) throw new Error('unknown-plan');
    this.subs.set(memberId, { planId, since: new Date().toISOString() });
    this.emit({ kind: 'finance', actor: memberId, action: 'subscribe', detail: { plan: planId, priceUsd: plan.priceUsd, dryRun: true, processor: 'stub' } });
    return { ok: true, memberId, plan: planId, dryRun: true };
  }

  async charge(memberId, amountUsd, memo = '') {
    if (!(amountUsd >= 0)) throw new Error('bad-amount');
    this.emit({ kind: 'finance', actor: memberId, action: 'charge', detail: { amountUsd, memo: String(memo).slice(0, 60), dryRun: true, processor: 'stub' } });
    return { ok: true, charged: false, dryRun: true, amountUsd }; // NEVER moves money
  }

  status(memberId) {
    const s = this.subs.get(memberId);
    return s ? { memberId, planId: s.planId, since: s.since, active: true } : { memberId, planId: 'lab', active: false };
  }
}

// A real processor goes here later (behind a PROVIDER env), same interface.
export function createPaymentProvider() {
  return new StubPaymentProvider();
}
