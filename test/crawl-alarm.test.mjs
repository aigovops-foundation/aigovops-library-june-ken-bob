// The crawl's "I did not run" alarm, and the two things that make it reach a person.
//
// From 2026-10-30 to 2026-11-21 the scheduled estate crawl failed at its install step every
// day. That step runs before the digest exists, so no mail was sent, and red-to-ticket.yml
// deliberately did not watch the lane. 23 red days reached no one. These tests lock the fix:
//
//   - the alarm step is last, fires on failure(), and leans on nothing an earlier step made
//   - the alarm's shell really sends one mail naming the failed step (run here against stubs)
//   - red-to-ticket watches the crawl and the uptime lane
//   - the crawl jobs run on a pinned runner image

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const wf = (name) => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
const crawl = wf("estate-interaction-crawl.yml");
const NAME = "      - name: Alarm - the crawl did not run\n";

// The step's text, and its `run: |` script with the YAML indentation removed.
const stepText = crawl.slice(crawl.indexOf(NAME));
const script = stepText.slice(stepText.indexOf("        run: |\n") + "        run: |\n".length)
  .split("\n").map((l) => l.replace(/^ {10}/, "")).join("\n");

test("the alarm is the last step, and fires on failure()", () => {
  assert.equal(crawl.split(NAME).length, 2, "exactly one alarm step");
  assert.equal(stepText.split("\n      - ").length, 1, "no step follows the alarm");
  assert.match(stepText, /\n        if: \$\{\{ failure\(\) \}\}\n/);
});

test("the alarm depends on nothing an earlier step produced", () => {
  assert.doesNotMatch(stepText, /steps\./, "no step outputs or outcomes");
  assert.doesNotMatch(script, /\b(node|npm|npx)\b/, "no node, so no setup-node and no install");
  assert.doesNotMatch(script, /scripts\//, "no script from the checkout");
});

test("red pages do not fail the run, so failure() means a step broke", () => {
  const flag = crawl.slice(crawl.indexOf("      - name: Flag red pages"), crawl.indexOf(NAME));
  assert.ok(flag.length > 0, "the red-pages step exists and comes before the alarm");
  assert.doesNotMatch(flag, /exit 1/);
});

// Run the real shell against a stub curl. Records every call; answers the three endpoints.
function runAlarm({ env = {}, withFounders = true, jobs } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "crawl-alarm-"));
  const bin = join(dir, "bin");
  execFileSync("mkdir", [bin]);
  const log = join(dir, "curl.log");
  const jobsJson = join(dir, "jobs.json");
  writeFileSync(jobsJson, JSON.stringify(jobs ?? { jobs: [{ steps: [
    { name: "Run actions/checkout", conclusion: "success" },
    { name: "Install Playwright + Chromium", conclusion: "failure" },
    { name: "Alarm - the crawl did not run", conclusion: null },
  ] }] }));
  writeFileSync(join(bin, "curl"), `#!/bin/bash
printf '%s\\n' "$*" >> "${log}"
case "$*" in
  *api.github.test*) cat "${jobsJson}" ;;
  *login.microsoftonline.com*) echo '{"access_token":"stub-token"}' ;;
  *graph.microsoft.com*) printf '%s' "\${STUB_SEND_STATUS:-202}" ;;
esac
`);
  chmodSync(join(bin, "curl"), 0o755);
  if (withFounders) writeFileSync(join(dir, "founders.json"), JSON.stringify({ emails: ["a@example.test", "b@example.test"] }));
  const r = spawnSync("bash", ["-c", script], {
    cwd: dir, encoding: "utf8",
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      GRAPH_TENANT_ID: "tenant", GRAPH_CLIENT_ID: "client", GRAPH_CLIENT_SECRET: "s3cret", GRAPH_SENDER: "sender@example.test",
      GITHUB_TOKEN: "gh-token", RUN_URL: "https://github.test/org/repo/actions/runs/42",
      JOBS_API: "https://api.github.test/repos/org/repo/actions/runs/42/attempts/1/jobs",
      RUN_EVENT: "schedule", RUN_REF: "main", ...env,
    },
  });
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];
  const send = calls.find((c) => c.includes("/sendMail"));
  const payload = send ? JSON.parse(send.slice(send.indexOf("--data ") + "--data ".length)) : null;
  return { ...r, calls, payload };
}

const hasJq = spawnSync("jq", ["--version"]).status === 0;

test("the alarm sends one mail naming the failed step and the run", { skip: !hasJq && "jq not installed" }, () => {
  const r = runAlarm();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.calls.filter((c) => c.includes("/sendMail")).length, 1, "one mail");
  assert.equal(r.payload.message.subject, "Estate crawl did not run");
  assert.match(r.payload.message.body.content, /Failed step: Install Playwright \+ Chromium\n/);
  assert.match(r.payload.message.body.content, /Run: https:\/\/github\.test\/org\/repo\/actions\/runs\/42\n/);
  assert.deepEqual(r.payload.message.toRecipients.map((t) => t.emailAddress.address), ["a@example.test", "b@example.test"]);
  assert.doesNotMatch(r.stdout + r.stderr, /s3cret|stub-token/, "no secret in the log");
});

test("with no checkout it still sends, to the sender's own mailbox", { skip: !hasJq && "jq not installed" }, () => {
  const r = runAlarm({ withFounders: false });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.payload.message.toRecipients.map((t) => t.emailAddress.address), ["sender@example.test"]);
});

test("it still sends when the Actions API cannot name the step", { skip: !hasJq && "jq not installed" }, () => {
  const r = runAlarm({ jobs: { message: "Bad credentials" } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.payload.message.body.content, /Failed step: unknown/);
});

test("an alarm that could not be sent fails loudly, never quietly", { skip: !hasJq && "jq not installed" }, () => {
  const refused = runAlarm({ env: { STUB_SEND_STATUS: "403" } });
  assert.equal(refused.status, 1);
  assert.match(refused.stdout, /crawl alarm NOT sent: Graph sendMail returned 403/);
  const unset = runAlarm({ env: { GRAPH_CLIENT_SECRET: "" } });
  assert.equal(unset.status, 1);
  assert.match(unset.stdout, /crawl alarm NOT sent: the Graph secrets are not set/);
  assert.equal(unset.calls.length, 0, "nothing is called without secrets");
});

test("red-to-ticket watches the crawl and the uptime lane", () => {
  const list = wf("red-to-ticket.yml").match(/workflows: \[([^\]]*)\]/)[1].split(",").map((s) => s.trim());
  for (const name of ["estate-interaction-crawl", "estate-uptime"]) {
    assert.ok(list.includes(name), `${name} is watched`);
    assert.match(wf(`${name}.yml`), new RegExp(`^name: ${name}\\n`), "the watched name is the workflow's real name");
  }
});

test("the crawl jobs run on a pinned runner image", () => {
  for (const name of ["estate-interaction-crawl.yml", "reusable-interaction-crawl.yml"]) {
    const runsOn = [...wf(name).matchAll(/^\s+runs-on: (.+)$/gm)].map((m) => m[1]);
    assert.deepEqual(runsOn, ["ubuntu-24.04"], name);
  }
});
