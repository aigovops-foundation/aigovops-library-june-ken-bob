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
  const sandbox = opts.sandbox || new ProcessSandbox();
  const emit = opts.emit || beacon.emit;
  const tools = opts.tools || createToolRegistry();
  // #5: the human-gate / required-level decision comes from a PolicyEngine at
  // runtime — JS by default, OPA/rego when the binary + policyDir are present
  // (POLICY_ENGINE=opa). The JS engine reproduces the built-in rule exactly.
  const policy = opts.policy || createPolicyEngine({ engine: process.env.POLICY_ENGINE, policyDir: opts.policyDir });

  const pending = new Map();   // pendingId -> { proposal, actor }
  const grants = new Map();    // token     -> { scope, grantId, proposalId, actor }
  let halted = false;

  const ensureLive = () => { if (halted) throw new Error('halted: the kill switch is armed'); };
  const doHalt = () => { halted = true; return emit({ kind: 'gate', actor: 'steward', action: 'kill-switch', detail: { armed: true } }); };

  return {
    // 1) propose — the agent submits an intent. We classify it (reversible?) and
    //    hold it for a human decision. No receipt yet; the receipt IS the decision.
    propose(intent, { actor = 'agent:anon' } = {}) {
      ensureLive();
      const proposal = agentPropose(intent);
      // #5: classify through the runtime policy engine (reproduces the built-in
      // rule by default; OPA/rego when configured).
      const d = policy.evaluate({ intent });
      proposal.requiresHumanGate = d.requiresHumanGate;
      proposal.requiredLevel = d.requiredLevel;
      proposal.policyReasons = d.reasons;
      const pendingId = 'prop_' + crypto.randomBytes(8).toString('hex');
      pending.set(pendingId, { proposal, actor, requiredLevel: d.requiredLevel });
      return { pendingId, proposal, requiresHumanGate: proposal.requiresHumanGate };
    },

    // The approval queue — proposals awaiting a human decision (steward view).
    pending() {
      return [...pending.entries()].map(([pendingId, { proposal, actor }]) =>
        ({ pendingId, actor, summary: proposal.summary, requiresHumanGate: proposal.requiresHumanGate }));
    },

    // 2) decide — the HUMAN approves or denies. On approve (and within caps) the
    //    gate brokers a scoped, expiring token; deny brokers nothing (fails closed).
    decide(pendingId, decision, { scope, ttlSeconds = 60, cost = {}, decidedBy = 'human' } = {}) {
      ensureLive();
      const p = pending.get(pendingId);
      if (!p) throw new Error('unknown or already-decided pendingId');
      pending.delete(pendingId);
      const res = gateDecide({
        proposal: p.proposal, decision, scope, ttlSeconds,
        requestedBy: p.actor, secrets, emit, caps,
        cost: { requiredLevel: p.requiredLevel, ...cost },   // policy-derived level, caller may override
      });
      if (res.approved && res.grant) {
        grants.set(res.grant.token, { scope: res.grant.scope, grantId: res.grant.grantId, proposalId: res.proposalId, actor: p.actor });
      }
      return res;
    },

    // 3) runTool — runs ONLY when presented a valid brokered token. redeem() fails
    //    closed on unknown/expired/revoked. The tool runs sandboxed; a tool-run
    //    receipt links back to the proposal that approved the grant.
    async runTool({ token, code, allowedEgress = [], timeoutMs = 10_000 } = {}) {
      ensureLive();
      if (!token) throw new Error('runTool: a brokered token is required (fails closed)');
      secrets.redeem(token); // throws SecretsError if the token is not valid
      const meta = grants.get(token) || null;
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
      secrets.redeem(token);                         // throws if the token is invalid
      const meta = grants.get(token) || null;
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
    resume() { halted = false; },
    isHalted() { return halted; },
  };
}
