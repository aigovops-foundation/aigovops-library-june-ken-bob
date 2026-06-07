// src/core/gate.js
// THE HUMAN GATE ↔ SECRETS BROKER (Ticket 1) + CAPABILITY CAPS (Ticket 5).
// Wires the propose-not-execute runtime to the SecretsProvider (Ticket 0):
//
//   propose(intent) -> human decides (approve | deny) -> cap check -> broker
//
// Rules enforced here (Rev 2026.06):
//   • A grant is requested ONLY on an explicit human approval.
//   • The deny path issues NOTHING and fails closed.
//   • Hard caps (spend, rate, blast radius) are checked AFTER human approval
//     but BEFORE brokering — the agent PAUSES at the cap. A breach emits a
//     signed receipt. Turning the dial down takes effect on the next request.
//   • Every decision emits a signed PROPOSAL receipt; on approval the provider's
//     SECRET receipt LINKS back to it via `parent = receiptId(proposal)`.
//
// The gate is the ONLY caller of the provider. Tools never call issue() and
// never see master material — they receive the short-lived `token` only.

import * as beacon from './beacon.js';
import { propose } from './agent.js';
import { SecretsError } from './secrets.shared.js';

/**
 * Decide on a proposed action and, if approved (and within caps), broker a scoped credential.
 *
 * @param {Object}  args
 * @param {Object}  args.proposal      a proposal from agent.propose()
 * @param {string}  args.decision      'approve' | 'deny' (the human's call)
 * @param {string}  args.scope         logical secret the tool needs (e.g. 'github-deploy')
 * @param {number}  args.ttlSeconds    grant lifetime
 * @param {string}  args.requestedBy   actor id (e.g. 'gate' or a member id)
 * @param {Object}  args.secrets       a SecretsProvider instance (FileProvider/VaultProvider)
 * @param {Function}[args.emit]        receipt emitter (default beacon.emit; injectable for tests)
 * @param {Object}  [args.caps]        a Caps instance (Ticket 5); omit to skip cap checks
 * @param {Object}  [args.cost]        what this action costs: { requiredLevel, spend, blastRadius }
 * @returns {{ approved: boolean, proposalId: string, grant: ?Object, reason: ?string, capped: ?boolean }}
 */
export function decide({ proposal, decision, scope, ttlSeconds, requestedBy = 'gate', secrets, emit = beacon.emit, caps = null, cost = {} }) {
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

  // 3) Cap check (Ticket 5) — the system's safety net on the approve path.
  //    The human said yes, but the caps say "you've reached the limit."
  //    The agent PAUSES here; it does not push through.
  if (caps) {
    const capCheck = caps.check(requestedBy, {
      requiredLevel: cost.requiredLevel || 'act',
      spend: cost.spend || 0,
      blastRadius: cost.blastRadius || 0
    });
    if (!capCheck.ok) {
      // Only include defined fields — undefined values break sign→JSON→verify roundtrip.
      const breachDetail = { op: 'cap-breach', reason: capCheck.reason, scope };
      if (capCheck.current !== undefined) breachDetail.current = capCheck.current;
      if (capCheck.max !== undefined) breachDetail.max = capCheck.max;
      emit({
        kind: 'gate', actor: requestedBy, action: 'cap-breach',
        detail: breachDetail
      });
      return { approved: false, proposalId, grant: null, reason: `capped:${capCheck.reason}`, capped: true };
    }
  }

  // 4) Approve path: broker a scoped, expiring grant whose secret receipt links
  //    back to this proposal.
  const grant = secrets.issue(scope, ttlSeconds, requestedBy, { parent: proposalId });

  // 5) Record the usage so the next check reflects this action's cost.
  if (caps) {
    caps.record(requestedBy, { spend: cost.spend || 0, blastRadius: cost.blastRadius || 0 });
  }

  return { approved: true, proposalId, grant, reason: null };
}

/**
 * Convenience: take a raw intent, run it through propose(), and only reach the
 * gate if the action actually needs one. Reversible actions need no credential.
 */
export function proposeAndDecide({ intent, decision, scope, ttlSeconds, requestedBy = 'gate', secrets, emit = beacon.emit, caps = null, cost = {} }) {
  const proposal = propose(intent);
  if (!proposal.requiresHumanGate) {
    // Reversible: no human gate, no secret needed.
    return { approved: true, proposalId: null, grant: null, reason: 'reversible', proposal };
  }
  return { ...decide({ proposal, decision, scope, ttlSeconds, requestedBy, secrets, emit, caps, cost }), proposal };
}

export { SecretsError };
