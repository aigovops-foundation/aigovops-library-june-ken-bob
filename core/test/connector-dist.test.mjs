// test/connector-dist.test.mjs
// #5 — connector distribution packaging (code only; nothing is published). The
// installer is valid shell and prints a usable config; the registry listing is
// well-formed; the npm bin points at the real server.

import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.resolve(__dirname, '..');
const CONN = path.join(CORE, 'connector');

test('install.sh is valid bash and --print emits a usable mcp config', () => {
  const sh = path.join(CONN, 'install.sh');
  execFileSync('bash', ['-n', sh]);   // syntax check (throws on error)
  const out = execFileSync('bash', [sh, '--print'], { encoding: 'utf8' });
  const cfg = JSON.parse(out);
  const entry = cfg.mcpServers['aigovops-governed-core'];
  assert.ok(entry && entry.command === 'node');
  assert.ok(entry.args[0].endsWith('scripts/mcp-server.mjs'));
  assert.ok(fs.existsSync(entry.args[0]), 'the config points at a real server file');
});

test('server.json registry listing is well-formed and lists the governed tools', () => {
  const s = JSON.parse(fs.readFileSync(path.join(CONN, 'server.json'), 'utf8'));
  assert.match(s.name, /governed-core/);
  assert.ok(s.description.length > 20);
  assert.ok(Array.isArray(s.tools) && s.tools.includes('gov_status') && s.tools.includes('gov_propose'));
  assert.strictEqual(s.install.command, 'node');
  assert.match(s._note, /NOT yet published/i, 'honest: scaffold only, not published');
});

test('npm bin exposes aigovops-mcp -> the real server', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(CORE, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.bin['aigovops-mcp'], 'scripts/mcp-server.mjs');
  assert.ok(fs.existsSync(path.join(CORE, pkg.bin['aigovops-mcp'])));
  // the server has a shebang so it's executable as a bin
  assert.match(fs.readFileSync(path.join(CORE, 'scripts', 'mcp-server.mjs'), 'utf8').split('\n')[0], /^#!.*node/);
});
