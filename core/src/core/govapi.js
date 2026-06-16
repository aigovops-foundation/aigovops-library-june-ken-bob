// src/core/govapi.js
// THE GOVERNED LOOP, EXPOSED (Ticket A2).
// Wraps the existing, tested safety machinery into one in-process API an agent
// can drive end to end:
//
//   propose(intent) -> decide(human: approve|deny) -> runTool(sandboxed, with a
//   brokered token) -> verify()        + skills.list/run (Ticket A1)
//
// This adds NO new safety logic — it only exposes agent.propose, gate.decide
// (which already does human-gate -> caps -> broker with linked receipts),
// secrets.redeem, and the ProcessSandbox.
//
// Deliberate omission: there is NO agent-callable broker(). Brokering happens
// only INSIDE decide() on an approved proposal — "the gate is the only caller of
// the provider." Exposing a broker tool would break that invariant, so we don't.

import crypto from 'node:crypto';
import * as beacon from './beacon.js';
import { propose as agentPropose } from './agent.js';
import { decide as gateDecide } from './gate.js';
import { FileProvider } from './secrets.fileprovider.js';
import { ProcessSandbox } from './sandbox.process.js';
import { ledgerView, canKill } from './oversight.js';
import { listSkills, runSkill } from '../../scripts/run-skill.mjs';
import { createToolRegistry, buildToolCode, ToolError } from './tools.js';
import { createPolicyEngine } from './policy-engine.js';
import { WorktreeRunner } from './worktree.js';
import { complete as defaultComplete } from './llm.js';
import { MemoryStore } from './statestore.js';

/**
 * Create a governed core. Dependencies are injectable for tests.
 * @param {Object} [opts]
 * @param {Object} [opts.secrets]  a SecretsProvider (default FileProvider)
 * @param {Object} [opts.caps]     a Caps instance (omit to skip cap checks)
 * @param {Object} [opts.sandbox]  a SandboxProvider (default ProcessSandbox)
 * @param {Function} [opts.emit]   receipt emitter (default beacon.emit)
 */
export function createGovernedCore(opts = {}) {
  const secrets = opts.secrets || new FileProvider();
  const caps = opts.caps || null;
  // A4b: share the state store with the broker so a grant issued on one replica
  // redeems on another (the FileProvider's grant store moves to the shared store too).
  if (opts.store && secrets.useStore) secrets.useStore(opts.store);
  const sandbox = opts.sandbox || new ProcessSandbox();
  const emit = opts.emit || beacon.emit;
  const tools = opts.tools || createToolRegistry();
  // #5: the human-gate / required-level decision comes from a PolicyEngine at
  // runtime — JS by default, OPA/rego when the binary + policyDir are present
  // (POLICY_ENGINE=opa). The JS engine reproduces the built-in rule exactly.
  const policy = opts.policy || createPolicyEngine({ engine: process.env.POLICY_ENGINE, policyDir: opts.policyDir });
  // #3: optional worktree runner for governed, laptop-safe code mutation. Off
  // unless a repoDir is supplied (so the default core has no host dependency).
  const worktree = opts.worktree || (opts.repoDir ? new WorktreeRunner({ repoDir: opts.repoDir, emit }) : null);
  const mutationScope = opts.mutationScope || 'self-host';
  // #6: the model that drafts plans for the conversational console (local-first;
  // gate still holds every effect). Injectable for tests.
  const model = opts.model || defaultComplete;

  // A4b (stateless brokering): pending proposals + brokered-grant metadata live in
  // the SHARED store (default a per-instance MemoryStore = single-node, unchanged)
  // so the whole propose→decide→runTool loop works on ANY replica — no sticky
  // sessions. The broker's own grant store is shared the same way (see secrets above).
  // The kill switch also lives here; `halted` is a local cache the server polls
  // (syncHalt) so isHalted()/ensureLive() stay synchronous.
  let store = opts.store || new MemoryStore();
  const PK = (id) => `gov:pending:${id}`;
  const PIDX = 'gov:pending:idx';
  const GK = (tok) => `gov:grant:${tok}`;
  let halted = false;
  const HALT_KEY = 'gov:halted';
  const persistHalt = (v) => { Promise.resolve(store.set(HALT_KEY, v)).catch(() => {}); };
  const now = opts.now || (() => Date.now());

  // #3 (review queue): SLA deadline by required level (riskier work due sooner).
  const SLA_MS = opts.slaMs || { read: 24 * 3600e3, propose: 8 * 3600e3, act: 2 * 3600e3, auto: 3600e3 };

  const ensureLive = () => { if (halted) throw new Error('halted: the kill switch is armed'); };
  const doHalt = () => { halted = true; persistHalt(true); return emit({ kind: 'gate', actor: 'steward', action: 'kill-switch', detail: { armed: true } }); };

  // pending index helpers (the store lacks SCAN — keep a small id set).
  const pidx = async () => (await store.get(PIDX)) || [];
  const pidxAdd = async (id) => { const ix = await pidx(); if (!ix.includes(id)) { ix.push(id); await store.set(PIDX, ix); } };
  const pidxDel = async (id) => { const ix = await pidx(); const n = ix.filter((x) => x !== id); if (n.length !== ix.length) await store.set(PIDX, n); };

  // Classify an intent through the runtime policy engine and queue it for a human
  // decision. Shared by propose() and plan().
  const doPropose = async (intent, actor) => {
    const proposal = agentPropose(intent);
    const d = policy.evaluate({ intent });
    proposal.requiresHumanGate = d.requiresHumanGate;
    proposal.requiredLevel = d.requiredLevel;
    proposal.policyReasons = d.reasons;
    const pendingId = 'prop_' + crypto.randomBytes(8).toString('hex');
    const createdAt = now();
    const dueAt = createdAt + (SLA_MS[d.requiredLevel] ?? SLA_MS.propose);
    await store.set(PK(pendingId), { proposal, actor, requiredLevel: d.requiredLevel, createdAt, dueAt, assignee: null });
    await pidxAdd(pendingId);
    return { pendingId, proposal, requiresHumanGate: proposal.requiresHumanGate, dueAt };
  };

  return {
    // 1) propose — the agent submits an intent. We classify it (reversible?) and
    //    hold it for a human decision. No receipt yet; the receipt IS the decision.
    async propose(intent, { actor = 'agent:anon' } = {}) {
      ensureLive();
      return doPropose(intent, actor);   // #5: classified by the runtime policy engine
    },

    // 0) plan — the conversational front of the loop (#6). The model drafts a
    //    short plan for the member's message (local-first; gate still holds every
    //    effect), and the intent is classified + queued as a proposal the human
    //    approves inline. No effect happens here — it's propose-with-a-plan.
    async plan(message, { actor = 'agent:anon' } = {}) {
      ensureLive();
      const drafted = await model({
        prompt: `A member says: "${message}". Draft a short numbered plan (max 4 steps) to help them, ` +
          `then state plainly whether any step needs human approval. You only PROPOSE — never claim to have acted.`,
      });
      const queued = await doPropose(message, actor);
      return { plan: drafted.text, model: drafted.model, ...queued };
    },

    // The approval queue — proposals awaiting a human decision (steward view).
    // #3: routing/SLA — filter by assignee/overdue, sorted soonest-due first.
    async pending({ assignee, overdue } = {}) {
      const t = now();
      const ids = await pidx();
      const rows = [];
      for (const pendingId of ids) {
        const p = await store.get(PK(pendingId));
        if (!p) continue;                          // decided/expired — prune lazily
        rows.push({ pendingId, actor: p.actor, summary: p.proposal.summary, requiresHumanGate: p.proposal.requiresHumanGate,
          requiredLevel: p.requiredLevel, createdAt: p.createdAt, dueAt: p.dueAt, assignee: p.assignee, overdue: t > p.dueAt });
      }
      let out = rows;
      if (assignee != null) out = out.filter((r) => r.assignee === assignee);
      if (overdue) out = out.filter((r) => r.overdue);
      return out.sort((a, b) => a.dueAt - b.dueAt);
    },

    // #3: assign a pending proposal to a reviewer (steward action). Fails closed on
    // an unknown/decided id, like decide().
    async assign(pendingId, assignee) {
      const p = await store.get(PK(pendingId));
      if (!p) throw new Error('unknown or already-decided pendingId');
      p.assignee = assignee || null;
      await store.set(PK(pendingId), p);
      return { pendingId, assignee: p.assignee };
    },

    // 2) decide — the HUMAN approves or denies. On approve (and within caps) the
    //    gate brokers a scoped, expiring token; deny brokers nothing (fails closed).
    async decide(pendingId, decision, { scope, ttlSeconds = 60, cost = {}, decidedBy = 'human' } = {}) {
      ensureLive();
      const p = await store.get(PK(pendingId));
      if (!p) throw new Error('unknown or already-decided pendingId');
      await store.del(PK(pendingId)); await pidxDel(pendingId);
      const res = await gateDecide({
        proposal: p.proposal, decision, scope, ttlSeconds,
        requestedBy: p.actor, secrets, emit, caps,
        cost: { requiredLevel: p.requiredLevel, ...cost },   // policy-derived level, caller may override
      });
      if (res.approved && res.grant) {
        await store.set(GK(res.grant.token), { scope: res.grant.scope, grantId: res.grant.grantId, proposalId: res.proposalId, actor: p.actor }, (res.grant.expiresAt - now()) + 600_000);
      }
      return res;
    },

    // 3) runTool — runs ONLY when presented a valid brokered token. redeem() fails
    //    closed on unknown/expired/revoked. The tool runs sandboxed; a tool-run
    //    receipt links back to the proposal that approved the grant.
    async runTool({ token, code, allowedEgress = [], timeoutMs = 10_000 } = {}) {
      ensureLive();
      if (!token) throw new Error('runTool: a brokered token is required (fails closed)');
      await secrets.redeem(token); // throws SecretsError if the token is not valid
      const meta = await store.get(GK(token)) || null;
      const result = await sandbox.run({ code }, { allowedEgress, timeoutMs });
      emit({
        kind: 'tool', actor: meta ? meta.actor : 'agent:anon', action: 'tool-run',
        detail: {
          scope: meta ? meta.scope : null,
          ok: !!result.ok,
          violations: (result.violations || []).length,
          parent: meta ? meta.proposalId : null,
        },
      });
      return result;
    },

    // 3b) runRegisteredTool — run a VETTED tool by name (#3). The token's scope
    //     must equal the tool's declared requiredScope; egress comes from the
    //     tool, not the caller; kernel-only tools refuse to run on the laptop
    //     ProcessSandbox (fail closed, never silently unsandboxed).
    async runRegisteredTool({ token, tool: toolName, input = null } = {}) {
      ensureLive();
      if (!token) throw new Error('runRegisteredTool: a brokered token is required (fails closed)');
      const tool = tools.get(toolName);
      if (!tool) throw new ToolError('unknown-tool', `no registered tool '${toolName}'`);
      await secrets.redeem(token);                         // throws if the token is invalid
      const meta = await store.get(GK(token)) || null;
      const scope = meta ? meta.scope : null;
      if (scope !== tool.requiredScope) {
        throw new ToolError('scope-mismatch', `tool '${toolName}' needs scope '${tool.requiredScope}', token is for '${scope}'`);
      }
      if (tool.requiresKernelSandbox && !sandbox.kernelEnforced) {
        throw new ToolError('needs-kernel-sandbox', `tool '${toolName}' mutates real resources and requires a kernel sandbox (gVisor) — refused on the application-level fallback`);
      }
      const result = await sandbox.run(
        { code: buildToolCode(tool, input) },
        { allowedEgress: tool.allowedEgress, timeoutMs: 10_000 }   // vetted egress, not caller-supplied
      );
      emit({
        kind: 'tool', actor: meta ? meta.actor : 'agent:anon', action: 'tool-run',
        detail: { tool: toolName, scope, ok: !!result.ok, violations: (result.violations || []).length, parent: meta ? meta.proposalId : null },
      });
      return result;
    },

    // 3c) proposeFileChange — author a real code change in an ISOLATED worktree
    //     (#3). Token-gated (scope must equal the mutation scope); writes only in
    //     the worktree; NEVER commits — returns a reviewable diff + a signed
    //     receipt so a human can land it. Fails closed if no worktree runner is
    //     configured (no repoDir) or the token scope is wrong.
    async proposeFileChange({ token, relPath, content } = {}) {
      ensureLive();
      if (!worktree) throw new Error('proposeFileChange: no worktree runner (pass repoDir to createGovernedCore)');
      if (!token) throw new Error('proposeFileChange: a brokered token is required (fails closed)');
      await secrets.redeem(token);
      const meta = await store.get(GK(token)) || null;
      const scope = meta ? meta.scope : null;
      if (scope !== mutationScope) throw new Error(`proposeFileChange needs scope '${mutationScope}', token is for '${scope}'`);
      return worktree.proposeFileChange({ relPath, content, parent: meta ? meta.proposalId : null, actor: meta ? meta.actor : 'agent:self-host' });
    },

    // The vetted tool catalog (public view — no code bodies).
    tools: {
      list: () => tools.list(),
      get: (name) => { const t = tools.get(name); return t ? tools.list().find((x) => x.name === name) : null; },
      register: (t) => tools.register(t),
    },

    // 4) verify — walk the whole ledger (signatures + hash chain).
    verify() { return beacon.verifyLedger(); },

    // skills (Ticket A1) — list and run skills through the same gate+ledger.
    skills: {
      list: () => listSkills(),
      run: (name, args) => runSkill(name, args),
    },

    // Oversight (Ticket 6, core) — role-scoped view + a steward-only kill switch.
    // The live SSE console UI is the remaining product half.
    oversight(identity = { role: 'member', id: 'member:anon' }) {
      return {
        view: () => ledgerView(identity),
        kill: () => { if (!canKill(identity.role)) throw new Error('kill switch is steward-only'); return doHalt(); },
        status: () => ({ halted, role: identity.role, scope: identity.role === 'steward' ? 'all' : 'own' }),
      };
    },

    // Low-level halt hook (the kill switch the oversight console drives).
    halt: doHalt,
    resume() { halted = false; persistHalt(false); },
    isHalted() { return halted; },

    // #1: late-bind the shared store + refresh the global kill state. The server
    // wires the resolved store after boot and polls syncHalt(), so a kill on ANY
    // replica halts this one within the poll interval. With the default MemoryStore
    // (single node) this is just a same-process read — behaviour unchanged.
    useStore(s) { if (s) { store = s; if (secrets && secrets.useStore) secrets.useStore(s); } },
    async syncHalt() { if (store) { try { halted = !!(await store.get(HALT_KEY)); } catch { /* keep last known */ } } return halted; },
  };
}
