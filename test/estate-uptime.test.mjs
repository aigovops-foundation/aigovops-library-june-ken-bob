// estate-uptime — the policy, without the network: DOWN only when every attempt fails; a founder is
// told only about a flip; a 404 can be UP when the row says so (the Beacon lab's Express root).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadConfig, probeOnce, probeWithRetries, flips, renderTable } from "../scripts/estate-uptime.mjs";
const require = createRequire(import.meta.url);

const cfg = { attempts: 3, gap_seconds: 0, timeout_seconds: 1 };
const ok = (status = 200, body = "AiGovOps Foundation") => async () => ({ status, text: async () => body });
const fails = (n, then) => { let i = 0; return async (...a) => (i++ < n ? (() => { throw Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" }); })() : then(...a)); };
const noSleep = () => Promise.resolve();

test("the manifest loads and every probe is https with an expect list", () => {
  const c = loadConfig();
  assert.ok(c.probes.length >= 8, "the estate publishes at least eight live properties");
  assert.ok(c.probes.some((p) => p.url.startsWith("https://www.aigovops-foundation.com")));
  assert.ok(c.probes.some((p) => p.url.startsWith("https://community.aigovops-foundation.com")));
  assert.ok(c.attempts >= 2, "one attempt cannot tell a blip from an outage");
});

test("a good first answer is UP after one attempt", async () => {
  const r = await probeWithRetries({ name: "x", url: "https://x", expect: [200], must_contain: "AiGovOps" }, cfg, { fetchImpl: ok(), sleep: noSleep });
  assert.equal(r.status, "UP"); assert.equal(r.attempts.length, 1);
});

test("two failures then a success is UP — a blip is not an outage", async () => {
  const r = await probeWithRetries({ name: "x", url: "https://x", expect: [200] }, cfg, { fetchImpl: fails(2, ok()), sleep: noSleep });
  assert.equal(r.status, "UP"); assert.equal(r.attempts.length, 3);
});

test("three failures is DOWN, with the last reason", async () => {
  const r = await probeWithRetries({ name: "x", url: "https://x", expect: [200] }, cfg, { fetchImpl: ok(503), sleep: noSleep });
  assert.equal(r.status, "DOWN"); assert.match(r.why, /HTTP 503/);
});

test("a 404 is UP when the row expects it (Express with no root route is a live process)", async () => {
  const r = await probeOnce({ name: "lab", url: "https://lab", expect: [200, 404] }, { timeoutMs: 1000, fetchImpl: ok(404, "Cannot GET /") });
  assert.equal(r.ok, true);
});

test("a 200 that does not say the expected words is not UP (a parked page is not the service)", async () => {
  const r = await probeOnce({ name: "x", url: "https://x", expect: [200], must_contain: "AiGovOps" }, { timeoutMs: 1000, fetchImpl: ok(200, "This domain is for sale") });
  assert.equal(r.ok, false); assert.match(r.why, /does not say/);
});

test("a hang is 'no response', not a crash", async () => {
  const hang = (_u, { signal }) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  const r = await probeOnce({ name: "x", url: "https://x", expect: [200] }, { timeoutMs: 10, fetchImpl: hang });
  assert.equal(r.ok, false); assert.match(r.why, /no response in 10 ms/);
});

test("only flips are reported: steady UP and steady DOWN are silent, a new DOWN with no history is not", () => {
  const prev = { results: [{ name: "a", status: "UP" }, { name: "b", status: "DOWN" }, { name: "c", status: "UP" }] };
  const cur = { results: [{ name: "a", status: "UP", url: "u" }, { name: "b", status: "UP", url: "u" }, { name: "c", status: "DOWN", url: "u", why: "HTTP 502" }, { name: "new", status: "DOWN", url: "u" }, { name: "new2", status: "UP", url: "u" }] };
  const f = flips(prev, cur);
  assert.deepEqual(f.map((x) => `${x.name}:${x.from}>${x.to}`), ["b:DOWN>UP", "c:UP>DOWN", "new:unknown>DOWN"]);
});

test("the table names every service with its status", () => {
  const t = renderTable({ results: [{ name: "a", status: "UP", attempts: [{ status: 200, ms: 120 }] }, { name: "b", status: "DOWN", why: "HTTP 503", attempts: [{ status: 503, ms: 90 }] }] });
  assert.match(t, /\| a \| 🟢 UP \| HTTP 200 in 120 ms/); assert.match(t, /\| b \| 🔴 DOWN \| HTTP 503 in 90 ms \| HTTP 503/);
});

test("the workflow lets the script render the issue Markdown (no inline node -e; the first 48 runs failed on one)", () => {
  const { readFileSync: read } = require("node:fs");
  const lane = read(new URL("../.github/workflows/estate-uptime.yml", import.meta.url), "utf8");
  assert.match(lane, /estate-uptime\.mjs --prev prev\.json --json result\.json --table table\.md --flips flips\.md/);
  assert.doesNotMatch(lane, /node -e\s+"[\s\S]*?import\(/, "no inline ESM import() in a node -e string");
});
