// Tests for scripts/skills-check.mjs — the gate that makes `principle:` a claim CI can check.
//
// The valuable case is the one in the middle: a skill may honestly say `principle: unknown`,
// but it may NOT claim a principle whose text nobody has recorded. Doubt is allowed; an
// unverifiable claim is not. Most of these tests construct exactly that boundary.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFrontmatter, check, loadSkills, loadPrinciples, loadRiskClasses } from "../scripts/skills-check.mjs";
import { ManifestError } from "../scripts/estate-manifest.mjs";

const PRINCIPLES = () => ({
  principles: [
    { id: "P1", text: "Governance belongs in the pipeline, not in a PDF.", verified: true },
    { id: "P3", text: "unknown", verified: false },
  ],
});
const RISK = ["green", "yellow", "red"];
const skill = (id, fm = {}) => ({ id, fm: { name: id, principle: "P1", owner: "bobrapp", agent: "Guardian", risk: "green", ...fm } });
const joined = (skills, principles = PRINCIPLES()) => check(skills, principles, RISK).problems.join("\n");

/* ── frontmatter reading ──────────────────────────────────────────────────────── */

test("reads the fields it needs and ignores the procedure body", () => {
  const fm = readFrontmatter("---\nname: a\nprinciple: P1\nrisk: green\n---\n\n# a\n\nprinciple: not-a-field\n");
  assert.equal(fm.name, "a");
  assert.equal(fm.principle, "P1");
  assert.equal(fm.risk, "green");
});

test("survives a JSON-schema line in the frontmatter, which is not YAML this parser handles", () => {
  const fm = readFrontmatter('---\nname: a\ninputs: {"type":"object"}\nprinciple: P1\n---\nbody\n');
  assert.equal(fm.principle, "P1");
  assert.equal(fm.inputs, '{"type":"object"}');
});

test("a missing or unterminated fence is an error, not an empty result", () => {
  assert.throws(() => readFrontmatter("# no fence\n", "x"), ManifestError);
  assert.throws(() => readFrontmatter("---\nname: a\n", "x"), ManifestError);
});

/* ── the gate ─────────────────────────────────────────────────────────────────── */

test("a fully declared skill passes", () => {
  assert.deepEqual(check([skill("a")], PRINCIPLES(), RISK).problems, []);
});

test("every required field is required", () => {
  for (const f of ["principle", "owner", "agent", "risk"]) {
    const s = skill("a"); delete s.fm[f];
    assert.match(joined([s]), new RegExp(`missing "${f}:"`), `${f} should be required`);
  }
});

test("catches a principle that does not exist", () => {
  assert.match(joined([skill("a", { principle: "P99" })]), /claims principle "P99", which is not in/);
});

test("catches a claim against a principle whose text has not been recorded", () => {
  assert.match(joined([skill("a", { principle: "P3" })]),
    /claims "P3", whose text has not been recorded yet/);
});

test("`principle: unknown` is allowed, and is surfaced rather than swallowed", () => {
  const { problems, unknowns } = check([skill("a", { principle: "unknown" })], PRINCIPLES(), RISK);
  assert.deepEqual(problems, [], "an honest gap must not fail the build");
  assert.ok(unknowns.some((u) => /a: principle not mapped yet/.test(u)), "but it must be counted");
});

test("catches a risk class that is not in the autonomy policy", () => {
  assert.match(joined([skill("a", { risk: "amber" })]), /risk "amber" is not one of/);
});

test("catches frontmatter whose name disagrees with its directory", () => {
  assert.match(joined([skill("a", { name: "something-else" })]), /frontmatter name is "something-else"/);
});

test("unrecorded principles are counted even when no skill claims them", () => {
  const { unknowns } = check([skill("a")], PRINCIPLES(), RISK);
  assert.ok(unknowns.some((u) => /P3: text not recorded/.test(u)));
});

/* ── the committed skills, against the committed policies ─────────────────────── */

test("every committed skill passes against the real principles and risk classes", () => {
  assert.deepEqual(check(loadSkills(), loadPrinciples(), loadRiskClasses()).problems, []);
});

test("all 13 skills are annotated — this is the guard when someone adds a skill", () => {
  const skills = loadSkills();
  assert.equal(skills.length, 13);
  for (const s of skills) {
    for (const f of ["principle", "owner", "agent", "risk"]) assert.ok(s.fm[f], `${s.id} is missing ${f}`);
  }
});

test("the risk classes used by skills are exactly the autonomy policy's classes", () => {
  const classes = new Set(loadRiskClasses());
  for (const s of loadSkills()) assert.ok(classes.has(s.fm.risk), `${s.id}: ${s.fm.risk}`);
});

test("op-github-deploy stays red — it is the one skill that reaches a release path", () => {
  const s = loadSkills().find((s) => s.id === "op-github-deploy");
  assert.ok(s, "op-github-deploy must exist");
  assert.equal(s.fm.risk, "red");
});

test("six principles are still unrecorded, and the file says so rather than inventing them", () => {
  const ps = loadPrinciples().principles;
  assert.equal(ps.length, 11);
  const unrecorded = ps.filter((p) => p.verified !== true);
  assert.equal(unrecorded.length, 6, "if this fails, a founder filled them in — update this test");
  for (const p of unrecorded) assert.equal(p.text, "unknown");
});
