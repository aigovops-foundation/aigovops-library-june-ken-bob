// src/core/identity.js
// IDENTITY & MEMBERSHIP — the capability dial (reversible).
// Library Card = membership. Roles map to a capability level that widens with
// trust and can be turned down instantly. v1 is an in-memory stub; production
// uses OIDC. No PII beyond what a member chooses to provide.

// Single source of truth for capability levels: the caps dial (read→propose→act→auto).
import { LEVELS } from './caps.js';

export function member(req) {
  // v1: anonymous library card. Real impl resolves an OIDC subject.
  return { id: 'member:anon', level: 'propose', caps: { spendUsd: 0, blastRadius: 'none' } };
}

export function can(m, level) {
  // Compare by rank using the same ordered LEVELS the caps dial enforces.
  return (LEVELS[m.level] ?? -1) >= (LEVELS[level] ?? Infinity);
}
