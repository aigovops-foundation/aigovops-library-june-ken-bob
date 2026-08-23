// Tests for the department-scoped marketplace (ladder row 9).
//
// The one that matters: a `risk: red` skill must never reach a volunteer-facing plugin. Red
// means "must never run unattended", and a one-command install that hands a volunteer two of
// them has moved the irreversibility boundary by omission rather than by decision. Everything
// else here is drift-prevention around that.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { plan, build, manifestFor, marketplaceFor, loadDepartments } from "../scripts/build-plugins.mjs";
import { loadSkills } from "../scripts/skills-check.mjs";
import { ManifestError } from "../scripts/estate-manifest.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const DEPTS = [
  { id: "open", plugin: "p-open", volunteer_facing: true, description: "d" },
  { id: "locked", plugin: "p-locked", volunteer_facing: false, default_enabled: false, description: "d" },
];
const sk = (id, fm = {}) => ({ id, fm: { name: id, risk: "green", department: "open", ...fm } });

/* ── the control ──────────────────────────────────────────────────────────────── */

test("a red skill in a volunteer-facing department is refused", () => {
  const { problems } = plan([sk("danger", { risk: "red" })], DEPTS);
  assert.match(problems.join("\n"), /is risk: red but sits in "open", which is volunteer-facing/);
});

test("a red skill in a non-volunteer-facing department is fine", () => {
  const { problems } = plan([sk("danger", { risk: "red", department: "locked" }), sk("safe")], DEPTS);
  assert.deepEqual(problems, []);
});

test("a non-volunteer-facing department that would install ENABLED is refused", () => {
  const bad = [DEPTS[0], { ...DEPTS[1], default_enabled: true }];
  const { problems } = plan([sk("safe"), sk("danger", { risk: "red", department: "locked" })], bad);
  assert.match(problems.join("\n"), /does not set default_enabled: false — it would install ENABLED/);
});

test("build() throws rather than writing a tree that breaks the rule", () => {
  assert.throws(() => build([sk("danger", { risk: "red" })], DEPTS), ManifestError);
});

/* ── every skill lands somewhere, exactly once ────────────────────────────────── */

test("a skill with no department is refused", () => {
  const s = sk("x"); delete s.fm.department;
  assert.match(plan([s], DEPTS).problems.join("\n"), /no "department:"/);
});

test("a skill naming a department that does not exist is refused", () => {
  assert.match(plan([sk("x", { department: "finance" })], DEPTS).problems.join("\n"),
    /department "finance" is not in policies\/departments\.yaml/);
});

test("an empty department is refused — an empty plugin is a promise nobody keeps", () => {
  const { problems } = plan([sk("only")], DEPTS);
  assert.match(problems.join("\n"), /department "locked" has no skills/);
});

/* ── the manifests, against the documented schema ─────────────────────────────── */

test("a plugin manifest carries the fields the schema requires", () => {
  const m = manifestFor(DEPTS[0], [sk("a")]);
  assert.equal(m.name, "p-open");
  for (const k of ["description", "version", "author", "license"]) assert.ok(m[k], `missing ${k}`);
  assert.equal(m.author.name, "AiGovOps Foundation");
  assert.equal(m.defaultEnabled, undefined, "a volunteer-facing plugin must not be born disabled");
});

test("the locked plugin's manifest says defaultEnabled: false", () => {
  assert.equal(manifestFor(DEPTS[1], [sk("d", { department: "locked" })]).defaultEnabled, false);
});

test("the marketplace has name, owner and plugins, and every source is a local path", () => {
  const m = marketplaceFor(DEPTS, new Map());
  assert.equal(m.name, "aigovops");
  assert.ok(m.owner?.name);
  assert.equal(m.plugins.length, 2);
  for (const p of m.plugins) {
    assert.ok(p.name && p.source, "name and source are the two required plugin fields");
    assert.match(p.source, /^\.\/plugins\//, "a remote source would install code this repo does not review");
  }
});

test("the operator plugin is tagged so it is obvious in a listing", () => {
  const m = marketplaceFor(DEPTS, new Map());
  assert.ok(m.plugins.find((p) => p.name === "p-locked").tags.includes("operator-only"));
});

/* ── the committed tree, against the committed sources ────────────────────────── */

const market = () => JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "marketplace.json"), "utf8"));

test("the committed marketplace lists every department and nothing else", () => {
  assert.deepEqual(market().plugins.map((p) => p.name).sort(),
                   loadDepartments().map((d) => d.plugin).sort());
});

test("every generated plugin holds REAL skill files, not symlinks or path references", () => {
  // Measured with `claude plugin validate --strict`: symlinks are "not read", and custom
  // `skills:` paths are shape-checked only — a SKILL.md with no frontmatter passes that way.
  // Real files in a conventional skills/ directory are the only shape the validator opens.
  const { grouped } = build(loadSkills(), loadDepartments());
  for (const d of loadDepartments()) {
    for (const { id } of grouped.get(d.id)) {
      const copied = join(ROOT, "plugins", d.plugin, "skills", id, "SKILL.md");
      assert.ok(existsSync(copied), `${copied} is missing — run npm run plugins:build`);
      assert.equal(readFileSync(copied, "utf8"),
                   readFileSync(join(ROOT, "plan", "skills", id, "SKILL.md"), "utf8"),
                   `${id} has drifted from its source`);
    }
  }
});

test("no plugin manifest declares a custom skills: path", () => {
  for (const d of loadDepartments()) {
    const m = JSON.parse(readFileSync(join(ROOT, "plugins", d.plugin, ".claude-plugin", "plugin.json"), "utf8"));
    assert.equal(m.skills, undefined,
      "a custom skills: path is validated for shape only — the convention directory is the checkable one");
  }
});

test("the two red skills are in the operator plugin and nowhere else", () => {
  const { grouped } = build(loadSkills(), loadDepartments());
  const red = loadSkills().filter((s) => s.fm.risk === "red").map((s) => s.id);
  assert.ok(red.length >= 2, "two red skills were present when this was written");
  for (const d of loadDepartments()) {
    const here = grouped.get(d.id).filter((s) => s.fm.risk === "red").map((s) => s.id);
    if (d.volunteer_facing === false) assert.deepEqual(here.sort(), red.sort());
    else assert.deepEqual(here, [], `${d.plugin} must hold no red skill`);
  }
});

test("the operator plugin installs disabled in BOTH manifests — either alone would be enough to miss", () => {
  const d = loadDepartments().find((x) => x.volunteer_facing === false);
  const p = JSON.parse(readFileSync(join(ROOT, "plugins", d.plugin, ".claude-plugin", "plugin.json"), "utf8"));
  assert.equal(p.defaultEnabled, false);
  assert.equal(market().plugins.find((x) => x.name === d.plugin).defaultEnabled, false);
});
