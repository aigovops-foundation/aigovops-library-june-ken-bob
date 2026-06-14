// src/core/policy-diff.js
// POLICY-CHANGE REVIEW (#5) — show what a policy change actually DOES.
// A rego/verb-list edit is abstract; what a reviewer needs is the decision-diff:
// which real intents would flip between "needs a human gate" and "reversible",
// or change required capability level. This makes a policy change a reviewable,
// signable artifact (pairs with policy-bundle.js).

// A representative corpus of intents to evaluate a policy against. Extend freely;
// the diff is only as good as the cases it probes.
export const DEFAULT_CORPUS = [
  'deploy the site', 'delete the user record', 'publish the report', 'send the email blast',
  'pay the invoice', 'grant admin access', 'merge the pull request', 'archive the project',
  'summarize the document', 'read the ledger', 'draft a plan', 'classify a use case',
  'translate the page', 'export the data', 'rotate the signing key', 'rename a file',
];

// Diff two PolicyEngines over a corpus. Returns the intents whose decision flips
// and the fields that changed — pure, deterministic, no network.
export function policyDiff({ baseline, candidate, intents = DEFAULT_CORPUS }) {
  const flips = [];
  for (const intent of intents) {
    const a = baseline.evaluate({ intent });
    const b = candidate.evaluate({ intent });
    const changed = [];
    if (a.requiresHumanGate !== b.requiresHumanGate) changed.push('requiresHumanGate');
    if (a.requiredLevel !== b.requiredLevel) changed.push('requiredLevel');
    if (changed.length) {
      flips.push({
        intent, changed,
        from: { requiresHumanGate: a.requiresHumanGate, requiredLevel: a.requiredLevel },
        to: { requiresHumanGate: b.requiresHumanGate, requiredLevel: b.requiredLevel },
      });
    }
  }
  return {
    total: intents.length,
    flipped: flips.length,
    // The direction that matters most for safety: gates that DISAPPEAR.
    loosened: flips.filter((f) => f.from.requiresHumanGate && !f.to.requiresHumanGate).length,
    tightened: flips.filter((f) => !f.from.requiresHumanGate && f.to.requiresHumanGate).length,
    flips,
  };
}
