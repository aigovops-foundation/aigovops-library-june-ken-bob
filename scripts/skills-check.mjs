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
const REQUIRED = ["name", "principle", "owner", "agent", "risk"];

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

export function check(skills, principles, riskClasses) {
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

function main(argv) {
  const skills = loadSkills();
  const principles = loadPrinciples();
  const riskClasses = loadRiskClasses();

  const byPrinciple = {};
  for (const s of skills) (byPrinciple[s.fm.principle] ??= []).push(s.id);
  const byRisk = {};
  for (const s of skills) (byRisk[s.fm.risk] ??= []).push(s.id);

  console.log(`skills-check: ${skills.length} skill(s) · ` +
    Object.entries(byRisk).map(([r, xs]) => `${xs.length} ${r}`).join(" · ") +
    ` · ${(principles.principles ?? []).filter((p) => p.verified).length}/${(principles.principles ?? []).length} principles recorded`);

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

  const { problems, unknowns } = check(skills, principles, riskClasses);

  if (unknowns.length) {
    console.log(`\n? ${unknowns.length} unknown(s) — honest gaps, not failures:`);
    for (const u of unknowns) console.log(`  - ${u}`);
  }

  if (problems.length) {
    console.error(`\n✗ ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`\n✓ every skill declares a principle, an owner, an agent and a risk class.`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("skills-check.mjs")) {
  try { process.exit(main(process.argv.slice(2))); }
  catch (e) {
    if (e instanceof ManifestError) { console.error(`✗ ${e.message}`); process.exit(1); }
    throw e;
  }
}
