// Tests for scripts/skills-check.mjs — the gate that makes `principle:` a claim CI can check.
//
// The valuable case is the one in the middle: a skill may honestly say `principle: unknown`,
// but it may NOT claim a principle whose text nobody has recorded. Doubt is allowed; an
// unverifiable claim is not. Most of these tests construct exactly that boundary.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFrontmatter, check, checkIndex, loadSkills, loadPrinciples, loadRiskClasses, loadIndex, loadDepartments } from "../scripts/skills-check.mjs";
import { ManifestError } from "../scripts/estate-manifest.mjs";

const PRINCIPLES = () => ({
  principles: [
    { id: "P1", text: "Governance belongs in the pipeline, not in a PDF.", verified: true },
    { id: "P3", text: "unknown", verified: false },
  ],
});
const RISK = ["green", "yellow", "red"];
const skill = (id, fm = {}) => ({ id, fm: { name: id, principle: "P1", owner: "bobrapp", agent: "Guardian", risk: "green", department: "governance", ...fm } });
const DEPTS = [
  { id: "governance", plugin: "p-gov", volunteer_facing: true },
  { id: "operator", plugin: "p-op", volunteer_facing: false, default_enabled: false },
];
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
  for (const f of ["principle", "owner", "agent", "risk", "department"]) {
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

/* ── third-party skills (supply chain) ────────────────────────────────────────── */

const SHA = "11d5960a326750d5838078e36cf38b85af677262";

test("a first-party skill needs no pin", () => {
  assert.deepEqual(check([skill("a")], PRINCIPLES(), RISK).problems, []);
});

test("a skill with source: must name the commit reviewed, and when", () => {
  const out = joined([skill("a", { source: "https://github.com/someone/skills" })]);
  assert.match(out, /no "pinned:"/);
  assert.match(out, /no "reviewed:"/);
});

test("a mutable pin is rejected — that is the whole point of pinning", () => {
  assert.match(joined([skill("a", { source: "https://x/y", pinned: "main", reviewed: "2026-08-22" })]),
    /is not a 40-character commit SHA/);
  assert.match(joined([skill("a", { source: "https://x/y", pinned: "11d5960", reviewed: "2026-08-22" })]),
    /is not a 40-character commit SHA/);
});

test("a review date has to be a date", () => {
  assert.match(joined([skill("a", { source: "https://x/y", pinned: SHA, reviewed: "recently" })]),
    /is not a YYYY-MM-DD date/);
});

test("a properly pinned and reviewed third-party skill passes", () => {
  assert.deepEqual(check([skill("a", { source: "https://x/y", pinned: SHA, reviewed: "2026-08-22" })],
    PRINCIPLES(), RISK).problems, []);
});

test("no third-party skill is installed today — the rule is written before it is needed", () => {
  assert.deepEqual(loadSkills().filter((s) => s.fm.source).map((s) => s.id), []);
});

/* ── the committed skills, against the committed policies ─────────────────────── */

test("every committed skill passes against the real principles and risk classes", () => {
  assert.deepEqual(check(loadSkills(), loadPrinciples(), loadRiskClasses()).problems, []);
});

test("all 17 skills are annotated — this is the guard when someone adds a skill", () => {
  // It fired on 2026-08-22 when #40 brought in estate-mailer without the governance fields,
  // and again on 2026-08-23 at 14 -> 17 when ladder row 8 added ai-house-announce,
  // sponsorship-proposal and editorial-voice. Both times it did its job. Raise the number when
  // a skill is added ON PURPOSE; never relax the per-field assertion below, which has the teeth.
  const skills = loadSkills();
  assert.equal(skills.length, 17);
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

test("a DRAFT does not make a principle claimable — the whole point of keeping them separate", () => {
  const drafted = { principles: [{ id: "P3", text: "unknown", verified: false, draft: "Some proposed wording." }] };
  const out = check([skill("a", { principle: "P3" })], drafted, RISK).problems.join("\n");
  assert.match(out, /whose text has not been recorded yet/,
    "draft wording must not satisfy a claim; only a founder-confirmed text may");
});

test("every drafted principle carries the basis it was reconstructed from", () => {
  for (const p of loadPrinciples().principles.filter((p) => p.draft)) {
    assert.ok(p.draft_basis, `${p.id} has draft wording with no stated basis`);
    assert.equal(p.verified, false, `${p.id} is a draft and must not be marked verified`);
    assert.equal(p.text, "unknown", `${p.id} is a draft; text must stay unknown until confirmed`);
  }
});

test("six principles are still unrecorded, and the file says so rather than inventing them", () => {
  const ps = loadPrinciples().principles;
  assert.equal(ps.length, 11);
  const unrecorded = ps.filter((p) => p.verified !== true);
  assert.equal(unrecorded.length, 6, "if this fails, a founder filled them in — update this test");
  for (const p of unrecorded) assert.equal(p.text, "unknown");
});

// ── the README roster ───────────────────────────────────────────────────────
// The index was stale by three skills before this check existed, which is how a reader ends up
// believing a capability is not there. Each of these is that failure, one way at a time.

const INDEX_SKILLS = [
  { id: "alpha", fm: { agent: "Scribe", risk: "green" } },
  { id: "beta",  fm: { agent: "Herald", risk: "yellow" } },
];
const INDEX_MD = [
  "| Skill | Owning agent | Risk |",
  "|---|---|---|",
  "| [`alpha`](./alpha/SKILL.md) | Scribe | green |",
  "| [`beta`](./beta/SKILL.md) | Herald | yellow |",
].join("\n");

test("a README listing exactly what is on disk passes", () => {
  assert.deepEqual(checkIndex(INDEX_MD, INDEX_SKILLS), []);
});

test("a skill on disk but missing from the README fails", () => {
  const md = INDEX_MD.split("\n").filter((l) => !l.includes("beta")).join("\n");
  assert.match(checkIndex(md, INDEX_SKILLS).join("\n"), /beta exists but is not listed/);
});

test("a README row naming a skill that does not exist fails", () => {
  assert.match(checkIndex(INDEX_MD, [INDEX_SKILLS[0]]).join("\n"), /lists beta, which has no directory/);
});

test("a row that disagrees with the skill's own agent or risk fails", () => {
  const wrongRisk = INDEX_MD.replace("| Scribe | green |", "| Scribe | red |");
  assert.match(checkIndex(wrongRisk, INDEX_SKILLS).join("\n"), /listed as risk "red" but declares "green"/);
  const wrongAgent = INDEX_MD.replace("| Scribe | green |", "| Maker | green |");
  assert.match(checkIndex(wrongAgent, INDEX_SKILLS).join("\n"), /listed under agent "Maker" but declares "Scribe"/);
});

test("a README with no table at all is a failure, not an empty pass", () => {
  assert.match(checkIndex("# Skills\n\nnothing here.", INDEX_SKILLS).join("\n"), /no skill table found/);
});

test("the committed README matches the committed skill tree", () => {
  assert.deepEqual(checkIndex(loadIndex(), loadSkills()), []);
});

/* ── departments: where a one-command install puts a skill ────────────────────── */

const withDepts = (skills) => check(skills, PRINCIPLES(), RISK, DEPTS).problems.join("\n");

test("a department that is not in the policy is caught", () => {
  assert.match(withDepts([skill("a", { department: "finance" })]),
    /department "finance" is not in policies\/departments\.yaml/);
});

test("a RED skill in a volunteer-facing department is refused — the control, not the plumbing", () => {
  // Red means "must never run unattended". A one-command install that hands a volunteer one of
  // these has moved the irreversibility boundary by omission rather than by decision.
  assert.match(withDepts([skill("danger", { risk: "red", department: "governance" })]),
    /is risk "red" but sits in department "governance", which is volunteer-facing/);
});

test("a red skill in a non-volunteer-facing department passes", () => {
  assert.deepEqual(check([skill("danger", { risk: "red", department: "operator" })],
    PRINCIPLES(), RISK, DEPTS).problems, []);
});

test("with no departments supplied the check is skipped, not silently passed as valid", () => {
  // check() is called without departments in several unit tests; that must not become a way to
  // launder an unknown department into a pass at the call site that matters.
  assert.deepEqual(check([skill("a", { department: "nonsense" })], PRINCIPLES(), RISK).problems, []);
  assert.match(withDepts([skill("a", { department: "nonsense" })]), /is not in policies/);
});

test("every committed skill's department exists, and no red one is volunteer-facing", () => {
  assert.deepEqual(check(loadSkills(), loadPrinciples(), loadRiskClasses(), loadDepartments()).problems, []);
});

test("the two red skills really are the operator department, on disk", () => {
  const red = loadSkills().filter((s) => s.fm.risk === "red");
  assert.equal(red.length, 2);
  const locked = new Set(loadDepartments().filter((d) => d.volunteer_facing === false).map((d) => d.id));
  for (const s of red) assert.ok(locked.has(s.fm.department), `${s.id} is red but in ${s.fm.department}`);
});
