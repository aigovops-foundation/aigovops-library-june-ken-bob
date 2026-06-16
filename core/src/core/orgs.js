// src/core/orgs.js
// ORGS / TEAMS + RBAC HIERARCHY (#4). The capability dial (caps.js) governs WHAT
// an identity may do; this governs WHO they belong to and which delegated role
// they hold within an org/team. Dependency-free in-memory registry (the same
// shape maps onto Postgres later). Roles beyond the core member/steward:
//   org-steward     — delegated admin of one org (can manage its members/teams)
//   reviewer        — may be assigned proposals in the review queue (#3)
//   auditor         — read-only access to the org's receipts
//   regional-steward— steward scoped to a region/org rather than globally
//
// This module holds membership + roles only; the gateway maps a role to an action
// (e.g. only a reviewer/steward may be an assignee). Global stewards are unchanged.

export const ORG_ROLES = ['org-steward', 'reviewer', 'auditor', 'regional-steward', 'member'];

export class OrgError extends Error { constructor(reason, msg) { super(msg || reason); this.name = 'OrgError'; this.reason = reason; } }

export class Orgs {
  constructor(opts = {}) { this.now = opts.now || (() => Date.now()); this._orgs = new Map(); }

  _org(orgId) { const o = this._orgs.get(orgId); if (!o) throw new OrgError('unknown-org', `no org '${orgId}'`); return o; }

  createOrg(id, name, { steward = null } = {}) {
    if (!id) throw new OrgError('bad-id', 'org id required');
    if (this._orgs.has(id)) throw new OrgError('exists', `org '${id}' already exists`);
    const org = { id, name: name || id, createdAt: this.now(), members: new Map(), teams: new Map() };
    this._orgs.set(id, org);
    if (steward) this.setMember(id, steward, { roles: ['org-steward'] });
    return this.get(id);
  }

  // Add or replace a member with a set of roles (validated).
  setMember(orgId, memberId, { roles = ['member'] } = {}) {
    const org = this._org(orgId);
    for (const r of roles) if (!ORG_ROLES.includes(r)) throw new OrgError('bad-role', `unknown role '${r}'`);
    org.members.set(memberId, { roles: [...new Set(roles)], addedAt: this.now() });
    return { orgId, memberId, roles: org.members.get(memberId).roles };
  }

  removeMember(orgId, memberId) {
    const org = this._org(orgId);
    org.members.delete(memberId);
    for (const t of org.teams.values()) t.members.delete(memberId);
    return { orgId, memberId, removed: true };
  }

  hasRole(orgId, memberId, role) {
    const o = this._orgs.get(orgId); if (!o) return false;
    const m = o.members.get(memberId); return !!m && m.roles.includes(role);
  }

  createTeam(orgId, teamId, name, { lead = null } = {}) {
    const org = this._org(orgId);
    if (org.teams.has(teamId)) throw new OrgError('exists', `team '${teamId}' already exists`);
    org.teams.set(teamId, { id: teamId, name: name || teamId, lead, members: new Set(lead ? [lead] : []) });
    return this.get(orgId);
  }

  addToTeam(orgId, teamId, memberId) {
    const org = this._org(orgId);
    const team = org.teams.get(teamId); if (!team) throw new OrgError('unknown-team', `no team '${teamId}'`);
    if (!org.members.has(memberId)) this.setMember(orgId, memberId, { roles: ['member'] });
    team.members.add(memberId);
    return { orgId, teamId, memberId };
  }

  // Org summaries (no nested member maps).
  list() {
    return [...this._orgs.values()].map((o) => ({ id: o.id, name: o.name, members: o.members.size, teams: o.teams.size, createdAt: o.createdAt }));
  }

  // Full org view (serializable — Maps/Sets expanded).
  get(orgId) {
    const o = this._org(orgId);
    return {
      id: o.id, name: o.name, createdAt: o.createdAt,
      members: [...o.members.entries()].map(([id, m]) => ({ id, roles: m.roles })),
      teams: [...o.teams.values()].map((t) => ({ id: t.id, name: t.name, lead: t.lead, members: [...t.members] })),
    };
  }
}
