// Tests for the estate matrix (ladder row 11) — the lane that runs a shared check over every
// property instead of over whichever one somebody remembered to wire up.
//
// The tests that matter are about the EXCLUSIONS. A matrix that silently drops the two gated
// properties and reports success reads as complete coverage while checking six of eight, which
// is the hollow-green failure this estate keeps finding in its own watchers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { partition, buildMatrix, sitesFromManifest } from "../scripts/estate-matrix.mjs";
import { load, deriveSites } from "../scripts/estate-manifest.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const site = (base, extra = {}) => ({ name: base, base, failOnDead: true, ...extra });

/* ── what is in, what is out ──────────────────────────────────────────────────── */

test("an open property is checked", () => {
  const { included, excluded } = partition([site("https://a.example")]);
  assert.equal(included.length, 1);
  assert.deepEqual(excluded, []);
});

test("a gated property is excluded, and carries the reason", () => {
  const { included, excluded } = partition([site("https://g.example", { gated: true })]);
  assert.deepEqual(included, []);
  assert.equal(excluded.length, 1);
  assert.match(excluded[0].why, /sign-in wall/);
});

test("a property needing a cookie is excluded, and says the credential is Red", () => {
  const { excluded } = partition([site("https://c.example", { cookie: "session=…" })]);
  assert.match(excluded[0].why, /credential a founder mints \(Red\)/);
});

test("every excluded property is NAMED — silence about a gap is the failure mode", () => {
  const { excluded } = partition([
    site("https://a.example"),
    site("https://g.example", { gated: true }),
    site("https://c.example", { cookie: "session=…" }),
  ]);
  assert.deepEqual(excluded.map((e) => e.base).sort(), ["https://c.example", "https://g.example"]);
  for (const e of excluded) assert.ok(e.why?.length > 10, `${e.base} was dropped with no reason`);
});

test("nothing is both included and excluded, and nothing is lost between them", () => {
  const all = [site("https://a.example"), site("https://b.example", { gated: true }), site("https://c.example")];
  const { included, excluded } = partition(all);
  assert.equal(included.length + excluded.length, all.length);
});

/* ── the matrix a workflow consumes ───────────────────────────────────────────── */

test("the matrix shape is what fromJSON + strategy.matrix expects", () => {
  const { matrix } = buildMatrix([site("https://a.example")]);
  assert.ok(Array.isArray(matrix.include));
  for (const k of ["name", "site_url", "max_pages", "fail_on_external"]) {
    assert.ok(k in matrix.include[0], `matrix rows need ${k}`);
  }
});

test("the real manifest yields a non-empty matrix", () => {
  const { matrix } = buildMatrix(sitesFromManifest());
  assert.ok(matrix.include.length >= 6, "six ungated properties were present when this was written");
});

test("every ungated property in the committed manifest is in the matrix — coverage is derived", () => {
  const sites = deriveSites(load());
  const open = sites.filter((s) => !s.gated && !s.cookie).map((s) => s.base).sort();
  const inMatrix = buildMatrix(sites).matrix.include.map((r) => r.site_url).sort();
  assert.deepEqual(inMatrix, open,
    "a property added to estate.yaml must be checked without anyone editing a second list");
});

test("no gated property leaks into the matrix, where it would fail on the sign-in wall", () => {
  const sites = deriveSites(load());
  const gated = new Set(sites.filter((s) => s.gated || s.cookie).map((s) => s.base));
  for (const row of buildMatrix(sites).matrix.include) {
    assert.ok(!gated.has(row.site_url), `${row.site_url} is gated and must not be checked anonymously`);
  }
});

test("no cookie value can reach the matrix — it is a credential, and matrices are printed in logs", () => {
  const sites = deriveSites(load());
  const json = JSON.stringify(buildMatrix(sites).matrix);
  for (const s of sites.filter((s) => s.cookie)) {
    assert.ok(!json.includes(s.cookie), "a cookie in a matrix row is a credential in a public build log");
  }
  assert.ok(!/cookie/i.test(json));
});

/* ── the wiring, so this cannot become shelfware ──────────────────────────────── */

const LINK_CHECK = () => readFileSync(join(ROOT, ".github", "workflows", "link-check.yml"), "utf8");

test("the weekly lane builds its matrix from the manifest, not from a hand-written list", () => {
  const wf = LINK_CHECK();
  assert.match(wf, /estate-matrix\.mjs --json/, "the matrix must be derived");
  assert.match(wf, /fromJSON\(needs\.properties\.outputs\.matrix\)/);
  assert.doesNotMatch(wf, /site_url: "https/, "a hard-coded site_url is the thing row 11 removes");
});

test("one rotted property does not cancel the checks on the others", () => {
  assert.match(LINK_CHECK(), /fail-fast: false/);
});

test("the readable listing runs too, so a weekly log says what was skipped", () => {
  assert.match(LINK_CHECK(), /run: node scripts\/estate-matrix\.mjs\n/);
});

test("it still calls the shared reusable rather than a private copy", () => {
  assert.match(LINK_CHECK(), /uses: \.\/\.github\/workflows\/reusable-link-check\.yml/);
});

test("the five repo-scoped reusables are still un-matrixed, and the workflow says why", () => {
  // This is the half of row 11 that did NOT ship. If someone later adds a `repository:` input
  // and matrixes them, this test failing is the prompt to update the note rather than leave a
  // stale explanation of a limit that no longer exists.
  const dir = join(ROOT, ".github", "workflows");
  const repoScoped = ["reusable-secret-scan.yml", "reusable-repo-sync-check.yml",
                      "reusable-stale-sweep.yml", "reusable-red-main-watchdog.yml",
                      "reusable-dependency-triage.yml"];
  for (const f of repoScoped) {
    const src = readFileSync(join(dir, f), "utf8");
    assert.doesNotMatch(src, /^\s+repository:/m, `${f} gained a repository: input — row 11a may be done; update the note in link-check.yml`);
  }
  assert.match(LINK_CHECK(), /row 11a/, "the workflow must name what is still not covered");
});
