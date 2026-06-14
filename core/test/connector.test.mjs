// test/connector.test.mjs
// #2 — the govern-any-agent MCP connector. The manifest is valid and points at
// the real server; the server advertises gov_status and reports an accurate,
// non-spoofable governance posture over MCP.

import { test } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.resolve(__dirname, '..');
const SERVER = path.join(CORE, 'scripts', 'mcp-server.mjs');

test('connector manifest is valid JSON and references the real server', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(CORE, 'connector', 'mcp.json'), 'utf8'));
  const entry = manifest.mcpServers['aigovops-governed-core'];
  assert.ok(entry, 'declares the governed-core server');
  assert.strictEqual(entry.command, 'node');
  assert.ok(entry.args.some((a) => a.endsWith('core/scripts/mcp-server.mjs')), 'points at mcp-server.mjs');
  assert.ok(fs.existsSync(SERVER), 'the referenced server file exists');
});

test('npm run mcp script is declared', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(CORE, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.scripts.mcp, 'node scripts/mcp-server.mjs');
});

test('MCP server advertises gov_status and reports an honest posture', async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-conn-'));
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, KEYS_DIR: path.join(TMP, 'keys'), LEDGER_DIR: path.join(TMP, 'ledger'), AIGOV_MCP_ROLE: 'member' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const responses = new Map();
  let buf = '';
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out')), 15000);
      child.on('error', reject);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (d) => {
        buf += d; let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          let m; try { m = JSON.parse(line); } catch { continue; }
          if (m.id !== undefined) responses.set(m.id, m);
          if (responses.has(1) && responses.has(2) && responses.has(3)) { clearTimeout(timer); resolve(); }
        }
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'gov_status', arguments: {} } }) + '\n');
    });
  } finally { child.kill(); }

  const toolNames = responses.get(2).result.tools.map((t) => t.name);
  assert.ok(toolNames.includes('gov_status'), 'tools/list advertises gov_status');
  const status = JSON.parse(responses.get(3).result.content[0].text);
  assert.strictEqual(status.governed, true);
  assert.strictEqual(status.principal.role, 'member', 'default principal is a member (not spoofable to steward)');
  assert.strictEqual(status.principal.scope, 'own');
  assert.strictEqual(typeof status.ledger.valid, 'boolean');
  assert.ok(status.model && 'localFirst' in status.model);
});
