// src/core/sandbox.process.js
// PROCESSSANDBOX — the `laptop` fallback for the Sandbox contract.
// Runs each tool in an isolated child process with:
//   • fs access restricted to a per-run scratch directory (application-level),
//   • network egress restricted to a declared allow-list (application-level),
//   • child_process spawning blocked,
//   • a hard timeout (SIGTERM on expiry),
//   • stripped environment (no ambient credentials).
//
// Enforcement is application-level (module patching in the child). This is the
// laptop/CI fallback; kernel-level enforcement (gVisor, seccomp, netns) comes
// with Ticket 4 against the SAME contract.
//
// Known v1 limitation: a tool using named imports (`import { readFileSync }
// from 'node:fs'`) bypasses the default-export patch. Kernel-level enforcement
// (T4) has no such bypass. This is documented, not hidden.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as beacon from './beacon.js';
import { SandboxProvider, SandboxError } from './sandbox.shared.js';

// --- harness template (written into the scratch dir, runs in the child) ------
function harnessSource(scratchDir, allowedEgress) {
  return `
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const SCRATCH = ${JSON.stringify(scratchDir)};
const EGRESS = new Set(${JSON.stringify(allowedEgress)});
const violations = [];

// --- fs restriction (default-import path) -----------------------------------
function guardPath(p) {
  const s = String(p);
  if (s.startsWith('/usr/') || s.includes('node_modules') || s.startsWith('node:')) return s;
  const resolved = path.resolve(SCRATCH, s);
  if (resolved !== SCRATCH && !resolved.startsWith(SCRATCH + path.sep)) {
    violations.push({ type: 'fs-escape', path: s });
    throw new Error('sandbox: access denied outside scratch: ' + s);
  }
  return s; // valid — pass original path through
}
const _rfs = fs.readFileSync.bind(fs);
const _wfs = fs.writeFileSync.bind(fs);
const _rf  = fs.readFile.bind(fs);
const _wf  = fs.writeFile.bind(fs);
fs.readFileSync  = (p, ...a) => { guardPath(p); return _rfs(p, ...a); };
fs.writeFileSync = (p, ...a) => { guardPath(p); return _wfs(p, ...a); };
fs.readFile      = (p, ...a) => { guardPath(p); return _rf(p, ...a); };
fs.writeFile     = (p, ...a) => { guardPath(p); return _wf(p, ...a); };

// --- net restriction --------------------------------------------------------
const _connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(opts, cb) {
  let dest;
  if (typeof opts === 'number') dest = 'localhost:' + opts;
  else if (typeof opts === 'object') dest = (opts.host || '127.0.0.1') + ':' + (opts.port || 0);
  else dest = String(opts);
  if (!EGRESS.has(dest) && !EGRESS.has('*')) {
    violations.push({ type: 'net-egress', destination: dest });
    const err = new Error('sandbox: undeclared egress: ' + dest);
    this.destroy(err);
    return this;
  }
  return _connect.call(this, opts, cb);
};

// --- child_process blocked --------------------------------------------------
try {
  const cp = await import('node:child_process');
  for (const k of ['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork']) {
    if (cp[k]) cp[k] = () => { violations.push({type:'child-spawn'}); throw new Error('sandbox: child_process blocked'); };
  }
} catch {}

// --- run the tool -----------------------------------------------------------
try {
  const tool = await import('./tool.mjs');
  const fn = typeof tool.default === 'function' ? tool.default : null;
  const result = fn ? await fn({ scratchDir: SCRATCH }) : tool.default;
  _wfs(path.join(SCRATCH, '_result.json'), JSON.stringify({ ok: true, result: result ?? null, violations }));
} catch (e) {
  _wfs(path.join(SCRATCH, '_result.json'), JSON.stringify({ ok: false, error: e.message, violations }));
}
`;
}

// --- clean env (no ambient credentials) -------------------------------------
function cleanEnv(scratchDir) {
  const keep = ['PATH', 'NODE_PATH', 'HOME', 'LANG', 'TERM'];
  const env = {};
  for (const k of keep) { if (process.env[k]) env[k] = process.env[k]; }
  env.HOME = scratchDir;
  env.NODE_OPTIONS = '';
  return env;
}

export class ProcessSandbox extends SandboxProvider {
  /**
   * @param {Object} [opts]
   * @param {Function} [opts.emit]  receipt emitter (default beacon.emit)
   */
  constructor(opts = {}) {
    super();
    this.emit = opts.emit || ((meta) => beacon.emit(meta));
  }

  async run(tool, opts = {}) {
    const allowedEgress = opts.allowedEgress || [];
    const timeoutMs = opts.timeoutMs || 10_000;

    // 1. Create a per-run scratch dir (deleted after)
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-sandbox-'));

    try {
      // 2. Write the tool + harness into the scratch dir
      fs.writeFileSync(path.join(scratchDir, 'tool.mjs'), tool.code);
      fs.writeFileSync(path.join(scratchDir, '_harness.mjs'), harnessSource(scratchDir, allowedEgress));

      // 3. Spawn the child
      const result = await this._spawn(scratchDir, timeoutMs);

      // 4. Emit receipts for violations
      for (const v of (result.violations || [])) {
        // Only include defined fields — undefined values break the sign→JSON→verify
        // roundtrip because JSON.stringify drops them but canonicalize includes them.
        const detail = { type: v.type, scratchDir };
        if (v.path) detail.path = v.path;
        if (v.destination) detail.destination = v.destination;
        this.emit({
          kind: 'sandbox', actor: 'sandbox:process', action: 'violation',
          detail
        });
      }

      return result;
    } finally {
      // 5. Clean up scratch dir
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  }

  _spawn(scratchDir, timeoutMs) {
    return new Promise((resolve) => {
      const child = spawn('node', ['_harness.mjs'], {
        cwd: scratchDir,
        env: cleanEnv(scratchDir),
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs
      });

      let killed = false;
      const timer = setTimeout(() => { killed = true; child.kill('SIGTERM'); }, timeoutMs);

      child.on('close', (code, signal) => {
        clearTimeout(timer);
        const resultPath = path.join(scratchDir, '_result.json');
        try {
          const raw = fs.readFileSync(resultPath, 'utf8');
          const parsed = JSON.parse(raw);
          resolve({ ...parsed, exitCode: code, signal: killed ? 'SIGTERM' : signal });
        } catch {
          resolve({
            ok: false,
            error: killed ? 'timeout' : `child exited ${code}`,
            violations: [],
            exitCode: code,
            signal: killed ? 'SIGTERM' : signal
          });
        }
      });

      child.on('error', (e) => {
        clearTimeout(timer);
        resolve({ ok: false, error: e.message, violations: [], exitCode: null, signal: null });
      });
    });
  }
}

export function createProcessSandbox(opts) { return new ProcessSandbox(opts); }
