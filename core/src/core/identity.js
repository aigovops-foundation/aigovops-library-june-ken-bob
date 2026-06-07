// src/core/identity.js
// IDENTITY & MEMBERSHIP — the capability dial (reversible).
// Library Card = membership. Roles map to a capability level that widens with
// trust and can be turned down instantly. v1 is an in-memory stub; production
// uses OIDC. No PII beyond what a member chooses to provide.

// Single source of truth for capability levels: the caps dial (read→propose→act→auto).
import { LEVELS } from './caps.js';

// Roles map to a capability level (the caps dial) AND to oversight visibility
// scope. steward = founders (see all + the kill switch); member = sees only their
// own effects. (Ticket 8 / Ticket 6.)
export const ROLES = {
  steward: { level: 'auto', scope: 'all' },
  member: { level: 'propose', scope: 'own' },
};

export function identify({ id = 'member:anon', role = 'member' } = {}) {
  const known = ROLES[role] ? role : 'member';
  const r = ROLES[known];
  return { id, role: known, level: r.level, scope: r.scope };
}

// OIDC seam (Ticket 8): swap this resolver to map an OIDC subject + claims to an
// identity. Until then, every caller is the anonymous library card.
export function resolveIdentity(req) {
  return identify({ id: 'member:anon', role: 'member' });
}

export function member(req) {
  // Back-compat anonymous library card — now also carries role/scope.
  return { ...identify({ id: 'member:anon', role: 'member' }), caps: { spendUsd: 0, blastRadius: 'none' } };
}

export function can(m, level) {
  // Compare by rank using the same ordered LEVELS the caps dial enforces.
  return (LEVELS[m.level] ?? -1) >= (LEVELS[level] ?? Infinity);
}
