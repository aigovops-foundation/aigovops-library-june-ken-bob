// src/core/sandbox.shared.js
// SINGLE SOURCE OF TRUTH for the Sandbox contract (Ticket 3).
// Environment-neutral: defines what "sandboxed" MEANS, not how it's enforced.
//   • ProcessSandbox (laptop)  — sandbox.process.js: patches + process isolation
//   • gVisor backend (enclave) — Ticket 4: kernel-level enforcement, same contract
//
// A sandboxed tool:
//   1. Cannot read or write outside its declared scratch directory.
//   2. Cannot open a network connection to any host not in its declared egress list.
//   3. Cannot spawn child processes.
//   4. Has a hard timeout — killed if exceeded.
//   5. Every violation emits a signed, metadata-only receipt.

/**
 * @typedef {Object} SandboxResult
 * @property {boolean} ok         true if the tool completed without violations
 * @property {*}       result     the tool's return value (or null)
 * @property {string}  [error]    error message if ok===false
 * @property {Array}   violations [{type, detail}] — every blocked attempt
 * @property {number}  [exitCode] child process exit code
 * @property {string}  [signal]   kill signal if timed out
 */

export class SandboxError extends Error {
  constructor(reason, message) { super(message || reason); this.name = 'SandboxError'; this.reason = reason; }
}

// The contract. Backends extend this.
export class SandboxProvider {
  /**
   * Run a tool in an isolated sandbox.
   * @param {Object} tool              { code: string } — the tool's JS module source
   * @param {Object} opts
   * @param {Array}  [opts.allowedEgress]  host:port pairs the tool may connect to (default: none)
   * @param {number} [opts.timeoutMs]      hard timeout in ms (default: 10000)
   * @returns {Promise<SandboxResult>}
   */
  async run(/* tool, opts */) { throw new SandboxError('not-implemented', 'run() not implemented'); }
}
