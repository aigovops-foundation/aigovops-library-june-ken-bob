// Tests for scripts/plan-register-check.mjs — the guard that keeps MASTER-PLAN's register true.
//
// An index nobody maintains is worse than no index, because people trust it. So the tests here
// are mostly about the register going stale in the two ways it actually goes stale: a document
// added without a row, and a row outliving its document.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseRegister, check, planFiles, masterPlan, STATUSES } from "../scripts/plan-register-check.mjs";

const TABLE = (rows) =>
  `Some prose.\n\n| Document | Its one job | Status |\n|---|---|---|\n${rows.join("\n")}\n\nMore prose.\n`;
const ROW = (f, job = "a job", status = "in force") => `| [\`${f}\`](./${f}) | ${job} | ${status} |`;
const joined = (md, files) => check(md, files).problems.join("\n");

test("finds the register by its header, wherever it sits in the file", () => {
  const { rows, error } = parseRegister(TABLE([ROW("a.md"), ROW("b.md", "another job", "reference")]));
  assert.equal(error, undefined);
  assert.deepEqual(rows.map((r) => [r.file, r.status]), [["a.md", "in force"], ["b.md", "reference"]]);
});

test("a register that is missing or malformed is a failure, not an empty pass", () => {
  assert.match(parseRegister("# just prose\n").error, /no register table found/);
  assert.match(parseRegister("| Document | Its one job | Status |\n| a | b | c |\n").error, /not followed by a separator/);
  assert.match(parseRegister(TABLE(["| one | two |"])).error, /expected 3/);
  assert.match(parseRegister(TABLE(["| plain text | job | in force |"])).error, /names no document in backticks/);
});

test("catches a plan document nobody registered — the way it actually goes stale", () => {
  assert.match(joined(TABLE([ROW("a.md")]), ["a.md", "new-idea.md"]),
    /new-idea\.md: a plan document with no row in the MASTER-PLAN register/);
});

test("catches a row that outlived its document", () => {
  assert.match(joined(TABLE([ROW("a.md"), ROW("deleted.md")]), ["a.md"]),
    /deleted\.md: registered but no such file/);
});

test("catches a duplicate row, an unknown status, and an empty job", () => {
  assert.match(joined(TABLE([ROW("a.md"), ROW("a.md")]), ["a.md"]), /a\.md: registered twice/);
  assert.match(joined(TABLE([ROW("a.md", "job", "sort of active")]), ["a.md"]), /is not one of/);
  assert.match(joined(TABLE([ROW("a.md", "")]), ["a.md"]), /registered with no job/);
});

test("status matching is case-insensitive, so a capitalised cell still passes", () => {
  assert.deepEqual(check(TABLE([ROW("a.md", "job", "In Force")]), ["a.md"]).problems, []);
});

/* ── CODEOWNERS ───────────────────────────────────────────────────────────────── */

test("CODEOWNERS names only founders on record — a typo'd handle is a silently disabled gate", () => {
  const src = readFileSync(new URL("../CODEOWNERS", import.meta.url), "utf8");
  const named = new Set(
    src.split("\n").filter((l) => l.trim() && !l.trimStart().startsWith("#"))
       .flatMap((l) => l.match(/@[A-Za-z0-9-]+/g) ?? []).map((h) => h.slice(1)));
  const founders = new Set(JSON.parse(readFileSync(new URL("../founders.json", import.meta.url), "utf8")).handles);
  assert.ok(named.size > 0, "CODEOWNERS should name someone");
  for (const h of named) {
    assert.ok(founders.has(h), `CODEOWNERS names @${h}, who is not in founders.json — GitHub ignores unknown owners silently`);
  }
});

test("both founders are on record, so CODEOWNERS can name them", () => {
  const f = JSON.parse(readFileSync(new URL("../founders.json", import.meta.url), "utf8"));
  assert.deepEqual([...f.handles].sort(), ["bobrapp", "kenjohnston-ai"]);
  assert.equal(f.todo, undefined, "the D7 TODO was answered on 2026-08-23");
});

/* ── the committed register, against the real plan tree ───────────────────────── */

test("the committed MASTER-PLAN registers every document in plan/, and nothing else", () => {
  assert.deepEqual(check(masterPlan(), planFiles()).problems, []);
});

test("every status used in the committed register is one of the six", () => {
  for (const r of parseRegister(masterPlan()).rows) assert.ok(STATUSES.includes(r.status), `${r.file}: ${r.status}`);
});

test("MASTER-PLAN registers itself — the front door is part of the tree it indexes", () => {
  const rows = parseRegister(masterPlan()).rows;
  assert.ok(rows.some((r) => r.file === "MASTER-PLAN.md"));
});

test("the three June proposals are still marked as proposals, not quietly promoted", () => {
  const held = parseRegister(masterPlan()).rows.filter((r) => r.status === "proposal").map((r) => r.file);
  for (const f of ["jeeves-master-architecture.md", "ecosystem-agent-skill-map.md", "estate-start-here.md"]) {
    assert.ok(held.includes(f), `${f} should stay a proposal until a founder answers`);
  }
});
