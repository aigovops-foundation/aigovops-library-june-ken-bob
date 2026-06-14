#!/usr/bin/env node
// core/scripts/run-skill.mjs
// SKILL-RUNNER (prototype — Ticket A1).
// Turns the uniform plan/skills/*/SKILL.md contract into something runnable: it
// reads the registry, dispatches the three skills that have a real backend
// today, ENFORCES the declared human gate, and emits the metadata-only Beacon
// receipt the skill specifies — so a skill run leaves verifiable evidence.
//
// Dependency-free (node: built-ins + the core's own modules). Usage:
//   node core/scripts/run-skill.mjs list
//   node core/scripts/run-skill.mjs run framework-map --input "AI tool that screens job candidates"
//   node core/scripts/run-skill.mjs run beacon-sign-evidence --meta '{"kind":"artifact","actor":"agent:test","action":"demo","contentHash":"abc123"}'
//   node core/scripts/run-skill.mjs run op-github-deploy            # refused — human-gated + irreversible
//
// Exit 0 on success; non-zero on error or a gate refusal without --approve.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// SKILLS_DIR is overridable (env) so a new skill can be registered + run without
// touching this file — that's the A1 "no runner code change" property.
const SKILLS_DIR = process.env.SKILLS_DIR || path.resolve(__dirname, '..', '..', 'plan', 'skills');

// Keep keys/ledger inside core/ regardless of the caller's CWD (tests override
// these BEFORE importing this module). beacon freezes KEYS_DIR at import time, so
// the defaults must be set before the dynamic import below.
if (!process.env.KEYS_DIR) process.env.KEYS_DIR = path.resolve(__dirname, '..', 'keys');
if (!process.env.LEDGER_DIR) process.env.LEDGER_DIR = path.resolve(__dirname, '..', 'ledger');

const beacon = await import('../src/core/beacon.js');
const policy = await import('../src/core/policy.js');
const scanners = await import('../src/core/scanners.js');
const a11y = await import('../src/core/a11y.js');
const reports = await import('../src/core/reports.js');
const { evaluate } = policy;
const { review } = scanners;
const { audit } = a11y;
const { statusReport, monitorAlerts } = reports;

// Pre-loaded core modules a SKILL.md `run: core:<module>#<fn>` can dispatch to
// synchronously (so runSkill stays sync — govapi/server call it without await).
// A new skill over any of these modules is runnable by ONE `run:` line; a new
// module is added here once.
const CORE_MODULES = {
  'policy.js': policy,
  'scanners.js': scanners,
  'a11y.js': a11y,
  'reports.js': reports,
  'beacon.js': beacon,
};

// Skills that are irreversible/credential-touching even if their SKILL.md uses a
// different heading than "## Human gate" — always treated as human-gated.
const IRREVERSIBLE = new Set(['op-github-deploy']);

// ── SKILL.md parsing ──────────────────────────────────────────────────────────
// The contract is uniform: YAML frontmatter (name, description) + fixed H2
// sections. We parse only what the runner needs: name, the human gate, evidence.
function parseSkill(md) {
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  const front = fm ? fm[1] : '';
  const name = (front.match(/^name:\s*(.+)$/m) || [])[1]?.trim();
  const section = (title) => {
    const re = new RegExp(`##\\s+${title}\\s*\\n([\\s\\S]*?)(?:\\n##\\s|$)`, 'i');
    return (md.match(re) || [])[1]?.trim() || '';
  };
  const owner = (md.match(/\*\*Owning agent:\*\*\s*(.+)/) || [])[1]?.trim() || null;
  const humanGate = section('Human gate');
  // A gate that literally says "None" (e.g. beacon-sign-evidence) is not blocking.
  const sectionGated = humanGate.length > 0 && !/^none\b/i.test(humanGate);
  // Generic dispatch (A1): `run:` selects the backend; `inputs`/`outputs` are
  // single-line JSON schemas. `run:` forms:
  //   handler:<key>          built-in bespoke handler (the 7 wired skills)
  //   core:<module>#<fn>     generic invoker over a pre-loaded core module
  //   prose                  authoring skill performed through the loop (not tool-runnable)
  const run = (front.match(/^run:\s*(.+)$/m) || [])[1]?.trim() || null;
  const inputs = parseJsonLine(front, 'inputs');
  const outputs = parseJsonLine(front, 'outputs');
  return { name, owner, humanGate, sectionGated, run, inputs, outputs };
}

function parseJsonLine(front, key) {
  const m = front.match(new RegExp(`^${key}:\\s*(\\{.*\\})\\s*$`, 'm'));
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// A skill is runnable if its `run:` resolves (handler key exists, or a core ref),
// falling back to the legacy name->HANDLERS map when no `run:` is declared.
function isRunnable(run, name) {
  if (run === 'prose') return false;
  if (run && run.startsWith('core:')) return true;
  if (run && run.startsWith('handler:')) return run.slice('handler:'.length) in HANDLERS;
  return name in HANDLERS;
}

// Dependency-free subset JSON-schema validator (object/string/number; required,
// properties, minLength, enum). Used only on the generic core dispatch path so
// the bespoke handlers' own error messages are unchanged.
function validateInput(value, schema) {
  if (!schema) return;
  const errs = [];
  const check = (v, s, where) => {
    if (s.type === 'object') {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return errs.push(`${where || 'input'} must be an object`);
      for (const req of s.required || []) if (!(req in v)) errs.push(`missing required '${req}'`);
      for (const [k, sub] of Object.entries(s.properties || {})) if (k in v) check(v[k], sub, k);
    } else if (s.type === 'string') {
      if (typeof v !== 'string') errs.push(`${where} must be a string`);
      else if (s.minLength && v.length < s.minLength) errs.push(`${where} is too short`);
      else if (s.enum && !s.enum.includes(v)) errs.push(`${where} is not one of ${s.enum.join(', ')}`);
    } else if (s.type === 'number') {
      if (typeof v !== 'number') errs.push(`${where} must be a number`);
    }
  };
  check(value, schema, '');
  if (errs.length) throw new Error(`input validation failed: ${errs.join('; ')}`);
}

// Generic invoker for `run: core:<module>#<fn>` — imports nothing new at call
// time (modules are pre-loaded), calls the function, and emits ONE metadata-only
// receipt. This is how a NEW skill runs with no runner code change.
function invokeCore(run, args, name, meta) {
  const [mod, fn] = run.slice('core:'.length).split('#');
  const ns = CORE_MODULES[mod];
  if (!ns) throw new Error(`run: ${run} — module '${mod}' is not pre-loaded (add it to CORE_MODULES once)`);
  if (typeof ns[fn] !== 'function') throw new Error(`run: ${run} — '${fn}' is not a function`);
  const arg = args && Object.prototype.hasOwnProperty.call(args, 'input') ? args.input : args;
  const result = ns[fn](arg);
  const signed = beacon.emit({
    kind: 'artifact', actor: meta.owner ? `agent:${meta.owner}` : 'agent:skill', action: name,
    contentHash: beacon.sha256(JSON.stringify(args || {})), detail: { via: 'core', fn },
  });
  return { result, receipt: receiptView(signed) };
}

export function listSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const p = path.join(SKILLS_DIR, d.name, 'SKILL.md');
      if (!fs.existsSync(p)) return null;
      const meta = parseSkill(fs.readFileSync(p, 'utf8'));
      const name = meta.name || d.name;
      const gated = meta.sectionGated || IRREVERSIBLE.has(name);
      return { ...meta, name, dir: d.name, gated, runnable: isRunnable(meta.run, name) };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getSkill(name) {
  return listSkills().find(s => s.name === name) || null;
}

// ── Handlers: the three skills with a real backend today ──────────────────────
// Each returns a plain result object. Receipt-emitting handlers append exactly
// one metadata-only Beacon receipt (never a payload — only a contentHash).
const HANDLERS = {
  // Lantern · map a use case → frameworks + gates (core: policy.evaluate)
  'framework-map'({ input }) {
    if (!input || !String(input).trim()) throw new Error('framework-map needs --input "<use case>"');
    const result = evaluate(String(input));
    const frameworks = [...new Set(result.gates.map(g => g.framework))];
    const signed = beacon.emit({
      kind: 'artifact', actor: 'agent:Lantern', action: 'framework-map',
      contentHash: beacon.sha256(String(input)),   // hash only — the use-case text is never stored
      detail: { frameworks, gateCount: result.gates.length, riskIndex: result.riskIndex, tier: result.tier },
    });
    return { result: { tier: result.tier, riskIndex: result.riskIndex, frameworks, gates: result.gates }, receipt: receiptView(signed) };
  },

  // Guardian · secret + PII scan before exposure (core: scanners.review)
  'security-privacy-review'({ input }) {
    if (!input || !String(input).trim()) throw new Error('security-privacy-review needs --input "<artifact text>"');
    const r = review(String(input));
    const result = r.clean ? 'clean' : 'blocked';   // fails closed: any finding blocks
    const signed = beacon.emit({
      kind: 'artifact', actor: 'agent:guardian', action: 'sec-review',
      contentHash: beacon.sha256(String(input)),     // hash only — the artifact text is never stored
      detail: { scans: ['secrets', 'pii', 'entropy'], result, findings: r.findings.map(f => f.type) }, // types only, never values
    });
    return { result, clean: r.clean, findings: r.findings, receipt: receiptView(signed) };
  },

  // Aperture · static accessibility audit (core: a11y.audit)
  'accessibility-audit'({ input }) {
    if (!input || !String(input).trim()) throw new Error('accessibility-audit needs --input "<html>"');
    const a = audit(String(input));
    const signed = beacon.emit({
      kind: 'artifact', actor: 'agent:aperture', action: 'a11y',
      contentHash: beacon.sha256(String(input)),
      detail: { standard: a.standard, score: a.score, findings: a.findings.map(f => f.type) },
    });
    return { result: a.pass ? 'pass' : 'fail', score: a.score, findings: a.findings, receipt: receiptView(signed) };
  },

  // Herald · compose a status summary from signed receipts (core: reports.statusReport)
  'status-report'({ input }) {
    const period = input || 'all';
    const rep = statusReport(period);
    const signed = beacon.emit({
      kind: 'artifact', actor: 'agent:herald', action: 'report',
      detail: { period, sources: rep.sources, entries: rep.entries, byAction: rep.byAction },
    });
    return { report: rep, receipt: receiptView(signed) };
  },

  // Sentinel · scan the ledger for alert-worthy signals (core: reports.monitorAlerts)
  'monitor-and-alert'() {
    const mon = monitorAlerts();
    const signed = beacon.emit({
      kind: 'model', actor: 'agent:sentinel', action: 'monitor',
      detail: { signals: mon.count, severity: mon.highest },
    });
    return { alerts: mon.alerts, count: mon.count, severity: mon.highest, receipt: receiptView(signed) };
  },

  // Beacon · sign any metadata-only evidence (core: beacon.emit)
  'beacon-sign-evidence'({ meta }) {
    if (!meta || !meta.kind || !meta.action) throw new Error('beacon-sign-evidence needs --meta \'{"kind","actor","action","contentHash"}\'');
    if (meta.payload || meta.content) throw new Error('refused: receipts are metadata-only — pass a contentHash, never a payload');
    return { receipt: receiptView(beacon.emit(meta)) };
  },

  // Operator · human-gated + irreversible (1Password/GitHub). The runner NEVER
  // executes this — it surfaces the procedure and stops at the boundary, per
  // CLAUDE.md. It emits no side effect and no receipt.
  'op-github-deploy'({ approve }) {
    return {
      ran: false,
      gated: true,
      reason: approve
        ? 'prototype never executes credential/CI operations; perform via the documented one-approval human steps in plan/skills/op-github-deploy/SKILL.md'
        : 'human gate + irreversible (1Password/GitHub) — refused to auto-run. Re-read SKILL.md and have Bob/Ken perform the human steps.',
    };
  },
};

function receiptView(signed) {
  return { kid: signed.kid, ts: signed.record.ts, action: signed.record.action, sig: signed.sig.slice(0, 12) + '…' };
}

// ── Run one skill, enforcing the declared human gate ──────────────────────────
export function runSkill(name, args = {}) {
  const skill = getSkill(name);
  if (!skill) throw new Error(`unknown skill: ${name}`);
  const run = skill.run;

  // Generic core dispatch (A1): a `run: core:<module>#<fn>` skill runs through the
  // generic invoker with declared-schema input validation — no bespoke handler.
  if (run && run.startsWith('core:')) {
    validateInput(args, skill.inputs);
    return { name, ...invokeCore(run, args, name, skill) };
  }

  // Handler dispatch: explicit `run: handler:<key>`, else legacy name->HANDLERS.
  const handlerKey = run && run.startsWith('handler:') ? run.slice('handler:'.length) : name;
  if (!(handlerKey in HANDLERS)) {
    return { name, runnable: false, note: 'prose skill — performed through the loop; no tool backend (see its SKILL.md). Add a `run:` line to make it runnable (Ticket A1).' };
  }
  // Gate enforcement: a blocking human gate (op-github-deploy in particular)
  // cannot side-effect without explicit approval.
  if (skill.gated && !args.approve && handlerKey === 'op-github-deploy') {
    return { name, ...HANDLERS[handlerKey]({ ...args, approve: false }) };
  }
  return { name, ...HANDLERS[handlerKey](args) };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
function parseArgv(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--approve') out.approve = true;
    else if (a === '--input') out.input = argv[++i];
    else if (a === '--meta') { try { out.meta = JSON.parse(argv[++i]); } catch { throw new Error('--meta must be valid JSON'); } }
    else out._.push(a);
  }
  return out;
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'list' || !cmd) {
    const skills = listSkills();
    console.log(`\nSkills (${skills.length}) — ✓ = runnable today, · = prose spec:\n`);
    for (const s of skills) {
      console.log(`  ${s.runnable ? '✓' : '·'} ${s.name.padEnd(24)} ${s.owner || ''}${s.gated ? '   [human-gated]' : ''}`);
    }
    console.log(`\n  run:  node core/scripts/run-skill.mjs run <name> [--input "..."] [--meta '{...}'] [--approve]\n`);
    return;
  }
  if (cmd === 'run') {
    const args = parseArgv(rest);
    const name = args._[0];
    if (!name) { console.error('usage: run <skill-name> [--input ...] [--meta ...] [--approve]'); process.exit(2); }
    const res = runSkill(name, args);
    console.log(JSON.stringify(res, null, 2));
    if (res.gated && res.ran === false) process.exit(3);
    return;
  }
  console.error(`unknown command: ${cmd}. Try: list | run`);
  process.exit(2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (e) { console.error('run-skill error:', e.message); process.exit(1); }
}
