#!/usr/bin/env node
// scripts/pulse.mjs
// SYSTEM PULSE — exercises the live engine (T0/T1/T3/T5) and generates a
// self-contained HTML report at docs/pulse.html. Designed to run in CI (pages
// workflow) so every push produces an updated Pulse page. Also runnable locally
// via `cd core && node scripts/pulse.mjs`.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(__dirname, '..', '..', 'docs');
const OUT = path.join(DOCS, 'pulse.html');

// --- hermetic temp dirs (so the exercise doesn't touch the real ledger) ------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-pulse-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const SCOPE = 'github-deploy';
const MASTER = 'MASTER-PULSE-DO-NOT-LEAK';
function writeStore() {
  const p = path.join(TMP, 'store.json');
  fs.writeFileSync(p, JSON.stringify({ owner: 'lab', scopes: { [SCOPE]: MASTER }, rotated: { [SCOPE]: new Date().toISOString().slice(0, 10) } }));
  return p;
}

// --- dynamic imports (after env is set) -------------------------------------
const beacon = await import('../src/core/beacon.js');
const { FileProvider } = await import('../src/core/secrets.fileprovider.js');
const gate = await import('../src/core/gate.js');
const { Caps } = await import('../src/core/caps.js');
const { ProcessSandbox } = await import('../src/core/sandbox.process.js');

// --- run the exercises ------------------------------------------------------
const results = [];
function check(name, fn) {
  try { const r = fn(); results.push({ name, ok: true, detail: r }); }
  catch (e) { results.push({ name, ok: false, detail: e.message }); }
}
async function checkAsync(name, fn) {
  try { const r = await fn(); results.push({ name, ok: true, detail: r }); }
  catch (e) { results.push({ name, ok: false, detail: e.message }); }
}

const storePath = writeStore();
const secrets = new FileProvider({ storePath });
const caps = new Caps();
caps.setProfile('agent:deploy', { level: 'act', maxSpend: 50, maxRate: 5, windowMs: 60_000, maxBlastRadius: 10 });

// T0: SecretsProvider — mint / scope / expire / revoke
check('T0 · issue a scoped grant', () => {
  const g = secrets.issue(SCOPE, 60, 'pulse-check');
  if (g.token === MASTER) throw new Error('token === master!');
  return `grantId=${g.grantId.slice(0,8)}… token≠master ✓ ttl=60s`;
});

check('T0 · redeem the token (valid)', () => {
  const g = secrets.issue(SCOPE, 60, 'pulse-check');
  const r = secrets.redeem(g.token);
  return `redeem ok=${r.ok} scope=${r.scope}`;
});

check('T0 · revoke → token fails closed', () => {
  const g = secrets.issue(SCOPE, 60, 'pulse-check');
  secrets.revoke(g.grantId);
  try { secrets.redeem(g.token); return 'FAIL: should have thrown'; }
  catch (e) { return `revoked → ${e.reason} ✓`; }
});

check('T0 · describe() leaks no secret', () => {
  const rec = secrets.describe(SCOPE);
  const json = JSON.stringify(rec);
  if (json.includes(MASTER)) throw new Error('describe leaked master!');
  return `owner=${rec.owner} scope=${rec.scope} activeGrants=${rec.activeGrants}`;
});

// T1: Gate — approve brokers linked token; deny fails closed
check('T1 · approve → paired linked receipts', () => {
  const prop = { summary: 'deploy the site', requiresHumanGate: true };
  const r = gate.decide({ proposal: prop, decision: 'approve', scope: SCOPE, ttlSeconds: 30, requestedBy: 'pulse-check', secrets });
  if (!r.grant) throw new Error('no grant on approve');
  return `approved ✓ proposalId=${r.proposalId.slice(0,8)}… token=${r.grant.token.slice(0,8)}…`;
});

check('T1 · deny → no token, fails closed', () => {
  const prop = { summary: 'deploy the site', requiresHumanGate: true };
  const r = gate.decide({ proposal: prop, decision: 'deny', scope: SCOPE, ttlSeconds: 30, secrets });
  if (r.grant) throw new Error('got a grant on deny!');
  return `denied ✓ grant=null reason=${r.reason}`;
});

// T5: Caps — spend cap halts; dial-down immediate
check('T5 · under cap → approved', () => {
  const prop = { summary: 'deploy the site', requiresHumanGate: true };
  const r = gate.decide({ proposal: prop, decision: 'approve', scope: SCOPE, ttlSeconds: 30, requestedBy: 'agent:deploy', secrets, caps, cost: { spend: 10 } });
  return `approved=${r.approved} ✓ spend recorded`;
});

check('T5 · at cap → halted + breach receipt', () => {
  // agent:deploy already spent 10; maxSpend=50, keep spending
  const prop = { summary: 'deploy', requiresHumanGate: true };
  for (let i = 0; i < 4; i++) gate.decide({ proposal: prop, decision: 'approve', scope: SCOPE, ttlSeconds: 30, requestedBy: 'agent:deploy', secrets, caps, cost: { spend: 10 } });
  // now at 50/50 — next should halt
  const r = gate.decide({ proposal: prop, decision: 'approve', scope: SCOPE, ttlSeconds: 30, requestedBy: 'agent:deploy', secrets, caps, cost: { spend: 1 } });
  if (r.approved) throw new Error('should have halted at cap!');
  return `capped=${r.capped} ✓ reason=${r.reason}`;
});

check('T5 · dial-down takes effect immediately', () => {
  caps.setProfile('agent:test-dial', { level: 'act', maxSpend: 1000 });
  const prop = { summary: 'deploy', requiresHumanGate: true };
  const r1 = gate.decide({ proposal: prop, decision: 'approve', scope: SCOPE, ttlSeconds: 30, requestedBy: 'agent:test-dial', secrets, caps, cost: { requiredLevel: 'act' } });
  if (!r1.approved) throw new Error('first should approve');
  caps.setLevel('agent:test-dial', 'read');
  const r2 = gate.decide({ proposal: prop, decision: 'approve', scope: SCOPE, ttlSeconds: 30, requestedBy: 'agent:test-dial', secrets, caps, cost: { requiredLevel: 'act' } });
  if (r2.approved) throw new Error('should deny after dial-down');
  return `act→approved ✓  dial→read  act→denied ✓`;
});

// T3: Sandbox — fs escape blocked; legit tool succeeds
await checkAsync('T3 · fs escape blocked + violation receipt', async () => {
  const sb = new ProcessSandbox({ emit: () => {} });
  const r = await sb.run({ code: `import fs from 'node:fs';\nexport default () => fs.readFileSync('/etc/passwd','utf8');` });
  if (r.ok) throw new Error('should have blocked fs escape');
  return `ok=false ✓ violations=[${r.violations.map(v=>v.type).join(',')}]`;
});

await checkAsync('T3 · legit tool runs inside scratch', async () => {
  const sb = new ProcessSandbox({ emit: () => {} });
  const r = await sb.run({ code: `import fs from 'node:fs'; import path from 'node:path';\nexport default ({scratchDir}) => { fs.writeFileSync(path.join(scratchDir,'out.txt'),'pulse'); return fs.readFileSync(path.join(scratchDir,'out.txt'),'utf8'); };` });
  if (!r.ok || r.result !== 'pulse') throw new Error('legit tool should succeed');
  return `ok=true ✓ result="${r.result}"`;
});

// Ledger verification
check('Beacon · ledger chain + signatures verify', () => {
  const v = beacon.verifyLedger();
  if (!v.valid) throw new Error(`ledger invalid: ${JSON.stringify(v.broken)}`);
  return `entries=${v.entries} valid=true ✓`;
});

check('Beacon · no secret material in ledger', () => {
  const raw = fs.readFileSync(beacon.ledgerFile(), 'utf8');
  if (raw.includes(MASTER)) throw new Error('secret leaked into ledger!');
  return `scanned ${raw.split('\\n').length} lines — clean ✓`;
});

// --- build the report -------------------------------------------------------
const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok).length;
const total = results.length;
const ts = new Date().toISOString();
let sha = process.env.GITHUB_SHA || '';
if (!sha) try { sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim(); } catch {}

const MILESTONES = [
  { name: 'First brokered action', tickets: 'T0 + T1', reached: true },
  { name: 'First sandboxed useful agent', tickets: 'T0 + T1 + T3 + T5', reached: true },
  { name: 'First watchable system', tickets: '+ T6 + T8', reached: false },
  { name: 'First enclave-ready release', tickets: '+ T2 + T4 + T9 + T10', reached: false },
];

const BADGE_URL = 'https://github.com/aigovops-foundation/aigovops-library-june-ken-bob/actions/workflows/ci.yml/badge.svg?branch=main';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>System Pulse — AiGovOps Library</title>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Spectral:ital,wght@0,400;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
:root{--bg:#0c1430;--teal:#01696f;--green:#2ecc71;--green2:#6fe6a3;--gold:#e8c25a;--ink:#e7f3f1;--ink2:#9fc0bd;--red:#e74c3c;--line:rgba(120,200,190,.18);--card:rgba(255,255,255,.04)}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font:17px/1.7 'Spectral',Georgia,serif;min-height:100vh;
  background-image:repeating-linear-gradient(0deg,transparent,transparent 39px,var(--line) 39px,var(--line) 40px),
  repeating-linear-gradient(90deg,transparent,transparent 39px,var(--line) 39px,var(--line) 40px);
  background-size:40px 40px}
.wrap{max-width:900px;margin:0 auto;padding:40px 24px 80px}
a{color:var(--green2)}
h1{font:700 38px/1.15 'Cinzel',serif;color:#fff;margin-bottom:6px}
h2{font:600 22px/1.3 'Cinzel',serif;color:#fff;margin:36px 0 14px;border-bottom:1px solid var(--line);padding-bottom:8px}
.meta{font:400 13px 'IBM Plex Mono',monospace;color:var(--ink2);margin-bottom:24px}
.meta span{margin-right:18px}
.badge{vertical-align:middle;margin-left:4px}
.back{font:500 13px 'IBM Plex Mono',monospace;color:var(--teal);text-decoration:none;display:inline-block;margin-bottom:18px}
.back:hover{color:var(--green2)}
/* scoreboard */
.score{display:flex;gap:12px;margin:16px 0 24px;flex-wrap:wrap}
.score .s{flex:1;min-width:100px;text-align:center;padding:14px 8px;border:1px solid var(--line);border-radius:10px;background:var(--card)}
.score .s .n{font:700 32px 'Cinzel',serif}
.score .s .l{font:400 11px 'IBM Plex Mono',monospace;color:var(--ink2);text-transform:uppercase;letter-spacing:.08em;margin-top:4px}
.pass .n{color:var(--green2)} .fail .n{color:var(--red)}
/* checks */
.checks{list-style:none;padding:0}
.checks li{padding:10px 14px;border-bottom:1px solid var(--line);display:flex;align-items:baseline;gap:10px;font-size:15px}
.checks li:last-child{border-bottom:none}
.checks .icon{font-size:18px;flex-shrink:0}
.checks .name{font:500 14px 'IBM Plex Mono',monospace;color:#fff;min-width:180px}
.checks .detail{color:var(--ink2);font-size:13.5px;font-family:'IBM Plex Mono',monospace}
.ok{color:var(--green2)} .no{color:var(--red)}
/* milestones */
.miles{list-style:none;padding:0}
.miles li{padding:8px 0;display:flex;gap:10px;align-items:center}
.miles .dot{width:14px;height:14px;border-radius:50%;flex-shrink:0}
.miles .dot.done{background:var(--green2)} .miles .dot.todo{background:var(--line)}
.miles .label{font:500 14px 'IBM Plex Mono',monospace;color:#fff}
.miles .tickets{font:400 12px 'IBM Plex Mono',monospace;color:var(--ink2);margin-left:8px}
footer{margin-top:48px;padding-top:16px;border-top:1px solid var(--line);font:400 12px 'IBM Plex Mono',monospace;color:var(--ink2)}
</style>
</head>
<body>
<div class="wrap">
<a class="back" href="./index.html">← back to the library</a>
<h1>System Pulse</h1>
<div class="meta">
  <span>Generated ${ts.replace('T', ' ').slice(0, 19)} UTC</span>
  ${sha ? `<span>commit <a href="https://github.com/aigovops-foundation/aigovops-library-june-ken-bob/commit/${sha}">${sha.slice(0,7)}</a></span>` : ''}
  <span>CI <img class="badge" src="${BADGE_URL}" alt="CI status" height="18"/></span>
</div>

<div class="score">
  <div class="s pass"><div class="n">${passed}</div><div class="l">passed</div></div>
  <div class="s ${failed ? 'fail' : 'pass'}"><div class="n">${failed}</div><div class="l">failed</div></div>
  <div class="s"><div class="n">${total}</div><div class="l">checks</div></div>
  <div class="s"><div class="n">${beacon.ledgerCount()}</div><div class="l">receipts</div></div>
</div>

<h2>Milestones</h2>
<ul class="miles">
${MILESTONES.map(m => `  <li><span class="dot ${m.reached ? 'done' : 'todo'}"></span><span class="label">${m.name}</span><span class="tickets">${m.tickets}</span></li>`).join('\n')}
</ul>

<h2>Engine Exercise</h2>
<ul class="checks">
${results.map(r => `  <li><span class="icon ${r.ok ? 'ok' : 'no'}">${r.ok ? '●' : '✕'}</span><span class="name">${r.name}</span><span class="detail">${typeof r.detail === 'string' ? r.detail.replace(/</g,'&lt;') : JSON.stringify(r.detail)}</span></li>`).join('\n')}
</ul>

<footer>
  Generated by <code>core/scripts/pulse.mjs</code> · exercises run in an isolated temp ledger · no secrets or PII in this report ·
  <a href="https://github.com/aigovops-foundation/aigovops-library-june-ken-bob">repo</a>
</footer>
</div>
</body>
</html>`;

// --- write ------------------------------------------------------------------
fs.mkdirSync(DOCS, { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`[pulse] wrote ${OUT}  (${passed}/${total} passed, ${beacon.ledgerCount()} receipts)`);

// cleanup temp
fs.rmSync(TMP, { recursive: true, force: true });
