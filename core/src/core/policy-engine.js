// src/core/policy-engine.js
// POLICY ENGINE SEAM (Ticket 7) — the Yes-Gate decision rule, behind one
// interface, evaluable at the gate.
//
//   JsPolicyEngine  (default) — the rule in dependency-free JS; the SAME regex
//                               agent.propose() uses, so decisions reproduce.
//   OpaPolicyEngine (enclave) — the IDENTICAL rule as OPA/rego, evaluated by the
//                               `opa` binary. Policies become reviewable in PRs
//                               and ship as Beacon-signed bundles (policy-bundle.js).
//
// A Decision is metadata only:
//   { irreversible, requiresHumanGate, requiredLevel, reasons[] }
//
// The rule (one source of truth, mirrored in policy/aigov.rego):
//   an intent is irreversible iff it mentions a verb in IRREVERSIBLE_VERBS;
//   an irreversible action requires a human gate and capability level 'act';
//   a reversible one requires only 'propose'.

import { execFileSync } from 'node:child_process';

// The single rule. policy/aigov.rego MUST keep this list identical.
export const IRREVERSIBLE_VERBS = ['delete', 'publish', 'send', 'deploy', 'pay', 'grant', 'merge'];

export class PolicyError extends Error {
  constructor(reason, message) { super(message || reason); this.name = 'PolicyError'; this.reason = reason; }
}

export class PolicyEngine {
  /** @returns {{irreversible:boolean, requiresHumanGate:boolean, requiredLevel:string, reasons:string[]}} */
  evaluate(/* input */) { throw new PolicyError('not-implemented', 'evaluate() not implemented'); }
}

// --- JS engine (default) -----------------------------------------------------
export class JsPolicyEngine extends PolicyEngine {
  // `verbs` lets a policy CHANGE be expressed as data (not code), so two engines
  // can be diffed over a corpus (#5 policy-change review) without the opa binary.
  constructor({ verbs = IRREVERSIBLE_VERBS } = {}) { super(); this.verbs = verbs; }
  evaluate({ intent = '' } = {}) {
    const text = String(intent).toLowerCase();
    const matched = this.verbs.filter((v) => text.includes(v));
    const irreversible = matched.length > 0;
    return {
      irreversible,
      requiresHumanGate: irreversible,
      requiredLevel: irreversible ? 'act' : 'propose',
      reasons: matched.map((v) => `matched irreversible verb: ${v}`),
    };
  }
}

// --- OPA engine --------------------------------------------------------------
// Detect a usable `opa` binary (cached).
let _opaCached = null;
export function opaAvailable() {
  if (_opaCached !== null) return _opaCached;
  try { execFileSync('opa', ['version'], { stdio: 'pipe', timeout: 5000 }); _opaCached = true; }
  catch { _opaCached = false; }
  return _opaCached;
}

// Pure: the `opa eval` argv (unit-testable without the binary). Reads input from
// stdin (-I) and returns the gate decision document as JSON.
export function buildOpaArgs({ policyDir, query = 'data.aigov.gate.decision' }) {
  return ['eval', '--format', 'json', '-I', '-d', policyDir, query];
}

export class OpaPolicyEngine extends PolicyEngine {
  /**
   * @param {Object} opts
   * @param {string}   opts.policyDir   directory of .rego policy files
   * @param {Function} [opts.runOpa]    transport ({args, inputJson}) -> stdout string; injectable for tests
   * @param {boolean}  [opts.requireOpa] if true, evaluate() throws when opa is absent (default true)
   */
  constructor(opts = {}) {
    super();
    this.policyDir = opts.policyDir;
    this.requireOpa = opts.requireOpa !== false;
    this._injected = !!opts.runOpa;
    this.runOpa = opts.runOpa || (({ args, inputJson }) =>
      execFileSync('opa', args, { input: inputJson, encoding: 'utf8', timeout: 15_000 }));
  }

  evaluate(input = {}) {
    if (!this._injected && !opaAvailable() && this.requireOpa) {
      throw new PolicyError('opa-unavailable', 'the `opa` binary is not available on this host');
    }
    const args = buildOpaArgs({ policyDir: this.policyDir });
    const out = this.runOpa({ args, inputJson: JSON.stringify({ intent: input.intent || '' }) });
    let parsed;
    try { parsed = JSON.parse(out); } catch { throw new PolicyError('opa-bad-output', 'opa returned non-JSON'); }
    const value = parsed && parsed.result && parsed.result[0] && parsed.result[0].expressions && parsed.result[0].expressions[0] && parsed.result[0].expressions[0].value;
    if (!value) throw new PolicyError('opa-no-decision', 'opa returned no decision document');
    // Normalize to the same shape JsPolicyEngine returns.
    return {
      irreversible: !!value.irreversible,
      requiresHumanGate: !!value.requiresHumanGate,
      requiredLevel: value.requiredLevel || 'propose',
      reasons: Array.isArray(value.reasons) ? value.reasons : [],
    };
  }
}

// --- factory -----------------------------------------------------------------
export function createPolicyEngine(opts = {}) {
  const want = String(opts.engine || process.env.POLICY_ENGINE || 'auto').toLowerCase();
  if (want === 'js') return new JsPolicyEngine();
  if (want === 'opa') return new OpaPolicyEngine(opts);
  // auto: use OPA when the binary AND a policy dir are available, else JS.
  return (opaAvailable() && opts.policyDir) ? new OpaPolicyEngine(opts) : new JsPolicyEngine();
}
