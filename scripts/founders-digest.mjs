#!/usr/bin/env node
// founders-digest — one page, once a week: what ran, what drifted, and what waits on a human.
//
//   node scripts/founders-digest.mjs             # markdown → stdout
//   node scripts/founders-digest.mjs --json      # the same findings, structured
//   node scripts/founders-digest.mjs --waiting   # exit 1 if anything waits on a founder
//
// WHAT THIS IS NOT. It is not another estate-health report. `estate-digest.mjs` already
// reports every page hourly and `estate-exec-digest.mjs` already groups the defects by root
// cause; this links to them and takes one line of headline. Duplicating them would produce a
// second number for the same fact, which is the disease this whole programme is treating.
//
// WHAT IT ADDS is the three things no existing report covers:
//   1. DRIFT between estate.yaml and reality — a property in the manifest that nothing
//      watches, a store nobody classified, a service whose status the repo disagrees about.
//   2. WAITING ON A HUMAN — proposals, unratified policies, unanswered decisions, unrecorded
//      principles. Assembled from the files, so it cannot quietly go stale the way a
//      hand-kept list does.
//   3. THE GATES — whether the five checks that keep the estate honest are themselves green.
//
// It composes the existing checkers rather than reimplementing them: if a rule changes in
// estate-manifest, skills-check, autonomy-check or plan-register-check, this follows.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { load as loadEstate, validate as validateEstate, checkDrift } from "./estate-manifest.mjs";
import { loadSkills, loadPrinciples, loadRiskClasses, check as checkSkills } from "./skills-check.mjs";
import { loadPolicy, loadWorkflows, check as checkAutonomy } from "./autonomy-check.mjs";
import { masterPlan, planFiles, check as checkRegister, parseRegister } from "./plan-register-check.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (f) => { try { return JSON.parse(readFileSync(join(ROOT, f), "utf8")); } catch { return null; } };

// The hourly board is the heartbeat. If it has not beaten recently, that is the story.
const STALE_AFTER_HOURS = 3;

export function collectHealth(now, board = readJson("docs/estate-health.json")) {
  if (!board) return { available: false };
  const e = board.estate ?? {};
  const reporting = (board.sites ?? []).filter((s) => s.summary);
  const anyRed = reporting.some((s) => s.status === "red") || (e.redPages ?? 0) > 0;
  const generatedAt = board.generatedAt ?? null;
  const ageHours = generatedAt ? (now - Date.parse(generatedAt)) / 3.6e6 : null;
  return {
    available: true,
    overall: reporting.length === 0 ? "pending" : anyRed ? "red" : "green",
    score: e.score ?? null,
    greenPages: e.greenPages ?? 0,
    redPages: e.redPages ?? 0,
    generatedAt,
    ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
    stale: ageHours !== null && ageHours > STALE_AFTER_HOURS,
  };
}

export function collectDrift(estate) {
  const out = [];
  for (const s of estate.sites ?? []) {
    // `watched_by` is how a property says something else covers it. Without that, a
    // crawl-disabled property is genuinely unwatched — and a control that cries wolf about
    // a covered one is a control people learn to ignore.
    if (s.crawl?.enabled === false && !s.crawl?.watched_by) {
      out.push({ kind: "unwatched", what: s.id, detail: s.crawl.note || `${s.base} is in the manifest but nothing crawls it` });
    }
  }
  for (const d of estate.data_stores ?? []) {
    if (d.classification === "unknown") out.push({ kind: "unclassified", what: d.id, detail: `${d.where} — nobody has classified what is in it` });
  }
  for (const sv of estate.services ?? []) {
    if (sv.status === "unknown") out.push({ kind: "status-unknown", what: sv.id, detail: sv.risk || `${sv.host} — the repo does not agree with itself about whether this runs` });
  }
  for (const d of estate.domains ?? []) {
    if (d.owner === "unknown" || d.status === "unknown") out.push({ kind: "owner-unknown", what: d.id, detail: `status ${d.status} · owner ${d.owner}` });
  }
  return out;
}

export function collectWaiting({ estate, principles, skills, register, founders }) {
  const out = [];
  const add = (why, what, note) => out.push({ why, what, note });

  if (!estate.canonical_domain) add("decision", "D1 — canonical domain", "estate.yaml still records no canonical domain");
  if (!estate.ratified_by) add("ratify", "estate.yaml", "the manifest is a draft nobody has signed off");

  const handles = new Set(founders?.handles ?? []);
  for (const p of estate.people ?? []) {
    if ((p.roles ?? []).includes("co-founder") && !p.github) {
      add("decision", `D7 — ${p.name || p.id}'s GitHub handle`, "CODEOWNERS cannot require their review without it");
    } else if (p.github && !handles.has(p.github)) {
      add("drift", `founders.json handles`, `${p.github} is in the manifest but not in founders.json`);
    }
  }

  const unrecorded = (principles.principles ?? []).filter((p) => p.verified !== true);
  if (unrecorded.length) {
    add("paste", `${unrecorded.length} of the 11 Principles`, `${unrecorded.map((p) => p.id).join(", ")} — the manifesto has no copy in this repo`);
  }

  const unmapped = skills.filter((s) => s.fm.principle === "unknown").map((s) => s.id);
  if (unmapped.length) add("map", `${unmapped.length} skill(s) with no principle`, unmapped.join(", "));

  for (const r of register.rows.filter((r) => r.status === "proposal")) {
    add("answer", r.file, "a proposal held since June — yes, no, or not this quarter");
  }

  return out;
}

export function collectGates() {
  const gates = [];
  const run = (name, fn) => {
    try {
      const problems = fn();
      gates.push({ name, ok: problems.length === 0, detail: problems.length ? `${problems.length} problem(s)` : "green" });
    } catch (e) {
      gates.push({ name, ok: false, detail: `could not run — ${e.message}` });
    }
  };
  const estate = loadEstate();
  run("estate manifest", () => validateEstate(estate).problems.concat(checkDrift(estate)));
  run("autonomy", () => checkAutonomy(loadPolicy(), loadWorkflows()));
  run("skills", () => checkSkills(loadSkills(), loadPrinciples(), loadRiskClasses()).problems);
  run("plan register", () => checkRegister(masterPlan(), planFiles()).problems);
  return gates;
}

export function collect(now = Date.now()) {
  const estate = loadEstate();
  const principles = loadPrinciples();
  const skills = loadSkills();
  const register = { rows: parseRegister(masterPlan()).rows };
  const founders = readJson("founders.json");

  return {
    health: collectHealth(now),
    gates: collectGates(),
    drift: collectDrift(estate),
    waiting: collectWaiting({ estate, principles, skills, register, founders }),
    unknowns: {
      estate: validateEstate(estate).unknowns.length,
      principles: (principles.principles ?? []).filter((p) => p.verified !== true).length,
      skills: checkSkills(skills, principles, loadRiskClasses()).unknowns.length,
    },
    redSkills: skills.filter((s) => s.fm.risk === "red").map((s) => s.id),
  };
}

const dot = (ok) => (ok ? "🟢" : "🔴");

export function render(d, today) {
  const L = [];
  const h = d.health;

  L.push(`# The founders' digest — ${today}`);
  L.push("");
  L.push("_One page: what ran, what drifted, and what waits on you. Page-by-page health lives in the hourly digest; this is everything else._");
  L.push("");

  // 1. Did the clock run at all? A digest that cannot tell you this is decoration.
  if (!h.available) {
    L.push("## ⚪ The heartbeat has not reported");
    L.push("");
    L.push("`docs/estate-health.json` is missing. Until it is there, nothing below knows whether the estate is up.");
  } else if (h.stale) {
    L.push(`## 🔴 The heartbeat is ${h.ageHours}h old`);
    L.push("");
    L.push(`The hourly crawl last reported \`${h.generatedAt}\`. It should never be more than ${STALE_AFTER_HOURS}h behind. **A silent monitor reads exactly like a healthy estate**, so treat this as red until it beats again.`);
  } else {
    L.push(`## ${dot(h.overall === "green")} Estate health — ${h.overall.toUpperCase()}, score ${h.score ?? "–"}%`);
    L.push("");
    L.push(`${h.greenPages} pages green · ${h.redPages} red · crawled ${h.generatedAt} (${h.ageHours}h ago). Detail: the hourly digest and \`docs/estate-health.html\`.`);
  }
  L.push("");

  // 2. Are the checks that keep us honest themselves honest?
  L.push("## The gates");
  L.push("");
  L.push("| Gate | State |");
  L.push("|---|---|");
  for (const g of d.gates) L.push(`| ${g.name} | ${dot(g.ok)} ${g.detail} |`);
  L.push("");

  // 3. What waits on a human — the only real to-do list.
  L.push(`## ${d.waiting.length ? "🔴" : "🟢"} Waiting on a human — ${d.waiting.length}`);
  L.push("");
  if (!d.waiting.length) {
    L.push("Nothing. Every decision on record has an answer.");
  } else {
    L.push("| What | Why it waits |");
    L.push("|---|---|");
    for (const w of d.waiting) L.push(`| **${w.what}** | ${w.note} |`);
  }
  L.push("");

  // 4. Drift — the manifest against reality.
  L.push(`## ${d.drift.length ? "🟡" : "🟢"} Drift from \`estate.yaml\` — ${d.drift.length}`);
  L.push("");
  if (!d.drift.length) {
    L.push("The manifest and the running estate agree.");
  } else {
    for (const x of d.drift) L.push(`- **${x.what}** (${x.kind}) — ${x.detail}`);
  }
  L.push("");

  // 5. The unknown count, which is the number that should fall over time.
  L.push("## Unknowns");
  L.push("");
  L.push(`\`estate.yaml\` **${d.unknowns.estate}** · principles **${d.unknowns.principles}** unrecorded · skills **${d.unknowns.skills}**`);
  L.push("");
  L.push("_An unknown is not a failure; it is a thing we could not verify, printed rather than hidden. The number should fall. If it stops falling, that is the finding._");
  L.push("");

  if (d.redSkills.length) {
    L.push(`> **Never run unattended:** ${d.redSkills.map((s) => `\`${s}\``).join(", ")} — red-classed in \`policies/autonomy.yaml\`.`);
    L.push("");
  }

  return L.join("\n") + "\n";
}

function main(argv) {
  const d = collect();
  if (argv.includes("--json")) { console.log(JSON.stringify(d, null, 2)); return 0; }
  if (argv.includes("--waiting")) {
    for (const w of d.waiting) console.log(`${w.why}: ${w.what} — ${w.note}`);
    return d.waiting.length ? 1 : 0;
  }
  const i = argv.indexOf("--date");
  process.stdout.write(render(d, i >= 0 ? argv[i + 1] : new Date().toISOString().slice(0, 10)));
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("founders-digest.mjs")) process.exit(main(process.argv.slice(2)));
