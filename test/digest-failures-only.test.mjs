// The daily digest mails only when there is something to fix.
//
// Until 2026-11-22 it mailed every day, green or red, so that silence could not be mistaken
// for a dead crawl. The alarm step now covers a dead crawl, so a green day owes no mail. These
// tests run the workflow's own shell for the two steps that decide, and lock four rules:
//
//   - red mails, once per window
//   - green after a mailed red mails once ("back to all green"), then goes quiet
//   - green after green (or after nothing) mails nothing
//   - a state that is neither green nor red still mails

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const crawl = readFileSync(new URL("../.github/workflows/estate-interaction-crawl.yml", import.meta.url), "utf8");

function stepScript(name) {
  const at = crawl.indexOf(`      - name: ${name}`);
  assert.ok(at > 0, `step "${name}" exists`);
  const rest = crawl.slice(at);
  const body = rest.slice(rest.indexOf("        run: |\n") + "        run: |\n".length);
  const end = body.search(/\n {6}(- |# )/);
  return body.slice(0, end < 0 ? undefined : end).split("\n").map((l) => l.replace(/^ {10}/, "")).join("\n");
}

function run(script, { env = {}, file } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "digest-window-"));
  mkdirSync(join(dir, "docs"));
  if (file !== undefined) writeFileSync(join(dir, "docs/.estate-last-window"), file);
  const out = join(dir, "out");
  writeFileSync(out, "");
  const r = spawnSync("bash", ["-c", script], { cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH, GITHUB_OUTPUT: out, ...env } });
  const outputs = Object.fromEntries(readFileSync(out, "utf8").trim().split("\n").filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
  return { ...r, outputs };
}

const readStep = stepScript("Read the last window sent");
const windowStep = stepScript("Is today's founders' window still unsent? (05:00 America/Los_Angeles)");
const decide = (STATE, LAST_STATE, extra = {}) =>
  run(windowStep, { env: { EVENT: "schedule", STATE, LAST_STATE, LAST_WINDOW: "1999-01-01", ...extra } });

test("the record file carries the window and the state the mail reported", () => {
  assert.deepEqual(run(readStep, { file: "2026-11-22 red\n" }).outputs, { window: "2026-11-22", state: "red" });
  assert.deepEqual(run(readStep, { file: "2026-11-22" }).outputs, { window: "2026-11-22", state: "none" }, "a file from before this change");
  assert.deepEqual(run(readStep).outputs, { window: "none", state: "none" }, "first run, no file");
  assert.match(crawl, /printf '%s %s\\n' '\$\{\{ steps\.window\.outputs\.window \}\}' '\$\{\{ steps\.digest\.outputs\.state \}\}' > docs\/\.estate-last-window/);
});

test("a red digest is mailed", () => {
  for (const last of ["none", "green", "red"]) assert.equal(decide("red", last).outputs.send, "true", `after ${last}`);
});

test("a green day after a green mail, or after nothing, mails nothing", () => {
  assert.equal(decide("green", "green").outputs.send, "false");
  assert.equal(decide("green", "none").outputs.send, "false");
});

test("the first green after a mailed red is mailed once", () => {
  assert.equal(decide("green", "red").outputs.send, "true", "back to all green");
  assert.equal(decide("green", "green").outputs.send, "false", "and the day after is quiet");
});

test("a state that is neither green nor red is still mailed", () => {
  assert.equal(decide("", "green").outputs.send, "true");
  assert.equal(decide("pending", "none").outputs.send, "true");
});

test("one mail per window, and a manual run always sends", () => {
  const today = decide("red", "none").outputs.window;
  assert.equal(decide("red", "red", { LAST_WINDOW: today }).outputs.send, "false", "already sent today");
  assert.equal(decide("green", "green", { EVENT: "workflow_dispatch" }).outputs.send, "true");
});

test("a dead crawl is still covered, which is what makes a quiet green day safe", () => {
  assert.match(crawl, /\n      - name: Alarm - the crawl did not run\n        if: \$\{\{ failure\(\) \}\}\n/);
});
