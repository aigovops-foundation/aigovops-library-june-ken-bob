// src/core/member-caps.js
// PER-MEMBER CAPABILITY PROFILES + ONBOARDING (#6).
// Bridges identity (Ticket 8) to the capability dial (Ticket 5): the moment a
// member authenticates, they are onboarded with a default profile for their role;
// a steward can turn any member's dial up or down, effective on the next request.
//
// Default profiles are NARROW — trust widens, it isn't granted. A member can
// only propose; reaching 'act' (the level that brokers a credential) requires a
// steward to raise the dial. Activation is config-only: with OIDC live (Ticket 8)
// real members flow in; `seed()` pre-loads profiles from a gitignored file/env.
// No IdP credential is created here.

import { Caps, LEVELS } from './caps.js';

export const PROFILES = {
  steward: { level: 'auto', maxSpend: Infinity, maxRate: Infinity, windowMs: 60_000, maxBlastRadius: Infinity },
  member: { level: 'propose', maxSpend: 10, maxRate: 30, windowMs: 60_000, maxBlastRadius: 1 },
};

export class MemberCaps {
  constructor({ caps } = {}) {
    this.caps = caps || new Caps();
    this._members = new Map();   // id -> { id, role, level, source }
  }

  // Idempotent onboarding: first sight assigns the default profile for the role.
  onboard(identity) {
    const id = identity && identity.id;
    if (!id) throw new Error('onboard requires an identity with an id');
    const role = (identity.role && PROFILES[identity.role]) ? identity.role : 'member';
    if (!this._members.has(id)) {
      const profile = PROFILES[role];
      this.caps.setProfile(id, profile);
      this._members.set(id, { id, role, level: profile.level, source: 'onboarded' });
    }
    return this.get(id);
  }

  get(id) { return this._members.get(id) ? { ...this._members.get(id) } : null; }
  list() { return [...this._members.values()].map((m) => ({ ...m })); }

  // A steward turns the dial — immediately effective on the next request.
  setLevel(id, level) {
    if (!(level in LEVELS)) throw new Error(`unknown level '${level}' (read|propose|act|auto)`);
    if (!this._members.has(id)) throw new Error(`unknown member '${id}'`);
    this.caps.setLevel(id, level);
    this._members.get(id).level = level;
    return this.get(id);
  }

  // Pre-load profiles from config (a gitignored members file or AIGOV_MEMBERS
  // env JSON): [{ id, role, level? }]. Lets an operator seed stewards/members
  // without a live login — activation by config.
  seed(list = []) {
    for (const m of Array.isArray(list) ? list : []) {
      if (!m || !m.id) continue;
      const role = PROFILES[m.role] ? m.role : 'member';
      const profile = { ...PROFILES[role], ...(m.level && m.level in LEVELS ? { level: m.level } : {}) };
      this.caps.setProfile(m.id, profile);
      this._members.set(m.id, { id: m.id, role, level: profile.level, source: 'config' });
    }
    return this.list();
  }
}

// Build a MemberCaps from env (AIGOV_MEMBERS=JSON array), sharing one Caps the
// gate evaluates. The same Caps instance must be handed to createGovernedCore.
export function createMemberCaps({ caps } = {}) {
  const mc = new MemberCaps({ caps });
  try { if (process.env.AIGOV_MEMBERS) mc.seed(JSON.parse(process.env.AIGOV_MEMBERS)); } catch { /* ignore malformed seed */ }
  return mc;
}
