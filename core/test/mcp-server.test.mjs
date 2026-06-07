// test/mcp-server.test.mjs
// Ticket A2 — smoke-test the MCP surface: spawn the server and speak
// newline-delimited JSON-RPC (initialize -> tools/list -> tools/call).

import { test } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '..', 'scripts', 'mcp-server.mjs');

test('MCP server: initialize, tools/list, and a tools/call', async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-mcp-'));
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, KEYS_DIR: path.join(TMP, 'keys'), LEDGER_DIR: path.join(TMP, 'ledger') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const responses = new Map();
  let buf = '';
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('MCP server timed out')), 15000);
      child.on('error', reject);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (d) => {
        buf += d;
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let m; try { m = JSON.parse(line); } catch { continue; }
          if (m.id !== undefined) responses.set(m.id, m);
          if (responses.has(1) && responses.has(2) && responses.has(3)) { clearTimeout(timer); resolve(); }
        }
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'skills_list', arguments: {} } }) + '\n');
    });
  } finally {
    child.kill();
  }

  assert.equal(responses.get(1).result.protocolVersion, '2024-11-05', 'initialize handshake');
  const toolNames = responses.get(2).result.tools.map((t) => t.name);
  for (const n of ['gov_propose', 'gov_decide', 'gov_run_tool', 'gov_verify', 'skills_list', 'skills_run']) {
    assert.ok(toolNames.includes(n), `tools/list should advertise ${n}`);
  }
  const text = responses.get(3).result.content[0].text;
  assert.ok(text.includes('framework-map'), 'skills_list should return the skills registry');
});
