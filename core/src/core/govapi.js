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
import { listSkills, runSkill } from '../../scripts/run-skill.mjs';

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

  const pending = new Map();   // pendingId -> { proposal, actor }
  const grants = new Map();    // token     -> { scope, grantId, proposalId, actor }
  let halted = false;

  const ensureLive = () => { if (halted) throw new Error('halted: the kill switch is armed'); };

  return {
    // 1) propose — the agent submits an intent. We classify it (reversible?) and
    //    hold it for a human decision. No receipt yet; the receipt IS the decision.
    propose(intent, { actor = 'agent:anon' } = {}) {
      ensureLive();
      const proposal = agentPropose(intent);
      const pendingId = 'prop_' + crypto.randomBytes(8).toString('hex');
      pending.set(pendingId, { proposal, actor });
      return { pendingId, proposal, requiresHumanGate: proposal.requiresHumanGate };
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
        requestedBy: p.actor, secrets, emit, caps, cost,
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

    // 4) verify — walk the whole ledger (signatures + hash chain).
    verify() { return beacon.verifyLedger(); },

    // skills (Ticket A1) — list and run skills through the same gate+ledger.
    skills: {
      list: () => listSkills(),
      run: (name, args) => runSkill(name, args),
    },

    // T6 stub — the global kill switch. The full role-scoped oversight console is
    // Ticket 6; this is the halt hook it will drive. Arming it fails new work closed.
    halt() { halted = true; return emit({ kind: 'gate', actor: 'steward', action: 'kill-switch', detail: { armed: true } }); },
    resume() { halted = false; },
    isHalted() { return halted; },
  };
}
