// src/core/caps.js
// CAPABILITY DIAL + HARD CAPS (Ticket 5).
// Every member and agent has an explicit, reversible capability level and hard
// caps on spend and blast radius. The gate evaluates these BEFORE brokering a
// grant — the agent PAUSES at the cap rather than pushing through. A breach
// emits a signed receipt.
//
// Principle: "capability is a dial they earn, not a switch they flip."
//   read → propose → act → auto
// Defaults are narrow (propose); trust widens; one call narrows again.

// --- levels (ordered) -------------------------------------------------------
export const LEVELS = { read: 0, propose: 1, act: 2, auto: 3 };
export const LEVEL_NAMES = Object.keys(LEVELS);

function levelOk(current, required) {
  return (LEVELS[current] ?? -1) >= (LEVELS[required] ?? Infinity);
}

// --- the dial + caps --------------------------------------------------------
export class Caps {
  /**
   * @param {Object} [opts]
   * @param {Function} [opts.now]   clock injectable for tests
   */
  constructor(opts = {}) {
    this.now = opts.now || (() => Date.now());
    this._profiles = new Map();   // id -> { level, maxSpend, maxRate, windowMs, maxBlastRadius }
    this._usage = new Map();      // id -> { spend, requests: [epoch], blastRadius }
  }

  // --- profile management ---------------------------------------------------
  /**
   * Set or replace the entire capability profile for an id.
   * Missing fields fall back to safe defaults (propose, no caps).
   */
  setProfile(id, { level = 'propose', maxSpend = Infinity, maxRate = Infinity, windowMs = 60_000, maxBlastRadius = Infinity } = {}) {
    if (!(level in LEVELS)) throw new Error(`unknown level '${level}'`);
    this._profiles.set(id, { level, maxSpend, maxRate, windowMs, maxBlastRadius });
    if (!this._usage.has(id)) this._usage.set(id, { spend: 0, requests: [], blastRadius: 0 });
  }

  getProfile(id) {
    return this._profiles.get(id) || null;
  }

  /**
   * Turn the dial — immediately effective on the NEXT request.
   * This is the one-toggle that can narrow capability at any time.
   */
  setLevel(id, level) {
    if (!(level in LEVELS)) throw new Error(`unknown level '${level}'`);
    const p = this._profiles.get(id);
    if (!p) throw new Error(`no profile for '${id}'; call setProfile first`);
    p.level = level;
  }

  // --- check (called by the gate BEFORE brokering) --------------------------
  /**
   * @param {string} id            member or agent id
   * @param {Object} cost          what this action would cost
   * @param {string} cost.requiredLevel  minimum capability level needed (default 'act')
   * @param {number} cost.spend          cost units this action charges (default 0)
   * @param {number} cost.blastRadius    scope of effect (default 0)
   * @returns {{ ok: true } | { ok: false, reason: string, ... }}
   */
  check(id, { requiredLevel = 'act', spend = 0, blastRadius = 0 } = {}) {
    const p = this._profiles.get(id);
    if (!p) return { ok: false, reason: 'no-profile' };
    const u = this._usage.get(id) || { spend: 0, requests: [], blastRadius: 0 };

    // 1) capability level
    if (!levelOk(p.level, requiredLevel)) {
      return { ok: false, reason: 'level', current: p.level, required: requiredLevel };
    }

    // 2) spend cap
    if (u.spend + spend > p.maxSpend) {
      return { ok: false, reason: 'spend-cap', current: u.spend, max: p.maxSpend, requested: spend };
    }

    // 3) rate cap (requests in the current sliding window)
    const now = this.now();
    const windowStart = now - p.windowMs;
    const recent = u.requests.filter((t) => t > windowStart);
    if (recent.length >= p.maxRate) {
      return { ok: false, reason: 'rate-cap', current: recent.length, max: p.maxRate };
    }

    // 4) blast radius cap
    if (u.blastRadius + blastRadius > p.maxBlastRadius) {
      return { ok: false, reason: 'blast-cap', current: u.blastRadius, max: p.maxBlastRadius, requested: blastRadius };
    }

    return { ok: true };
  }

  // --- record (called by the gate AFTER a successful broker) ----------------
  record(id, { spend = 0, blastRadius = 0 } = {}) {
    const u = this._usage.get(id) || { spend: 0, requests: [], blastRadius: 0 };
    u.spend += spend;
    u.requests.push(this.now());
    u.blastRadius += blastRadius;
    this._usage.set(id, u);
  }

  // --- reset (for window expiry or admin) -----------------------------------
  resetUsage(id) {
    this._usage.set(id, { spend: 0, requests: [], blastRadius: 0 });
  }
}
