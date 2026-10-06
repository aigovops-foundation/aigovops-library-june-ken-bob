// Tests for scripts/estate-exec-digest.mjs — the executive page Bob and Ken actually open.
//
// The contract under test: a SUGGESTED FIX IS AN OFFER TO ACT, so only red items get one.
// The page used to print "Suggested fix" and "Say the word and it ships as a PR" on every card,
// including the ones under "Probably not real" — offering to open a PR against findings it had
// just explained were a checker artefact. The markdown mail was already red-only; the HTML was
// not. These tests lock the two halves of that: red keeps the block, non-red loses it.
//
// Driven as a subprocess against a fixture rather than by importing the module. The script is
// straight-line top-level code — it reads the board and writes the page at import time — so
// importing it to reach `card` would read docs/estate-health.json and write into docs/ as a side
// effect of running the suite. The subprocess also exercises the real end-to-end render, which is
// what the reader sees.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts", "estate-exec-digest.mjs");

// One property carrying one of each severity the generator can actually produce:
//   red   — a missing anchor target (the /anchor "(#...)" has no matching target/ producer)
//   note  — a .pdf reported as a page load error (the "downloadable files" producer)
// There is no amber producer in the generator today, so amber cannot be fabricated from a
// fixture; the gate is `severity === 'red'`, so amber and green are covered by construction.
const BOARD = {
  generatedAt: "2026-10-05T23:14:00Z",
  estate: { score: 90, greenPages: 40, redPages: 1 },
  sites: [{
    name: "Fixture Property",
    summary: { greenPages: 40, dead: 2, broken: 0 },
    dead: [
      { tag: "a", text: "Jump", page: "https://example.test/one.html",
        reason: 'anchor "#missing-target" has no matching target' },
      { tag: "a", text: "Jump", page: "https://example.test/two.html",
        reason: 'anchor "#missing-target" has no matching target' },
    ],
    broken: [],
    pageHealth: [{ url: "https://example.test/policy.pdf", status: "load error" }],
  }],
};

function render() {
  const dir = mkdtempSync(join(tmpdir(), "exec-digest-"));
  const inPath = join(dir, "board.json");
  const htmlPath = join(dir, "out.html");
  writeFileSync(inPath, JSON.stringify(BOARD));
  execFileSync("node", [SCRIPT, "--in", inPath, "--html", htmlPath,
    "--markdown", join(dir, "out.md"), "--pdf", join(dir, "out.pdf")],
    { cwd: ROOT, stdio: "ignore" });
  return readFileSync(htmlPath, "utf8");
}

// Slice the page into one <article> per card so a match cannot leak across cards.
const cards = (html) => html.split('<article class="issue ').slice(1).map((c) => c.split("</article>")[0]);
const bySeverity = (html, sev) => cards(html).filter((c) => c.startsWith(sev));

test("the fixture produces both a red and a note card, or the rest proves nothing", () => {
  const html = render();
  assert.equal(bySeverity(html, "red").length, 1, "expected exactly one red card");
  assert.equal(bySeverity(html, "note").length, 1, "expected exactly one note card");
});

test("a RED card keeps the suggested-fix block and the ships-as-a-PR offer", () => {
  const [red] = bySeverity(render(), "red");
  assert.match(red, /<div class="fix">/);
  assert.match(red, /Suggested fix/);
  assert.match(red, /ships as a PR/);
});

test("a NOTE card has no suggested fix and no offer to ship a PR", () => {
  const [note] = bySeverity(render(), "note");
  assert.doesNotMatch(note, /<div class="fix">/);
  assert.doesNotMatch(note, /Suggested fix/);
  assert.doesNotMatch(note, /ships as a PR/);
  assert.doesNotMatch(note, /Needs a human decision first/);
});

test("a NOTE card still carries its title, location and plain description", () => {
  const [note] = bySeverity(render(), "note");
  assert.match(note, /downloadable files counted as broken pages/);   // title
  assert.match(note, /<p class="where">Fixture Property<\/p>/);        // location
  assert.match(note, /<p class="plain">/);                             // description
});

test("the whole page offers to ship a PR exactly as often as it has red cards", () => {
  const html = render();
  const offers = (html.match(/ships as a PR/g) || []).length;
  assert.equal(offers, bySeverity(html, "red").length);
});

test("green stays a plain list — no card, no fix block", () => {
  const html = render();
  assert.match(html, /<h2>What is green<\/h2>/);
  const green = html.split("<h2>What is green</h2>")[1];
  assert.doesNotMatch(green, /<div class="fix">/);
});
