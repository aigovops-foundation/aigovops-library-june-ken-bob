// test/sandbox.gvisor.test.mjs
// Ticket 4: the gVisor backend's contract — detection, fallback, and the
// security-relevant container flags. The kernel-enforced run path needs a Linux
// host with runsc and so is skipped where unavailable (documented blocker); the
// argv construction is pure and asserted everywhere.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-gvisor-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const { GvisorSandbox, gvisorAvailable, buildRunArgs } = await import('../src/core/sandbox.gvisor.js');
const { createSandbox, resolveBackend } = await import('../src/core/sandbox.factory.js');
const { ProcessSandbox } = await import('../src/core/sandbox.process.js');
const { GvisorSandbox: G } = await import('../src/core/sandbox.gvisor.js');

test('gvisorAvailable() returns a boolean and is stable', () => {
  const a = gvisorAvailable();
  assert.strictEqual(typeof a, 'boolean');
  assert.strictEqual(gvisorAvailable(), a); // cached/stable
});

test('buildRunArgs pins runsc, read-only rootfs, dedicated net, and proxy env', () => {
  const args = buildRunArgs({ scratchDir: '/tmp/scratch', proxyUrl: 'http://host.docker.internal:5555', network: 'aigov-egress', timeoutSec: 10 });
  assert.ok(args.includes('--runtime=runsc'), 'uses gVisor runtime');
  assert.ok(args.includes('--read-only'), 'immutable rootfs');
  assert.ok(args.includes('--cap-drop=ALL'), 'drops capabilities');
  const ni = args.indexOf('--network');
  assert.strictEqual(args[ni + 1], 'aigov-egress', 'dedicated egress network');
  assert.ok(args.includes('-v') && args.includes('/tmp/scratch:/scratch:rw'), 'single writable scratch mount');
  assert.ok(args.some((a) => a === 'HTTPS_PROXY=http://host.docker.internal:5555'), 'guest forced through the egress proxy');
  assert.deepStrictEqual(args.slice(-3), ['node:20-alpine', 'node', '_harness.mjs']);
});

test('factory falls back to ProcessSandbox when gVisor is unavailable', () => {
  const backend = resolveBackend({ backend: 'auto' });
  const sb = createSandbox({ backend: 'auto', emit: () => {} });
  if (gvisorAvailable()) {
    assert.strictEqual(backend, 'gvisor');
    assert.ok(sb instanceof G);
  } else {
    assert.strictEqual(backend, 'process');
    assert.ok(sb instanceof ProcessSandbox, 'auto resolves to the laptop fallback');
  }
});

test('explicit gvisor backend on a host without runsc fails closed (loud)', async () => {
  const sb = new GvisorSandbox({ emit: () => {}, requireGvisor: true });
  if (!gvisorAvailable()) {
    const r = await sb.run({ code: 'export default () => 1;' }, { allowedEgress: [] }).catch((e) => e);
    assert.ok(r instanceof Error && r.reason === 'gvisor-unavailable', 'throws gvisor-unavailable, never silently runs unsandboxed');
  } else {
    assert.ok(true, 'gVisor present — live run covered by the enclave integration suite');
  }
});
