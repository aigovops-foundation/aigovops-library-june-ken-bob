// src/core/sandbox.factory.js
// CONFIG-ONLY sandbox backend swap (Ticket 4). Callers ask for a SandboxProvider
// and get the strongest backend this host can actually enforce:
//
//   SANDBOX_BACKEND     backend          enforcement
//   ------------------  ---------------  ----------------------------------------
//   auto (default)      gVisor if usable kernel-level; else ProcessSandbox (app)
//   gvisor              GvisorSandbox    kernel-level (requires runsc)
//   process             ProcessSandbox   application-level (laptop/CI fallback)
//
// The principle holds: define the contract once (sandbox.shared.js), enforce it
// with the strongest backend each environment allows.

import { ProcessSandbox } from './sandbox.process.js';
import { GvisorSandbox, gvisorAvailable } from './sandbox.gvisor.js';

export function resolveBackend(opts = {}) {
  const want = String(opts.backend || process.env.SANDBOX_BACKEND || 'auto').toLowerCase();
  if (want === 'process') return 'process';
  if (want === 'gvisor') return 'gvisor';
  return gvisorAvailable() ? 'gvisor' : 'process'; // auto
}

export function createSandbox(opts = {}) {
  const backend = resolveBackend(opts);
  if (backend === 'gvisor') return new GvisorSandbox(opts);
  return new ProcessSandbox(opts);
}
