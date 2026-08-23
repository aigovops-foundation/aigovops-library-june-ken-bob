// Tests for the scheduled-run receipt hook (ladder row 12).
//
// The two that matter most are the ones about what a receipt REFUSES. A receipt's whole value is
// that it can be published without leaking anything, and "metadata only" is a promise that has
// to be enforced rather than remembered — so the allowlist is tested from the outside, the way
// a payload would actually arrive.
//
// The other is the signing boundary. The core's emit() creates a keypair when it finds none,
// which in CI means signing every run with a throwaway key. These assert this hook never does.

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildRunReceipt, receiptHash, seal, verifyChain, readLedger, lastHash, ReceiptError, ALLOWED,
} from "../scripts/run-receipt.mjs";
import { collect, scheduledWorkflows, toReceiptInput, runKey } from "../scripts/receipts-collect.mjs";
import { parseYaml } from "../scripts/estate-manifest.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const RUN = {
  ts: "2026-08-23T02:00:00.000Z", actor: "workflow:link-check", action: "scheduled",
  workflow: "link-check", runId: "123", runAttempt: 1, event: "schedule",
  conclusion: "success", sha: "a".repeat(40),
  startedAt: "2026-08-23T01:00:00Z", endedAt: "2026-08-23T01:02:00Z",
};

/* ── metadata only, enforced ──────────────────────────────────────────────────── */

test("a well-formed run receipt builds", () => {
  const r = buildRunReceipt(RUN, null);
  assert.equal(r.profile, "aigovops-run.v1");
  assert.equal(r.kind, "run");
  assert.equal(r.prev, null);
  assert.equal(r.conclusion, "success");
});

test("a field outside the allowlist is refused — that is how a payload gets in", () => {
  for (const sneaky of ["body", "logs", "output", "email", "prompt"]) {
    assert.throws(() => buildRunReceipt({ ...RUN, [sneaky]: "x" }, null),
      (e) => e instanceof ReceiptError && new RegExp(`"${sneaky}" is not a receipt field`).test(e.message),
      `${sneaky} should be refused`);
  }
});

test("an object value is refused, because that is the shape a payload arrives in", () => {
  assert.throws(() => buildRunReceipt({ ...RUN, conclusion: { nested: "payload" } }, null),
    /carries scalars only/);
});

test("an over-long string is refused — metadata does not run to paragraphs", () => {
  assert.throws(() => buildRunReceipt({ ...RUN, workflow: "x".repeat(201) }, null), /too long to be metadata/);
});

test("the required fields are required", () => {
  for (const f of ["ts", "actor", "action", "workflow", "runId", "conclusion"]) {
    const bad = { ...RUN }; delete bad[f];
    assert.throws(() => buildRunReceipt(bad, null), new RegExp(`"${f}" is required`), `${f}`);
  }
});

test("field order is canonical, so the file reads the same way every time", () => {
  const a = buildRunReceipt(RUN, null);
  const shuffled = Object.fromEntries(Object.entries(RUN).reverse());
  assert.deepEqual(Object.keys(a), Object.keys(buildRunReceipt(shuffled, null)));
  assert.ok(Object.keys(a).every((k) => ALLOWED.includes(k)));
});

/* ── the signing boundary ─────────────────────────────────────────────────────── */

test("with no key in the environment the receipt is UNSIGNED and says so", () => {
  const e = seal(buildRunReceipt(RUN, null), {});
  assert.equal(e.state, "unsigned");
  assert.equal(e.sig, undefined, "an unsigned receipt must carry no signature field at all");
  assert.ok(e.hash, "but it is still hashed, so the chain still holds");
});

test("no key is ever generated — an absent key stays absent", () => {
  // The failure this guards: core beacon.loadOrCreateKeys() mints a keypair when it finds none,
  // so a fresh CI checkout would sign every run with a key that is discarded seconds later.
  const before = readdirSync(join(ROOT, "core", "keys")).sort();
  seal(buildRunReceipt(RUN, null), {});
  seal(buildRunReceipt({ ...RUN, runId: "124" }, null), {});
  assert.deepEqual(readdirSync(join(ROOT, "core", "keys")).sort(), before,
    "sealing must not create key material");
});

test("with a key in the environment it signs, and the signature verifies", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const env = {
    BEACON_PRIVATE_KEY_PEM: privateKey.export({ type: "pkcs8", format: "pem" }),
    BEACON_PUBLIC_KEY_PEM: publicKey.export({ type: "spki", format: "pem" }),
  };
  const e = seal(buildRunReceipt(RUN, null), env);
  assert.equal(e.state, "signed");
  assert.equal(e.alg, "ed25519");
  const { problems } = verifyChain([e], { publicKeyPem: env.BEACON_PUBLIC_KEY_PEM });
  assert.deepEqual(problems, []);
});

test("a signature from the wrong key does not verify", () => {
  const a = crypto.generateKeyPairSync("ed25519");
  const b = crypto.generateKeyPairSync("ed25519");
  const e = seal(buildRunReceipt(RUN, null), {
    BEACON_PRIVATE_KEY_PEM: a.privateKey.export({ type: "pkcs8", format: "pem" }),
    BEACON_PUBLIC_KEY_PEM: a.publicKey.export({ type: "spki", format: "pem" }),
  });
  const { problems } = verifyChain([e], { publicKeyPem: b.publicKey.export({ type: "spki", format: "pem" }) });
  assert.match(problems.join("\n"), /signature does not verify/);
});

/* ── the chain: what an unsigned ledger still gives you ───────────────────────── */

const chainOf = (n) => {
  const out = []; let prev = null;
  for (let i = 0; i < n; i++) {
    const e = seal(buildRunReceipt({ ...RUN, runId: String(100 + i) }, prev), {});
    out.push(e); prev = e.hash;
  }
  return out;
};

test("an untouched chain verifies", () => {
  assert.deepEqual(verifyChain(chainOf(4)).problems, []);
});

test("editing a past record is caught at that entry", () => {
  const c = chainOf(4);
  c[1].record.conclusion = "success-actually";     // rewrite history, leave the stored hash
  assert.match(verifyChain(c).problems.join("\n"), /entry 2: hash does not match its record/);
});

test("editing a record AND recomputing its hash is caught at the NEXT entry", () => {
  // The harder attempt, and the one the chain is actually for. Fixing the entry's own hash
  // silences the check above — and now entry 3's `prev` points at a hash that no longer
  // exists, so the break moves one along rather than going away.
  const c = chainOf(4);
  c[1].record.conclusion = "success-actually";
  c[1].hash = receiptHash(c[1].record);
  const problems = verifyChain(c).problems.join("\n");
  assert.doesNotMatch(problems, /entry 2: hash does not match/, "the local check is now satisfied");
  assert.match(problems, /entry 3: prev is .*the chain is broken here/);
});

test("rewriting the whole tail is NOT caught — this is what signing buys, and why unsigned says so", () => {
  // Stated as a test rather than left as an assumption. Someone who can rewrite the file can
  // re-chain it end to end and the result verifies. The chain proves nobody edited it in
  // PLACE; only a signature proves who wrote it. An unsigned ledger must not be described as
  // more than that.
  const c = chainOf(4);
  c[1].record.conclusion = "success-actually";
  let prev = c[0].hash;
  for (let i = 1; i < c.length; i++) {
    c[i].record.prev = prev;
    c[i].hash = receiptHash(c[i].record);
    prev = c[i].hash;
  }
  assert.deepEqual(verifyChain(c).problems, [], "a fully re-chained file verifies — honestly recorded");
});

test("removing an entry from the middle is caught", () => {
  const c = chainOf(4);
  c.splice(1, 1);
  assert.match(verifyChain(c).problems.join("\n"), /the chain is broken here/);
});

test("a state that is neither signed nor unsigned is refused", () => {
  const c = chainOf(1);
  c[0].state = "probably";
  assert.match(verifyChain(c).problems.join("\n"), /neither signed nor unsigned/);
});

test("the counts are reported, so unsigned is never mistaken for signed", () => {
  const { signed, unsigned, total } = verifyChain(chainOf(3));
  assert.deepEqual({ signed, unsigned, total }, { signed: 0, unsigned: 3, total: 3 });
});

/* ── the collector ────────────────────────────────────────────────────────────── */

const API = (runs) => async () => ({ workflow_runs: runs });
const RAW = (id, extra = {}) => ({
  id, name: "link-check", event: "schedule", conclusion: "success", run_attempt: 1,
  head_sha: "b".repeat(40), run_started_at: `2026-08-23T0${id}:00:00Z`, updated_at: `2026-08-23T0${id}:05:00Z`,
  ...extra,
});

test("it records a run it has not seen", async () => {
  const fresh = await collect({ fetchJson: API([RAW(1)]), entries: [], env: { GITHUB_REPOSITORY: "o/r" } });
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].record.runId, "1");
});

test("it does not record the same run twice", async () => {
  const first = await collect({ fetchJson: API([RAW(1)]), entries: [], env: { GITHUB_REPOSITORY: "o/r" } });
  const again = await collect({ fetchJson: API([RAW(1)]), entries: first, env: { GITHUB_REPOSITORY: "o/r" } });
  assert.deepEqual(again, [], "a second collection of the same run must add nothing");
});

test("a re-run is a different receipt — attempt 2 is not attempt 1", async () => {
  const first = await collect({ fetchJson: API([RAW(1)]), entries: [], env: { GITHUB_REPOSITORY: "o/r" } });
  const rerun = await collect({ fetchJson: API([RAW(1, { run_attempt: 2 })]), entries: first, env: { GITHUB_REPOSITORY: "o/r" } });
  assert.equal(rerun.length, 1);
  assert.equal(rerun[0].record.runAttempt, 2);
});

test("new receipts chain onto the existing ledger, oldest first", async () => {
  const entries = await collect({ fetchJson: API([RAW(3), RAW(1), RAW(2)]), entries: [], env: { GITHUB_REPOSITORY: "o/r" } });
  assert.deepEqual(entries.map((e) => e.record.runId), ["1", "2", "3"], "API order must not become file order");
  assert.deepEqual(verifyChain(entries).problems, []);
});

test("the API's prose fields never reach a receipt", () => {
  const r = toReceiptInput(RAW(1, {
    display_title: "fix: a commit message that could say anything",
    head_branch: "claude/some-branch",
    actor: { login: "someone" },
    head_commit: { message: "a message", author: { email: "person@example.com" } },
  }));
  const text = JSON.stringify(r);
  for (const leak of ["commit message", "claude/some-branch", "someone", "person@example.com"]) {
    assert.ok(!text.includes(leak), `${leak} must not appear in a receipt`);
  }
  assert.doesNotThrow(() => buildRunReceipt(r, null), "and what survives must still be a legal receipt");
});

test("an incomplete run is skipped — a receipt says how a run ENDED", async () => {
  const fresh = await collect({
    fetchJson: API([RAW(1, { conclusion: null }), RAW(2)]),
    entries: [], env: { GITHUB_REPOSITORY: "o/r" },
  });
  assert.deepEqual(fresh.map((e) => e.record.runId), ["2"]);
});

test("it refuses to guess which repository it is in", async () => {
  await assert.rejects(() => collect({ fetchJson: API([]), entries: [], env: {} }), /GITHUB_REPOSITORY is not set/);
});

/* ── the wiring, so the hook cannot become shelfware ──────────────────────────── */

test("every scheduled workflow is watched, because the watch list is derived", () => {
  const dir = join(ROOT, ".github", "workflows");
  const byHand = readdirSync(dir).filter((f) => f.endsWith(".yml"))
    .filter((f) => /^\s{2}schedule:/m.test(readFileSync(join(dir, f), "utf8"))).sort();
  assert.deepEqual(scheduledWorkflows(), byHand);
  assert.ok(byHand.length >= 7, "seven scheduled workflows were present when this was written");
});

test("a workflow actually runs the collector — otherwise this is all shelfware", () => {
  const dir = join(ROOT, ".github", "workflows");
  const callers = readdirSync(dir).filter((f) => f.endsWith(".yml"))
    .filter((f) => readFileSync(join(dir, f), "utf8").includes("receipts-collect.mjs"));
  assert.deepEqual(callers, ["estate-interaction-crawl.yml"]);
});

test("the ledger path is declared in the autonomy policy, not smuggled in", () => {
  const policy = parseYaml(readFileSync(join(ROOT, "policies", "autonomy.yaml"), "utf8"));
  const wf = policy.workflows.find((w) => w.file === "estate-interaction-crawl.yml");
  assert.ok(wf.writes.includes("ops/receipts/runs.ndjson"),
    "a workflow writing a path it has not declared is the thing autonomy-check exists to catch");
  assert.equal(wf.permissions.actions, "read");
});

test("the committed ledger, whatever is in it, verifies", () => {
  const entries = readLedger();
  assert.deepEqual(verifyChain(entries).problems, []);
  if (entries.length) assert.ok(lastHash(entries), "a non-empty ledger has a last hash to chain onto");
});
