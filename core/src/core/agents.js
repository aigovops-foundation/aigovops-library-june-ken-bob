// src/core/agents.js
// AGENT RUNTIME (Phase 2) — the named library staff, propose-only.
// An agent routes a member's intent to the skill it wields, runs that skill
// (read-only analysis → a signed receipt), and ALWAYS returns a *proposal* for
// any effectful step — it never executes an irreversible action itself. The
// conversational reply is voiced via the model router (Ollama → stub).
//
// "Agents do the bureaucracy; humans hold the meaning." Here that is literal:
// the agent assembles evidence + a proposal; a human (steward) approves at the gate.

import { runSkill as defaultRunSkill } from '../../scripts/run-skill.mjs';
import { respondAsync as defaultRespond } from './router.js';
import { propose as makeProposal } from './agent.js';

// Named staff → the skill each wields (null = conversational only for now) + the
// intents that route to them. Mirrors plan/agents.md.
export const AGENTS = {
  lantern:   { title: 'Lantern · Reading Room',   skill: 'framework-map',            match: /framework|regulation|applies|high[- ]?risk|hir(e|ing)|recruit|candidate|screen|employ|credit|biometric|chatbot|gate|gdpr|eu ai act|compliance|assess/i },
  guardian:  { title: 'Guardian · Safety',        skill: 'security-privacy-review',  match: /secret|pii|privacy|safe to (publish|share|release)|leak|sensitive|threat/i },
  aperture:  { title: 'Aperture · Accessibility', skill: 'accessibility-audit',      match: /accessib|a11y|wcag|screen[- ]?reader|contrast/i },
  herald:    { title: 'Herald · Reporting',       skill: 'status-report',            match: /status|report|what shipped|update|weekly|leadership/i },
  sentinel:  { title: 'Sentinel · Monitoring',    skill: 'monitor-and-alert',        match: /monitor|alert|health|breach|incident|observ/i },
  beacon:    { title: 'Beacon · Evidence',        skill: 'beacon-sign-evidence',     match: /sign|receipt|evidence|verifiable|ledger/i },
  concierge: { title: 'Concierge · Front Desk',   skill: null,                       match: /.*/ },   // default
};

// Pick the agent whose remit matches the intent (Concierge is the fallback).
export function route(intent) {
  const text = String(intent || '');
  for (const name of Object.keys(AGENTS)) {
    if (name === 'concierge') continue;
    if (AGENTS[name].match.test(text)) return name;
  }
  return 'concierge';
}

// Dispatch an intent to the right agent. Propose-only:
//   - runs the agent's (read-only) skill if it has one → a signed receipt;
//   - returns a PROPOSAL for any effectful action (never auto-executes);
//   - returns an agent-voiced reply.
// runSkill/respond are injectable for tests.
export async function dispatch(intent, { runSkill = defaultRunSkill, respond = defaultRespond } = {}) {
  const name = route(intent);
  const a = AGENTS[name];

  let skill = null;
  if (a.skill) {
    try { skill = { name: a.skill, result: runSkill(a.skill, { input: intent }) }; }
    catch (e) { skill = { name: a.skill, error: e.message }; }
  }

  const p = makeProposal(intent);
  const reply = (await respond({ prompt: `You are ${a.title} at the AiGovOps Library. In 1–2 sentences, help the member with: "${intent}". Propose next steps; never promise to act.` })).text;

  return {
    agent: name,
    title: a.title,
    reply,
    skill,
    proposal: { summary: p.summary, requiresHumanGate: p.requiresHumanGate, steps: p.steps },
    note: 'propose-only — a human approves any effect at the gate',
  };
}

export function listAgents() {
  return Object.entries(AGENTS).map(([name, a]) => ({ name, title: a.title, skill: a.skill }));
}
