// src/core/identity.js
// IDENTITY & MEMBERSHIP — the capability dial (reversible).
// Library Card = membership. Roles map to a capability level that widens with
// trust and can be turned down instantly. v1 is an in-memory stub; production
// uses OIDC. No PII beyond what a member chooses to provide.

const LEVELS = ['read', 'propose', 'auto']; // auto = act within hard caps only

export function member(req) {
  // v1: anonymous library card. Real impl resolves an OIDC subject.
  return { id: 'member:anon', level: 'propose', caps: { spendUsd: 0, blastRadius: 'none' } };
}

export function can(m, level) {
  return LEVELS.indexOf(m.level) >= LEVELS.indexOf(level);
}
