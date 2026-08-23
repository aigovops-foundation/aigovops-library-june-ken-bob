#!/usr/bin/env node
// build-plugins — turn the skill tree into an installable, department-scoped marketplace.
//
//   node scripts/build-plugins.mjs           # regenerate plugins/ and .claude-plugin/
//   node scripts/build-plugins.mjs --check   # fail if the generated tree is out of date
//
// WHY IT GENERATES RATHER THAN REFERENCES (ladder row 9)
//
// A plugin can point at skills three ways, and only one of them can be checked. Measured with
// `claude plugin validate --strict` before choosing:
//
//   symlinked skills/       → "2 entries here are symlinks and were not read"
//   custom `skills:` paths  → manifest shape only. A SKILL.md with NO FRONTMATTER AT ALL passes.
//   a real skills/ dir      → every skill is read, and the same broken file FAILS.
//
// The first two would give a gate that reports green over files it never opened — the hollow
// green this estate keeps finding in its own watchers. So the tree is generated from
// plan/skills/, which stays the single source of truth, exactly as scripts/build-docs.mjs
// inlines yesgate.shared.js into docs/index.html. `--check` fails on drift, so the copy cannot
// quietly diverge from its source.
//
// THE PART THAT IS A CONTROL, NOT PLUMBING
//
// Two skills are classed `risk: red`: they must never run unattended. One install command that
// ships those to a volunteer moves the irreversibility boundary by omission. So a red skill may
// live only in a department marked `volunteer_facing: false`, that plugin installs disabled, and
// this build REFUSES to write a tree where either is untrue.

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml, ManifestError } from "./estate-manifest.mjs";
import { loadSkills } from "./skills-check.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "plugins");
const MARKET = join(ROOT, ".claude-plugin", "marketplace.json");
const VERSION = "0.1.0";

export const loadDepartments = () =>
  parseYaml(readFileSync(join(ROOT, "policies", "departments.yaml"), "utf8")).departments ?? [];

export function plan(skills, departments) {
  const problems = [];
  const byId = new Map(departments.map((d) => [d.id, d]));
  const grouped = new Map(departments.map((d) => [d.id, []]));

  for (const { id, fm } of skills) {
    const d = fm.department;
    if (!d) { problems.push(`${id}: no "department:" — every skill belongs to exactly one`); continue; }
    if (!byId.has(d)) { problems.push(`${id}: department "${d}" is not in policies/departments.yaml`); continue; }

    // THE CONTROL. A red skill in a volunteer-facing plugin is an irreversible action behind a
    // one-command install, which is the one place the boundary must never sit.
    if (fm.risk === "red" && byId.get(d).volunteer_facing !== false) {
      problems.push(`${id} is risk: red but sits in "${d}", which is volunteer-facing — a red skill may only live in a department marked volunteer_facing: false`);
    }
    grouped.get(d).push({ id, fm });
  }

  for (const d of departments) {
    if (!grouped.get(d.id).length) problems.push(`department "${d.id}" has no skills — an empty plugin is a promise nobody keeps`);
    if (d.volunteer_facing === false && d.default_enabled !== false) {
      problems.push(`department "${d.id}" is not volunteer-facing but does not set default_enabled: false — it would install ENABLED`);
    }
  }
  return { grouped, problems };
}

export function manifestFor(dept, entries) {
  return {
    name: dept.plugin,
    description: dept.description,
    version: VERSION,
    author: { name: "AiGovOps Foundation", url: "https://github.com/aigovops-foundation" },
    homepage: "https://github.com/aigovops-foundation/aigovops-library-june-ken-bob",
    license: "Apache-2.0",
    keywords: ["ai-governance", "aigovops", dept.id],
    ...(dept.default_enabled === false ? { defaultEnabled: false } : {}),
  };
}

export function marketplaceFor(departments, grouped) {
  return {
    name: "aigovops",
    owner: { name: "AiGovOps Foundation", url: "https://github.com/aigovops-foundation" },
    description: "The AiGovOps Foundation's skills, scoped by department — governed procedure a volunteer can install in one command.",
    plugins: departments.map((d) => ({
      name: d.plugin,
      source: `./plugins/${d.plugin}`,
      description: d.description,
      version: VERSION,
      category: d.id,
      tags: ["ai-governance", d.id, ...(d.volunteer_facing === false ? ["operator-only"] : [])],
      ...(d.default_enabled === false ? { defaultEnabled: false } : {}),
    })),
  };
}

const stable = (o) => JSON.stringify(o, null, 2) + "\n";

export function build(skills, departments) {
  const { grouped, problems } = plan(skills, departments);
  if (problems.length) throw new ManifestError(problems.join("\n  - "));

  const files = new Map();
  for (const d of departments) {
    files.set(join("plugins", d.plugin, ".claude-plugin", "plugin.json"),
             stable(manifestFor(d, grouped.get(d.id))));
  }
  files.set(join(".claude-plugin", "marketplace.json"), stable(marketplaceFor(departments, grouped)));
  return { files, grouped };
}

function writeTree(files, grouped, departments) {
  rmSync(OUT, { recursive: true, force: true });
  for (const [rel, body] of files) {
    const abs = join(ROOT, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  // The skills themselves — real files, so `claude plugin validate` actually reads them.
  for (const d of departments) {
    for (const { id } of grouped.get(d.id)) {
      cpSync(join(ROOT, "plan", "skills", id), join(OUT, d.plugin, "skills", id), { recursive: true });
    }
  }
  // A generated tree that reads as hand-written is a trap for the next person.
  writeFileSync(join(OUT, "README.md"),
`# \`plugins/\` — GENERATED. Do not edit by hand.

Written by \`scripts/build-plugins.mjs\` from \`plan/skills/*/SKILL.md\` (which declares each
skill's \`department:\`) and \`policies/departments.yaml\`. Edit those, then run:

    npm run plugins:build

CI runs \`--check\` and fails if this tree drifts from its source, the same way
\`estate-manifest --check\` guards the files derived from \`estate.yaml\`.

The skills are COPIES, not symlinks or path references, and that is deliberate:
\`claude plugin validate\` does not follow symlinks and only shape-checks custom \`skills:\`
paths — a SKILL.md with no frontmatter at all passes that way. Real files in a conventional
\`skills/\` directory are the only shape the validator actually reads, and a gate that reports
green over files it never opened is worse than no gate.

## Install

    /plugin marketplace add aigovops-foundation/aigovops-library-june-ken-bob
    /plugin install aigovops-governance@aigovops

\`aigovops-operator\` installs DISABLED. It holds the two \`risk: red\` skills, and the build
refuses to place a red skill anywhere else.
`);
}

function main(argv) {
  const skills = loadSkills();
  const departments = loadDepartments();
  const { files, grouped } = build(skills, departments);

  if (argv.includes("--check")) {
    const stale = [...files].filter(([rel, body]) =>
      !existsSync(join(ROOT, rel)) || readFileSync(join(ROOT, rel), "utf8") !== body);
    const missing = [];
    for (const d of departments) {
      for (const { id } of grouped.get(d.id)) {
        const copied = join(OUT, d.plugin, "skills", id, "SKILL.md");
        const source = join(ROOT, "plan", "skills", id, "SKILL.md");
        if (!existsSync(copied) || readFileSync(copied, "utf8") !== readFileSync(source, "utf8")) missing.push(`plugins/${d.plugin}/skills/${id}`);
      }
      const dir = join(OUT, d.plugin, "skills");
      const want = new Set(grouped.get(d.id).map((s) => s.id));
      for (const got of existsSync(dir) ? readdirSync(dir) : []) {
        if (!want.has(got)) missing.push(`plugins/${d.plugin}/skills/${got} (no longer in this department)`);
      }
    }
    if (stale.length || missing.length) {
      console.error(`✗ the generated plugin tree is out of date:`);
      for (const [rel] of stale) console.error(`  - ${rel}`);
      for (const m of missing) console.error(`  - ${m}`);
      console.error(`\n  Run: npm run plugins:build`);
      return 1;
    }
    console.log(`✓ the plugin tree matches plan/skills/ and policies/departments.yaml.`);
    return 0;
  }

  writeTree(files, grouped, departments);
  console.log(`build-plugins: ${departments.length} plugin(s) from ${skills.length} skill(s)`);
  for (const d of departments) {
    const red = grouped.get(d.id).filter((s) => s.fm.risk === "red").length;
    console.log(`  ${d.plugin.padEnd(24)} ${String(grouped.get(d.id).length).padStart(2)} skill(s)` +
      (d.volunteer_facing === false ? `  — NOT volunteer-facing, installs disabled${red ? `, holds ${red} red` : ""}` : ""));
  }
  console.log(`\n✓ wrote plugins/ and .claude-plugin/marketplace.json`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("build-plugins.mjs")) {
  try { process.exit(main(process.argv.slice(2))); }
  catch (e) {
    if (e instanceof ManifestError) { console.error(`✗ ${e.message}`); process.exit(1); }
    throw e;
  }
}
