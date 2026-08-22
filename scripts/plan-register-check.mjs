#!/usr/bin/env node
// plan-register-check — keep plan/MASTER-PLAN.md's register honest about the plan tree.
//
//   node scripts/plan-register-check.mjs           # check
//   node scripts/plan-register-check.mjs --list    # print the register, grouped by status
//
// WHY. The plan tree grew past two dozen documents with no index, three of which each claimed
// to be the map. The register in MASTER-PLAN.md §4 gives every document one job and one status.
// This keeps it true: a plan document added without a row fails the build, and a row naming a
// document that no longer exists fails too. An index nobody maintains is worse than no index,
// because people trust it.
//
// It reads the register table by its column header, not by position in the file, so the prose
// around it can be rewritten freely.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLAN = join(ROOT, "plan");

export const STATUSES = ["in force", "reference", "shipped", "proposal", "historical", "misfiled"];

// Pulls the rows out of the one markdown table whose header is | Document | Its one job | Status |
export function parseRegister(md) {
  const lines = md.split("\n");
  const header = lines.findIndex((l) => /^\|\s*Document\s*\|.*\|\s*Status\s*\|\s*$/i.test(l));
  if (header === -1) return { rows: [], error: "no register table found (expected a | Document | … | Status | header)" };
  if (!/^\|[\s:|-]+\|$/.test(lines[header + 1] ?? "")) return { rows: [], error: "register header is not followed by a separator row" };

  const rows = [];
  for (let i = header + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("|")) break;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length !== 3) return { rows, error: `register row ${i + 1} has ${cells.length} columns, expected 3` };
    const file = /\[`([^`]+)`\]/.exec(cells[0]) ?? /`([^`]+)`/.exec(cells[0]);
    if (!file) return { rows, error: `register row ${i + 1} names no document in backticks` };
    rows.push({ file: file[1], job: cells[1], status: cells[2].toLowerCase(), line: i + 1 });
  }
  return { rows };
}

export function check(md, files) {
  const problems = [];
  const { rows, error } = parseRegister(md);
  if (error) problems.push(error);

  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.file)) problems.push(`${r.file}: registered twice`);
    seen.add(r.file);
    if (!STATUSES.includes(r.status)) {
      problems.push(`${r.file}: status "${r.status}" is not one of ${STATUSES.map((s) => `"${s}"`).join(", ")}`);
    }
    if (!r.job) problems.push(`${r.file}: registered with no job — every document gets one job`);
    if (!files.includes(r.file)) problems.push(`${r.file}: registered but no such file in plan/`);
  }
  for (const f of files) {
    if (!seen.has(f)) problems.push(`${f}: a plan document with no row in the MASTER-PLAN register — give it one job and one status`);
  }
  return { problems, rows };
}

export const planFiles = (dir = PLAN) => readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
export const masterPlan = () => readFileSync(join(PLAN, "MASTER-PLAN.md"), "utf8");

function main(argv) {
  const files = planFiles();
  const { problems, rows } = check(masterPlan(), files);

  const byStatus = {};
  for (const r of rows) (byStatus[r.status] ??= []).push(r.file);
  console.log(`plan-register: ${files.length} document(s) in plan/ · ` +
    STATUSES.filter((s) => byStatus[s]).map((s) => `${byStatus[s].length} ${s}`).join(" · "));

  if (argv.includes("--list")) {
    for (const s of STATUSES) {
      if (!byStatus[s]) continue;
      console.log(`\n${s}:`);
      for (const f of byStatus[s]) console.log(`  ${f}`);
    }
    return 0;
  }

  // A proposal is a hold on a founder, not a backlog item. Say so out loud, every run.
  const held = byStatus["proposal"] ?? [];
  if (held.length) {
    console.log(`\n? ${held.length} proposal(s) waiting on a founder's yes, no, or "not this quarter":`);
    for (const f of held) console.log(`  - ${f}`);
  }

  if (problems.length) {
    console.error(`\n✗ ${problems.length} register problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`\n✓ every plan document has one job and one status.`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("plan-register-check.mjs")) process.exit(main(process.argv.slice(2)));
