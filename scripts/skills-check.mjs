#!/usr/bin/env node
// skills-check — every skill declares which principle it implements, who owns it, and how far
// it may run alone. This checks the claim.
//
//   node scripts/skills-check.mjs           # check
//   node scripts/skills-check.mjs --list    # the roster, grouped by principle
//
// WHY. The manifesto reads as a specification, not a mission statement. `principle:` in a
// skill's frontmatter makes that literal: the build tests each skill's claim against
// policies/principles.yaml. Nobody else in AI governance can currently say their manifesto is
// executable, and it costs one line per file.
//
// WHAT FAILS THE BUILD
//   - a skill with no `principle:`, `owner:`, `agent:` or `risk:` field
//   - a skill claiming a principle id that does not exist in policies/principles.yaml
//   - a skill claiming a principle whose text has NOT been recorded yet (`verified: false`) —
//     a claim against an unknown principle is unverifiable by definition
//   - a `risk:` that is not one of the classes in policies/autonomy.yaml
//
// WHAT DOES NOT FAIL THE BUILD
//   - `principle: unknown` — an honest "we have not mapped this one yet". Counted and printed
//     on every run, like estate.yaml's unverified rows. Silence is what we refuse, not doubt.
//
// A skill classed `risk: red` is one that must never run unattended; the class exists so that
// fact is declared where the skill lives rather than remembered.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseYaml, ManifestError } from "./estate-manifest.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS = join(ROOT, "plan", "skills");
const REQUIRED = ["name", "principle", "owner", "agent", "risk", "department"];
// A skill carrying `source:` came from outside this repo. It is a dependency, and its prose is
// read as adversarial input: 84.2% of the vulnerabilities found across the 98,380-skill study
// lived in documentation, not code. So it names the exact commit reviewed, and when.
// Rule of record: plan/processes/supply-chain.md
const THIRD_PARTY_REQUIRED = ["pinned", "reviewed"];

// Frontmatter only — the procedure body is prose and is not parsed. Values are read as plain
// strings so a JSON-schema line (inputs:/outputs:) never reaches the YAML subset parser.
export function readFrontmatter(src, label = "SKILL.md") {
  if (!src.startsWith("---\n")) throw new ManifestError(`${label}: no frontmatter fence`);
  const end = src.indexOf("\n---\n", 4);
  if (end === -1) throw new ManifestError(`${label}: unterminated frontmatter`);
  const out = {};
  for (const line of src.slice(4, end + 1).split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!m) continue;                       // continuation of a wrapped value — not a field
    out[m[1]] = m[2].trim();
  }
  return out;
}

export function check(skills, principles, riskClasses, departments = []) {
  const problems = [];
  const unknowns = [];
  const known = new Map((principles.principles ?? []).map((p) => [p.id, p]));

  if (!known.size) problems.push("policies/principles.yaml declares no principles");

  for (const { id, fm } of skills) {
    for (const f of REQUIRED) {
      if (!fm[f]) problems.push(`${id}: missing "${f}:" in frontmatter`);
    }
    if (fm.name && fm.name !== id) problems.push(`${id}: frontmatter name is "${fm.name}"`);

    if (fm.risk && !riskClasses.includes(fm.risk)) {
      problems.push(`${id}: risk "${fm.risk}" is not one of ${riskClasses.join(", ")}`);
    }

    // `department:` decides which plugin a volunteer's one-command install puts this skill in,
    // so it is checked here rather than only at build time — and a RED skill in a
    // volunteer-facing department is the irreversibility boundary sitting behind a default.
    if (fm.department && departments.length) {
      const d = departments.find((x) => x.id === fm.department);
      if (!d) {
        problems.push(`${id}: department "${fm.department}" is not in policies/departments.yaml`);
      } else if (fm.risk === "red" && d.volunteer_facing !== false) {
        problems.push(`${id}: is risk "red" but sits in department "${d.id}", which is volunteer-facing — one install command would hand an irreversible action to a volunteer`);
      }
    }

    if (fm.source) {
      for (const f of THIRD_PARTY_REQUIRED) {
        if (!fm[f]) problems.push(`${id}: has "source: ${fm.source}" but no "${f}:" — a third-party skill is a dependency and must name the commit that was reviewed, and when`);
      }
      if (fm.pinned && !/^[0-9a-f]{40}$/.test(fm.pinned)) {
        problems.push(`${id}: "pinned: ${fm.pinned}" is not a 40-character commit SHA — a mutable ref can be re-pointed under us`);
      }
      if (fm.reviewed && !/^\d{4}-\d{2}-\d{2}$/.test(fm.reviewed)) {
        problems.push(`${id}: "reviewed: ${fm.reviewed}" is not a YYYY-MM-DD date`);
      }
    }

    const p = fm.principle;
    if (!p) continue;
    if (p === "unknown") { unknowns.push(`${id}: principle not mapped yet`); continue; }
    const rec = known.get(p);
    if (!rec) { problems.push(`${id}: claims principle "${p}", which is not in policies/principles.yaml`); continue; }
    if (rec.verified !== true || rec.text === "unknown") {
      problems.push(`${id}: claims "${p}", whose text has not been recorded yet — a claim against an unknown principle cannot be checked`);
    }
  }

  for (const [pid, rec] of known) {
    if (rec.verified !== true) unknowns.push(`${pid}: text not recorded`);
  }
  return { problems, unknowns };
}

// The roster in plan/skills/README.md is an index, and an index nobody maintains is worse than
// no index because people trust it. It was stale by three skills — estate-health, estate-mailer
// and op-github-deploy had been added and never listed — which is exactly how a reader ends up
// believing a capability does not exist. So the table is checked against the directory, and
// against each skill's own declared agent and risk, rather than being kept in step by hand.
export function checkIndex(md, skills) {
  const problems = [];
  const rows = new Map();
  for (const line of md.split("\n")) {
    const m = /^\|\s*\[`([^`]+)`\]\([^)]*\)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/.exec(line);
    if (m) rows.set(m[1], { agent: m[2], risk: m[3] });
  }
  if (!rows.size) return ["plan/skills/README.md: no skill table found — expected rows of | [`name`](./name/SKILL.md) | agent | risk |"];

  for (const { id, fm } of skills) {
    const row = rows.get(id);
    if (!row) { problems.push(`plan/skills/README.md: ${id} exists but is not listed`); continue; }
    if (fm.agent && row.agent !== fm.agent) problems.push(`plan/skills/README.md: ${id} is listed under agent "${row.agent}" but declares "${fm.agent}"`);
    if (fm.risk && row.risk !== fm.risk) problems.push(`plan/skills/README.md: ${id} is listed as risk "${row.risk}" but declares "${fm.risk}"`);
  }
  const have = new Set(skills.map((s) => s.id));
  for (const id of rows.keys()) {
    if (!have.has(id)) problems.push(`plan/skills/README.md: lists ${id}, which has no directory`);
  }
  return problems;
}

export const loadIndex = () => readFileSync(join(SKILLS, "README.md"), "utf8");

export function loadSkills(dir = SKILLS) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name).sort()
    .filter((id) => existsSync(join(dir, id, "SKILL.md")))
    .map((id) => ({ id, fm: readFrontmatter(readFileSync(join(dir, id, "SKILL.md"), "utf8"), id) }));
}

export const loadPrinciples = () => parseYaml(readFileSync(join(ROOT, "policies", "principles.yaml"), "utf8"));
export const loadRiskClasses = () =>
  (parseYaml(readFileSync(join(ROOT, "policies", "autonomy.yaml"), "utf8")).classes ?? []).map((c) => c.id);
export const loadDepartments = () =>
  parseYaml(readFileSync(join(ROOT, "policies", "departments.yaml"), "utf8")).departments ?? [];

function main(argv) {
  const skills = loadSkills();
  const principles = loadPrinciples();
  const riskClasses = loadRiskClasses();
  const departments = loadDepartments();
  const indexProblems = checkIndex(loadIndex(), skills);

  const byPrinciple = {};
  for (const s of skills) (byPrinciple[s.fm.principle] ??= []).push(s.id);
  const byRisk = {};
  for (const s of skills) (byRisk[s.fm.risk] ??= []).push(s.id);

  console.log(`skills-check: ${skills.length} skill(s) · ` +
    Object.entries(byRisk).map(([r, xs]) => `${xs.length} ${r}`).join(" · ") +
    ` · ${(principles.principles ?? []).filter((p) => p.verified).length}/${(principles.principles ?? []).length} principles recorded` +
    ` · ${new Set(skills.map((s) => s.fm.department)).size} department(s)`);

  if (argv.includes("--list")) {
    for (const [p, xs] of Object.entries(byPrinciple).sort()) {
      const rec = (principles.principles ?? []).find((x) => x.id === p);
      console.log(`\n${p}${rec?.text && rec.text !== "unknown" ? ` — ${rec.text}` : ""}`);
      for (const x of xs) console.log(`  ${x}`);
    }
    return 0;
  }

  // A red-classed skill is the one thing worth restating out loud on every run.
  for (const s of skills.filter((s) => s.fm.risk === "red")) {
    console.log(`\n! ${s.id} is classed red — it must never run unattended.`);
  }

  const { problems: skillProblems, unknowns } = check(skills, principles, riskClasses, departments);
  const problems = [...skillProblems, ...indexProblems];

  if (unknowns.length) {
    console.log(`\n? ${unknowns.length} unknown(s) — honest gaps, not failures:`);
    for (const u of unknowns) console.log(`  - ${u}`);
  }

  if (problems.length) {
    console.error(`\n✗ ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`\n✓ every skill declares a principle, an owner, an agent, a risk class and a department; the README lists exactly what is on disk; and no red skill sits in a volunteer-facing plugin.`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("skills-check.mjs")) {
  try { process.exit(main(process.argv.slice(2))); }
  catch (e) {
    if (e instanceof ManifestError) { console.error(`✗ ${e.message}`); process.exit(1); }
    throw e;
  }
}
