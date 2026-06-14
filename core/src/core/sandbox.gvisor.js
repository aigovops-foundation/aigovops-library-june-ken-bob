// src/core/sandbox.gvisor.js
// GVISOR BACKEND (Ticket 4) — kernel-level enforcement for the SAME Sandbox
// contract that ProcessSandbox implements at the application level.
//
// Where ProcessSandbox patches Node APIs inside the child (and is bypassable by
// named ESM imports — documented in sandbox.process.js), gVisor runs the tool
// inside a `runsc` (gVisor) container where the *kernel* enforces isolation:
//   • read-only rootfs + a single writable scratch tmpfs   → no fs escape
//   • a dedicated network whose only reachable host is the egress proxy, with
//     HTTPS_PROXY/HTTP_PROXY pointed at it                  → no undeclared egress
//   • seccomp default-deny on the syscalls that spawn processes
//   • a hard timeout (the runner kills the container)
//
// There is no patch to bypass: a named `import { connect } from 'node:net'` still
// hits the kernel, which still routes only through the proxy.
//
// PLATFORM: gVisor/`runsc` is Linux-only and needs Docker (or containerd) with
// the runsc runtime registered. On hosts without it (e.g. macOS dev laptops),
// `gvisorAvailable()` returns false and the factory falls back to
// ProcessSandbox — same contract, weaker enforcement, clearly logged.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as beacon from './beacon.js';
import { SandboxProvider, SandboxError } from './sandbox.shared.js';
import { createEgressProxy } from './egress-proxy.js';

// --- capability detection ----------------------------------------------------
// True only if a runsc runtime is actually usable (binary present AND, if Docker
// is the driver, registered as a runtime). Cached per process.
let _cached = null;
export function gvisorAvailable() {
  if (_cached !== null) return _cached;
  _cached = (() => {
    try { execFileSync('runsc', ['--version'], { stdio: 'pipe', timeout: 5000 }); }
    catch { /* runsc binary not on PATH — keep probing the docker runtime list */ }
    try {
      const out = execFileSync('docker', ['info', '--format', '{{json .Runtimes}}'], { stdio: 'pipe', timeout: 5000, encoding: 'utf8' });
      if (/runsc/.test(out)) return true;
    } catch { /* docker absent or daemon down */ }
    return false;
  })();
  return _cached;
}

// --- harness (runs inside the guest) ----------------------------------------
// No API patching: the kernel enforces. We only run the tool and capture a
// result/violation, mirroring ProcessSandbox's _result.json contract so the two
// backends are interchangeable to callers.
function guestHarness(scratchDir) {
  return `
import fs from 'node:fs';
import path from 'node:path';
const SCRATCH = ${JSON.stringify(scratchDir)};
const violations = [];
try {
  const tool = await import('./tool.mjs');
  const fn = typeof tool.default === 'function' ? tool.default : null;
  const result = fn ? await fn({ scratchDir: SCRATCH }) : tool.default;
  fs.writeFileSync(path.join(SCRATCH, '_result.json'), JSON.stringify({ ok: true, result: result ?? null, violations }));
} catch (e) {
  // A kernel-blocked fs/net/exec attempt surfaces here as an OS error (EPERM,
  // EACCES, ECONNREFUSED). We classify it so the receipt is meaningful.
  const msg = String(e && e.message || e);
  let type = 'tool-error';
  if (/EACCES|EPERM|EROFS|read-only/i.test(msg)) type = 'fs-escape';
  else if (/ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|proxy/i.test(msg)) type = 'net-egress';
  else if (/spawn|fork|exec/i.test(msg)) type = 'child-spawn';
  violations.push({ type, detail: msg });
  fs.writeFileSync(path.join(SCRATCH, '_result.json'), JSON.stringify({ ok: false, error: msg, violations }));
}
`;
}

// --- pure: the container argv (unit-testable without Docker) -----------------
// Builds the `docker run` argument vector that pins the runsc runtime, a
// read-only rootfs, a single writable scratch mount, the dedicated egress
// network, and the proxy env. Pure so the security-relevant flags are asserted
// in tests even where gVisor cannot run.
export function buildRunArgs({ scratchDir, image = 'node:20-alpine', network = 'aigov-egress', proxyUrl = null, timeoutSec = 10 }) {
  const args = [
    'run', '--rm',
    '--runtime=runsc',            // gVisor — the whole point
    '--read-only',                // immutable rootfs
    '--cap-drop=ALL',             // no Linux capabilities
    '--security-opt', 'no-new-privileges',
    '--pids-limit', '64',         // blunt cap on process spawning
    '--network', network,         // dedicated net: only the proxy is reachable
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
    '-v', `${scratchDir}:/scratch:rw`,
    '-w', '/scratch',
    '--stop-timeout', String(timeoutSec),
  ];
  if (proxyUrl) {
    args.push('-e', `HTTPS_PROXY=${proxyUrl}`, '-e', `HTTP_PROXY=${proxyUrl}`,
      '-e', `https_proxy=${proxyUrl}`, '-e', `http_proxy=${proxyUrl}`,
      '-e', 'NO_PROXY=');
  }
  args.push(image, 'node', '_harness.mjs');
  return args;
}

export class GvisorSandbox extends SandboxProvider {
  /**
   * @param {Object} [opts]
   * @param {string}   [opts.image]    container image (default node:20-alpine)
   * @param {string}   [opts.network]  dedicated docker network name
   * @param {Function} [opts.emit]     receipt emitter (default beacon.emit)
   * @param {boolean}  [opts.requireGvisor]  if true, run() throws when runsc is absent
   *                                          instead of being a no-op (default true)
   */
  constructor(opts = {}) {
    super();
    this.image = opts.image || process.env.SANDBOX_IMAGE || 'node:20-alpine';
    this.network = opts.network || process.env.SANDBOX_EGRESS_NET || 'aigov-egress';
    this.emit = opts.emit || ((meta) => beacon.emit(meta));
    this.requireGvisor = opts.requireGvisor !== false;
  }

  async run(tool, opts = {}) {
    if (!gvisorAvailable()) {
      // Fail closed and loud — the factory is responsible for choosing a fallback.
      if (this.requireGvisor) throw new SandboxError('gvisor-unavailable', 'runsc (gVisor) runtime is not available on this host');
    }
    const allowedEgress = opts.allowedEgress || [];
    const timeoutMs = opts.timeoutMs || 10_000;
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-gvisor-'));

    // One egress proxy per run, bound to this tool's declared allow-list.
    const proxy = createEgressProxy({ allow: allowedEgress, emit: this.emit });
    let proxyUrl = null;
    try {
      const port = await proxy.listen();
      // The guest reaches the host proxy via Docker's host gateway alias.
      proxyUrl = `http://host.docker.internal:${port}`;

      fs.writeFileSync(path.join(scratchDir, 'tool.mjs'), tool.code);
      fs.writeFileSync(path.join(scratchDir, '_harness.mjs'), guestHarness('/scratch'));

      const args = buildRunArgs({ scratchDir, image: this.image, network: this.network, proxyUrl, timeoutSec: Math.ceil(timeoutMs / 1000) });
      const result = await this._dockerRun(args, scratchDir, timeoutMs);

      // Proxy-side egress refusals count as violations too.
      for (const b of proxy.blocked) result.violations = (result.violations || []).concat([{ type: 'net-egress', destination: b.destination }]);
      for (const v of (result.violations || [])) {
        const detail = { type: v.type, scratchDir };
        if (v.path) detail.path = v.path;
        if (v.destination) detail.destination = v.destination;
        this.emit({ kind: 'sandbox', actor: 'sandbox:gvisor', action: 'violation', detail });
      }
      return result;
    } finally {
      await proxy.close().catch(() => {});
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  }

  _dockerRun(args, scratchDir, timeoutMs) {
    return new Promise((resolve) => {
      const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let killed = false;
      const timer = setTimeout(() => { killed = true; child.kill('SIGTERM'); }, timeoutMs);
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        try {
          const parsed = JSON.parse(fs.readFileSync(path.join(scratchDir, '_result.json'), 'utf8'));
          resolve({ ...parsed, exitCode: code, signal: killed ? 'SIGTERM' : signal });
        } catch {
          resolve({ ok: false, error: killed ? 'timeout' : `container exited ${code}`, violations: [], exitCode: code, signal: killed ? 'SIGTERM' : signal });
        }
      });
      child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, error: e.message, violations: [], exitCode: null, signal: null }); });
    });
  }
}

export function createGvisorSandbox(opts) { return new GvisorSandbox(opts); }
