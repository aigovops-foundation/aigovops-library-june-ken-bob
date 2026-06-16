// src/core/workflow.js
// WORKFLOW ENGINE (#2 — multi-step, SLAs). The governed loop is a single
// propose→decide→run step; this composes those into durable, resumable, multi-step
// workflows: states, per-step assignment, SLA deadlines, escalation. State lives
// in the SHARED STORE (so any replica can advance an instance — genuinely
// replica-agnostic, unlike the broker which is per-process), and every transition
// emits a metadata-only Beacon receipt (the audit trail; the member's `data` is
// stored but NEVER put in the ledger).
//
// Dependency-free: the store (Memory/Redis) + Beacon. The store lacks SCAN, so we
// keep a small index list; writes are low-volume (human-paced approvals).

import crypto from 'node:crypto';
import * as beacon from './beacon.js';

const DEFAULT_SLA_MS = 8 * 3600e3;
const K = {
  def: (id) => `wf:def:${id}`,
  inst: (id) => `wf:inst:${id}`,
  data: (id) => `wf:data:${id}`,
  index: 'wf:index',
};

export class WorkflowError extends Error { constructor(reason, msg) { super(msg || reason); this.name = 'WorkflowError'; this.reason = reason; } }

export class Workflows {
  constructor(opts = {}) {
    this.store = opts.store;
    this.emit = opts.emit || ((m) => beacon.emit(m));
    this.now = opts.now || (() => Date.now());
    this.randomId = opts.randomId || (() => crypto.randomBytes(8).toString('hex'));
    if (!this.store) throw new WorkflowError('no-store', 'Workflows needs a state store');
  }

  // Register a definition: ordered steps [{ id, name, requiresApproval?, slaMs? }].
  async define(defId, steps) {
    if (!defId) throw new WorkflowError('bad-id', 'defId required');
    if (!Array.isArray(steps) || !steps.length) throw new WorkflowError('bad-steps', 'a workflow needs >=1 step');
    const def = { defId, steps: steps.map((s, i) => ({ id: String(s.id || `step${i + 1}`), name: s.name || s.id || `step ${i + 1}`, requiresApproval: s.requiresApproval !== false, slaMs: Number(s.slaMs) || DEFAULT_SLA_MS })) };
    await this.store.set(K.def(defId), def);
    return def;
  }

  async _index() { return (await this.store.get(K.index)) || []; }
  async _addToIndex(id) { const ix = await this._index(); if (!ix.includes(id)) { ix.push(id); await this.store.set(K.index, ix); } }

  // Start an instance. The member `data` is stored apart from the audit trail.
  async start(defId, { actor = 'agent:anon', data = null } = {}) {
    const def = await this.store.get(K.def(defId));
    if (!def) throw new WorkflowError('unknown-def', `no workflow definition '${defId}'`);
    const id = 'wf_' + this.randomId();
    const t = this.now();
    const steps = def.steps.map((s, i) => ({ id: s.id, name: s.name, requiresApproval: s.requiresApproval, status: i === 0 ? 'active' : 'pending', assignee: null, dueAt: i === 0 ? t + s.slaMs : null, slaMs: s.slaMs }));
    const inst = { id, defId, state: 'running', stepIndex: 0, steps, actor, createdAt: t, updatedAt: t, escalated: false };
    await this.store.set(K.inst(id), inst);
    if (data != null) await this.store.set(K.data(id), data);
    await this._addToIndex(id);
    this.emit({ kind: 'workflow', actor, action: 'start', detail: { instanceId: id, defId, step: steps[0].id, state: 'running' } });
    return inst;
  }

  async get(id) { const i = await this.store.get(K.inst(id)); if (!i) throw new WorkflowError('unknown-instance', `no workflow '${id}'`); return i; }

  // Advance the active step. approve → next step (or completed); reject → rejected.
  async advance(id, { decision = 'approve', actor = 'human', note = null } = {}) {
    const inst = await this.get(id);
    if (inst.state !== 'running') throw new WorkflowError('not-running', `workflow '${id}' is ${inst.state}`);
    const cur = inst.steps[inst.stepIndex];
    const t = this.now();
    if (decision === 'reject') {
      cur.status = 'rejected'; inst.state = 'rejected';
    } else {
      cur.status = 'done';
      if (inst.stepIndex + 1 >= inst.steps.length) { inst.state = 'completed'; }
      else { inst.stepIndex++; const nx = inst.steps[inst.stepIndex]; nx.status = 'active'; nx.dueAt = t + nx.slaMs; }
    }
    inst.updatedAt = t;
    await this.store.set(K.inst(id), inst);
    this.emit({ kind: 'workflow', actor, action: decision === 'reject' ? 'reject' : (inst.state === 'completed' ? 'complete' : 'advance'), detail: { instanceId: id, defId: inst.defId, step: cur.id, state: inst.state, ...(note ? { contentHash: beacon.sha256(String(note)) } : {}) } });
    return inst;
  }

  async assign(id, stepId, assignee) {
    const inst = await this.get(id);
    const step = inst.steps.find((s) => s.id === stepId);
    if (!step) throw new WorkflowError('unknown-step', `no step '${stepId}' in '${id}'`);
    step.assignee = assignee || null; inst.updatedAt = this.now();
    await this.store.set(K.inst(id), inst);
    return { id, stepId, assignee: step.assignee };
  }

  // Escalate the active step (e.g. it blew its SLA). Flags the instance + receipt.
  async escalate(id, { to = null, actor = 'system' } = {}) {
    const inst = await this.get(id);
    if (inst.state !== 'running') throw new WorkflowError('not-running', `workflow '${id}' is ${inst.state}`);
    inst.escalated = true;
    const cur = inst.steps[inst.stepIndex];
    if (to) cur.assignee = to;
    inst.updatedAt = this.now();
    await this.store.set(K.inst(id), inst);
    this.emit({ kind: 'workflow', actor, action: 'escalate', detail: { instanceId: id, defId: inst.defId, step: cur.id, state: inst.state } });
    return inst;
  }

  // Is the active step past its SLA?
  isOverdue(inst) { const cur = inst.steps[inst.stepIndex]; return inst.state === 'running' && cur && cur.dueAt != null && this.now() > cur.dueAt; }

  // List instances (optionally by state / overdue), summary rows.
  async list({ state, overdue } = {}) {
    const ids = await this._index();
    const out = [];
    for (const id of ids) {
      const inst = await this.store.get(K.inst(id));
      if (!inst) continue;
      if (state && inst.state !== state) continue;
      const od = this.isOverdue(inst);
      if (overdue && !od) continue;
      const cur = inst.steps[inst.stepIndex];
      out.push({ id: inst.id, defId: inst.defId, state: inst.state, step: cur ? cur.id : null, assignee: cur ? cur.assignee : null, overdue: od, escalated: inst.escalated, updatedAt: inst.updatedAt });
    }
    return out;
  }
}
