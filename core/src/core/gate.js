// src/core/gate.js
// THE HUMAN GATE ↔ SECRETS BROKER (Ticket 1).
// Wires the propose-not-execute runtime to the SecretsProvider (Ticket 0):
//
//   propose(intent)  ->  human decides (approve | deny)  ->  broker a grant
//
// Rules enforced here (Rev 2026.06: "agents do the bureaucracy; humans hold
// legitimacy"):
//   • A grant is requested ONLY on an explicit human approval.
//   • The deny path issues NOTHING and fails closed — no token, no secret receipt.
//   • Every decision emits a signed PROPOSAL receipt; on approval the provider's
//     SECRET receipt LINKS back to it via `parent = receiptId(proposal)`, so an
//     auditor can trace any live token to the human who approved it.
//
// The gate is the ONLY caller of the provider. Tools never call issue() and
// never see master material — they receive the short-lived `token` only.

import * as beacon from './beacon.js';
import { propose } from './agent.js';
import { SecretsError } from './secrets.shared.js';

/**
 * Decide on a proposed action and, if approved, broker a scoped credential.
 *
 * @param {Object}  args
 * @param {Object}  args.proposal      a proposal from agent.propose()
 * @param {string}  args.decision      'approve' | 'deny' (the human's call)
 * @param {string}  args.scope         logical secret the tool needs (e.g. 'github-deploy')
 * @param {number}  args.ttlSeconds    grant lifetime
 * @param {string}  args.requestedBy   actor id (e.g. 'gate' or a member id)
 * @param {Object}  args.secrets       a SecretsProvider instance (FileProvider/VaultProvider)
 * @param {Function}[args.emit]        receipt emitter (default beacon.emit; injectable for tests)
 * @returns {{ approved: boolean, proposalId: string, grant: ?Object, reason: ?string }}
 */
export function decide({ proposal, decision, scope, ttlSeconds, requestedBy = 'gate', secrets, emit = beacon.emit }) {
  const approved = decision === 'approve';

  // 1) Record the human decision itself as a signed proposal receipt — the deny
  //    is just as auditable as the approve.
  const proposalReceipt = emit({
    kind: 'gate',
    actor: requestedBy,
    action: approved ? 'approve' : 'deny',
    gate: { id: 'human-gate', act: 'get', decision: approved ? 'yes' : 'no' },
    detail: {
      op: 'proposal',
      summary: proposal && proposal.summary,
      requiresHumanGate: !!(proposal && proposal.requiresHumanGate),
      scope,
      decision: approved ? 'approve' : 'deny'
    }
  });
  const proposalId = beacon.receiptId(proposalReceipt);

  // 2) Deny path: fail closed. Issue nothing — no grant, no secret receipt.
  if (!approved) {
    return { approved: false, proposalId, grant: null, reason: 'denied' };
  }

  // 3) Approve path: broker a scoped, expiring grant whose secret receipt links
  //    back to this proposal. If the scope has no secret, issue() throws and we
  //    still fail closed (no grant) — the deny is implicit in the thrown error.
  const grant = secrets.issue(scope, ttlSeconds, requestedBy, { parent: proposalId });
  return { approved: true, proposalId, grant, reason: null };
}

/**
 * Convenience: take a raw intent, run it through propose(), and only reach the
 * gate if the action actually needs one. Reversible actions need no credential.
 */
export function proposeAndDecide({ intent, decision, scope, ttlSeconds, requestedBy = 'gate', secrets, emit = beacon.emit }) {
  const proposal = propose(intent);
  if (!proposal.requiresHumanGate) {
    // Reversible: no human gate, no secret needed.
    return { approved: true, proposalId: null, grant: null, reason: 'reversible', proposal };
  }
  return { ...decide({ proposal, decision, scope, ttlSeconds, requestedBy, secrets, emit }), proposal };
}

export { SecretsError };
