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
      RUN_EVENT: "schedule", RUN_REF: "main", RUN_FULL_REF: "refs/heads/main", ...env,
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

test("red-to-ticket watches the crawl", () => {
  const list = wf("red-to-ticket.yml").match(/workflows: \[([^\]]*)\]/)[1].split(",").map((s) => s.trim());
  assert.ok(list.includes("estate-interaction-crawl"), "the crawl is watched");
  assert.match(crawl, /^name: estate-interaction-crawl\n/, "the watched name is the workflow's real name");
});

// The ticket lane closes a ticket on the next green run. estate-uptime is green on every poll
// of an outage after the first, so watching it would close the ticket while the service was
// still down. If uptime ever fails on "anything down", this test should be revisited, not deleted.
test("red-to-ticket does not watch estate-uptime while its green does not mean healthy", () => {
  const list = wf("red-to-ticket.yml").match(/workflows: \[([^\]]*)\]/)[1].split(",").map((s) => s.trim());
  const uptime = readFileSync(new URL("../scripts/estate-uptime.mjs", import.meta.url), "utf8");
  const redOnlyOnNewOutage = /return prev \? \(newlyDown \? 1 : 0\)/.test(uptime);
  assert.ok(redOnlyOnNewOutage, "estate-uptime's exit rule changed: re-decide whether the ticket lane can watch it");
  assert.ok(!list.includes("estate-uptime"), "estate-uptime is not watched");
});

test("a failure AFTER the digest was sent does not claim the crawl did not run", { skip: !hasJq && "jq not installed" }, () => {
  const r = runAlarm({ jobs: { jobs: [{ steps: [
    { name: "Email the digest to the founders (05:00 Pacific, once a day)", conclusion: "success" },
    { name: "Record the window as sent", conclusion: "failure" },
  ] }] } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.payload.message.subject, "Estate crawl finished with errors");
  assert.match(r.payload.message.body.content, /today's digest was sent/);
  assert.match(r.payload.message.body.content, /Failed step: Record the window as sent\n/);
  assert.match(crawl, /\n      - name: Email the digest to the founders/, "the step name the alarm looks for still exists");
});

test("a digest step that failed or was skipped is still 'did not run'", { skip: !hasJq && "jq not installed" }, () => {
  for (const conclusion of ["failure", "skipped", null]) {
    const r = runAlarm({ jobs: { jobs: [{ steps: [
      { name: "Crawl the estate", conclusion: "failure" },
      { name: "Email the digest to the founders (05:00 Pacific, once a day)", conclusion },
    ] }] } });
    assert.equal(r.payload.message.subject, "Estate crawl did not run", String(conclusion));
  }
});

test("the crawl jobs run on a pinned runner image", () => {
  for (const name of ["estate-interaction-crawl.yml", "reusable-interaction-crawl.yml"]) {
    const runsOn = [...wf(name).matchAll(/^\s+runs-on: (.+)$/gm)].map((m) => m[1]);
    assert.deepEqual(runsOn, ["ubuntu-24.04"], name);
  }
});

// On 2026-11-22 a deliberate-failure proof run on a throwaway branch mailed the founders
// "ALARM PROOF - deliberate failure, please ignore". A test should never reach an inbox.
test("a run off the default branch sends nothing, and says so", { skip: !hasJq && "jq not installed" }, () => {
  const r = runAlarm({ env: { RUN_REF: "proof/alarm-test", RUN_FULL_REF: "refs/heads/proof/alarm-test", RUN_EVENT: "workflow_dispatch" } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.calls.length, 0, "no token request, no mail, no API call");
  assert.match(r.stdout, /crawl alarm not sent: this run is on 'proof\/alarm-test', not 'main'/);
  const tag = runAlarm({ env: { RUN_REF: "main", RUN_FULL_REF: "refs/tags/main" } });
  assert.equal(tag.calls.length, 0, "a tag named like the default branch is not the default branch");
  const renamed = runAlarm({ env: { RUN_REF: "trunk", RUN_FULL_REF: "refs/heads/trunk", DEFAULT_BRANCH: "trunk" } });
  assert.equal(renamed.calls.filter((c) => c.includes("/sendMail")).length, 1, "the default branch still mails, whatever it is called");
  assert.match(stepText, /DEFAULT_BRANCH: \$\{\{ github\.event\.repository\.default_branch \}\}/);
});

test("the digest mail is also default-branch only, so a manual run on a test branch mails nobody", () => {
  const at = crawl.indexOf("      - name: Email the digest to the founders");
  const step = crawl.slice(at, crawl.indexOf("\n      - name:", at + 10));
  assert.match(step, /\n        if: \$\{\{ .*github\.ref == format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch \|\| 'main'\) \}\}\n/);
});
