// src/core/agent.js
// AGENT RUNTIME — propose-not-execute.
// Agents do the bureaucracy; humans hold legitimacy. Any irreversible effect is
// returned as a PROPOSAL for a human gate — never executed here. Tools (not in
// v1) run sandboxed, least-privilege, no ambient credentials.

export function propose(intent, ctx = {}) {
  const irreversible = /delete|publish|send|deploy|pay|grant|merge/i.test(intent);
  return {
    summary: `Proposed: ${intent}`,
    steps: ['draft', 'show plain-language summary in member locale', irreversible ? 'PAUSE for human gate' : 'apply (reversible)'],
    irreversible,
    requiresHumanGate: irreversible
  };
}
