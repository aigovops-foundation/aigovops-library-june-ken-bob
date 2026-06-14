// test/tools.test.mjs
// #3 — the vetted tool registry + runner. A registered tool runs only with a
// brokered token whose scope equals the tool's requiredScope; egress is the
// tool's declared list; kernel-only tools fail closed on the laptop sandbox.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-tools-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');
const STORE = path.join(TMP, 'secrets.json');
fs.writeFileSync(STORE, JSON.stringify({ owner: 'lab', scopes: { demo: 'M1', 'github-deploy': 'M2' }, rotated: {} }));

const { createToolRegistry, buildToolCode } = await import('../src/core/tools.js');
const { createGovernedCore } = await import('../src/core/govapi.js');
const { FileProvider } = await import('../src/core/secrets.fileprovider.js');

function core() {
  return createGovernedCore({ secrets: new FileProvider({ storePath: STORE }) });
}
// Helper: propose+approve to get a brokered token for a scope.
function brokeredToken(c, scope) {
  const { pendingId } = c.propose(`deploy via ${scope}`, { actor: 'agent:test' });
  const res = c.decide(pendingId, 'approve', { scope });
  return res.grant.token;
}

test('registry lists vetted tools with their declared envelope', () => {
  const reg = createToolRegistry();
  const echo = reg.list().find((t) => t.name === 'echo');
  assert.ok(echo);
  assert.strictEqual(echo.requiredScope, 'demo');
  assert.ok(reg.list().some((t) => t.name === 'git-commit' && t.requiresKernelSandbox === true));
  // list() never leaks the code body
  assert.ok(reg.list().every((t) => !('code' in t)));
});

test('buildToolCode injects input as a sandbox-safe constant', () => {
  const code = buildToolCode({ code: 'export default () => INPUT;' }, { text: 'hi"x' });
  assert.match(code, /const INPUT = \{"text":"hi\\"x"\};/);
});

test('a laptop-safe tool runs with a scope-matched token and emits a receipt', async () => {
  const c = core();
  const token = brokeredToken(c, 'demo');
  const r = await c.runRegisteredTool({ token, tool: 'sha256', input: { text: 'hello' } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.result.sha256, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});

test('scope mismatch fails closed (token scope != tool requiredScope)', async () => {
  const c = core();
  const token = brokeredToken(c, 'github-deploy');   // wrong scope for the demo tool
  await assert.rejects(() => c.runRegisteredTool({ token, tool: 'echo', input: {} }), (e) => e.reason === 'scope-mismatch');
});

test('a kernel-only tool fails closed on the laptop ProcessSandbox', async () => {
  const c = core();
  const token = brokeredToken(c, 'github-deploy');
  await assert.rejects(() => c.runRegisteredTool({ token, tool: 'git-commit', input: { message: 'x' } }),
    (e) => e.reason === 'needs-kernel-sandbox');
});

test('an unknown tool and a missing token both fail closed', async () => {
  const c = core();
  const token = brokeredToken(c, 'demo');
  await assert.rejects(() => c.runRegisteredTool({ token, tool: 'nope' }), (e) => e.reason === 'unknown-tool');
  await assert.rejects(() => c.runRegisteredTool({ tool: 'echo' }), /brokered token is required/);
});
