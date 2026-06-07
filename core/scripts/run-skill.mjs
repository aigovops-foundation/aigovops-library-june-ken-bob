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
const SKILLS_DIR = path.resolve(__dirname, '..', '..', 'plan', 'skills');

// Keep keys/ledger inside core/ regardless of the caller's CWD (tests override
// these BEFORE importing this module). beacon freezes KEYS_DIR at import time, so
// the defaults must be set before the dynamic import below.
if (!process.env.KEYS_DIR) process.env.KEYS_DIR = path.resolve(__dirname, '..', 'keys');
if (!process.env.LEDGER_DIR) process.env.LEDGER_DIR = path.resolve(__dirname, '..', 'ledger');

const beacon = await import('../src/core/beacon.js');
const { evaluate } = await import('../src/core/policy.js');
const { review } = await import('../src/core/scanners.js');

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
  return { name, owner, humanGate, sectionGated };
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
      return { ...meta, name, dir: d.name, gated, runnable: name in HANDLERS };
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
  if (!(name in HANDLERS)) {
    return { name, runnable: false, note: 'prose skill — no executable backend yet; see its SKILL.md. Wire a real tool/command to make it runnable (see Ticket A1).' };
  }
  // Gate enforcement: a skill with a blocking human gate (and op-github-deploy in
  // particular) cannot side-effect without explicit approval.
  if (skill.gated && !args.approve && name === 'op-github-deploy') {
    return { name, ...HANDLERS[name]({ ...args, approve: false }) };
  }
  return { name, ...HANDLERS[name](args) };
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
