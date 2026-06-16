// src/core/notify.dashboard.js
// DASHBOARD channel — the always-on, zero-egress default. Hermes pushes every
// notification here; the management UI (/messaging) and an SSE feed read it.
// Holds a bounded in-memory ring of METADATA-ONLY entries (no body, ever) and
// notifies live subscribers. This is what makes "two-way + alerts" work out of
// the box with nothing to configure and nothing leaving the box.

import { Notifier } from './notify.shared.js';

export class DashboardNotifier extends Notifier {
  constructor({ capacity = 200 } = {}) {
    super();
    this.capacity = capacity;
    this._ring = [];                 // metadata-only entries (newest last)
    this._subs = new Set();          // live subscribers (SSE)
    this._seq = 0;
  }
  get name() { return 'dashboard'; }
  configured() { return true; }      // always available — it's in-process
  hosts() { return []; }             // no egress

  // The dashboard "delivers" by recording a metadata-only entry and fanning it to
  // live subscribers. We deliberately keep the summary here (it is the operator's
  // own surface, role-scoped at the API) but NEVER the body. The ledger receipt,
  // emitted by the orchestrator, still records only kind/severity/hash.
  async send(msg) {
    const entry = {
      seq: ++this._seq,
      ts: new Date().toISOString(),
      kind: msg.kind, severity: msg.severity, audience: msg.audience,
      summary: msg.summary,            // shown in the operator console only
    };
    this._ring.push(entry);
    if (this._ring.length > this.capacity) this._ring.shift();
    for (const fn of this._subs) { try { fn(entry); } catch { /* a dead subscriber must not break delivery */ } }
    return { delivered: true, id: `dash-${entry.seq}`, detail: 'recorded' };
  }

  // Role-scoped read is enforced at the API layer; this returns the raw ring.
  feed({ limit = 50 } = {}) { return this._ring.slice(-limit); }

  subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); }

  async health() { return { ok: true, channel: 'dashboard', detail: `${this._ring.length} buffered` }; }
}
