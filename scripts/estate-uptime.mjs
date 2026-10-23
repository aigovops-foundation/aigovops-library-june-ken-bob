#!/usr/bin/env node
// estate-uptime — the one critical test: is each live service UP?
//
//   node scripts/estate-uptime.mjs                   # probe everything, print a table, exit 1 if anything is DOWN
//   node scripts/estate-uptime.mjs --json out.json   # also write the machine-readable result
//   node scripts/estate-uptime.mjs --prev prev.json  # read the last result; exit 1 only on a NEW outage
//   node scripts/estate-uptime.mjs --table table.md --flips flips.md   # write the Markdown the pinned issue shows
//
// WHY THIS EXISTS (Bob, 2026-10-20). The estate had nine daily red-main watchdogs, nine weekly
// link checks, a six-hourly browser crawl and GitHub's own mail on every passed run — a hundred
// messages a day, and not one of them answered the only question that matters at 3am: is the
// service up? This lane answers that and nothing else. No browser, no sign-in, no form, no
// commit. A probe is a GET; a service is DOWN only when every attempt fails; a founder hears
// about it only when the answer CHANGES (pinned issue comment + Graph mail), never on a steady
// state in either direction.
//
// WHY THREE ATTEMPTS. GitHub's runners share egress with the rest of the world; a single
// timeout to a healthy Pages site happens weekly. Three tries twenty seconds apart turns a
// blip into silence and a real outage into a certain answer. The attempt count, gap and
// timeout live in estate-uptime.json next to the probes, so the policy is readable without
// reading code.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadConfig(path = join(ROOT, "estate-uptime.json")) {
  const cfg = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(cfg.probes) || cfg.probes.length === 0) throw new Error("estate-uptime.json: no probes — a lane that checks nothing must not report success");
  for (const p of cfg.probes) {
    if (!p.name || !p.url) throw new Error(`estate-uptime.json: a probe needs name and url (${JSON.stringify(p)})`);
    if (!/^https:\/\//.test(p.url)) throw new Error(`estate-uptime.json: ${p.name} must be https`);
    if (!Array.isArray(p.expect) || p.expect.length === 0) throw new Error(`estate-uptime.json: ${p.name} needs an expect list`);
  }
  return { attempts: 3, gap_seconds: 20, timeout_seconds: 15, ...cfg };
}

// One GET. Never throws: a network error is an answer ("no response"), not a crash.
export async function probeOnce(probe, { timeoutMs, fetchImpl = fetch } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetchImpl(probe.url, { redirect: "manual", signal: ctl.signal, headers: { "user-agent": "aigovops-estate-uptime/1 (+https://github.com/aigovops-foundation/aigovops-library-june-ken-bob)" } });
    const ms = Date.now() - started;
    if (!probe.expect.includes(res.status)) return { ok: false, status: res.status, ms, why: `HTTP ${res.status}, expected ${probe.expect.join("/")}` };
    if (probe.must_contain) {
      const text = await res.text();
      if (!text.includes(probe.must_contain)) return { ok: false, status: res.status, ms, why: `HTTP ${res.status} but the page does not say "${probe.must_contain}"` };
    }
    return { ok: true, status: res.status, ms };
  } catch (e) {
    const ms = Date.now() - started;
    return { ok: false, status: 0, ms, why: e?.name === "AbortError" ? `no response in ${timeoutMs} ms` : `no response (${e?.code || e?.message || e})` };
  } finally {
    clearTimeout(timer);
  }
}

// UP on the first good attempt; DOWN only when every attempt failed.
export async function probeWithRetries(probe, cfg, { fetchImpl, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const tries = [];
  for (let i = 0; i < cfg.attempts; i++) {
    if (i > 0) await sleep(cfg.gap_seconds * 1000);
    const t = await probeOnce(probe, { timeoutMs: cfg.timeout_seconds * 1000, fetchImpl });
    tries.push(t);
    if (t.ok) return { name: probe.name, url: probe.url, status: "UP", attempts: tries };
  }
  return { name: probe.name, url: probe.url, status: "DOWN", attempts: tries, why: tries[tries.length - 1].why };
}

export async function probeAll(cfg, opts = {}) {
  const results = await Promise.all(cfg.probes.map((p) => probeWithRetries(p, cfg, opts)));
  return { checked_at: new Date().toISOString(), down: results.filter((r) => r.status === "DOWN").length, results };
}

// What changed since the last run. A flip is the only thing a founder is told about.
export function flips(prev, cur) {
  const before = new Map((prev?.results ?? []).map((r) => [r.name, r.status]));
  return cur.results
    .filter((r) => before.has(r.name) ? before.get(r.name) !== r.status : r.status === "DOWN")
    .map((r) => ({ name: r.name, url: r.url, from: before.get(r.name) ?? "unknown", to: r.status, why: r.why }));
}

export function renderTable(cur) {
  const lines = [`| Service | Status | Last try | Note |`, `|---|---|---|---|`];
  for (const r of cur.results) {
    const last = r.attempts[r.attempts.length - 1];
    lines.push(`| ${r.name} | ${r.status === "UP" ? "🟢 UP" : "🔴 DOWN"} | HTTP ${last.status || "—"} in ${last.ms} ms | ${r.why ?? ""} |`);
  }
  return lines.join("\n");
}

export function renderFlips(list) {
  return list.map((f) => `- **${f.name}** ${f.from} → **${f.to}** — ${f.url}${f.why ? ` — ${f.why}` : ""}`).join("\n");
}

async function main(argv) {
  const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
  const cfg = loadConfig();
  const cur = await probeAll(cfg);
  const prev = opt("prev") ? (() => { try { return JSON.parse(readFileSync(opt("prev"), "utf8")); } catch { return null; } })() : null;
  const changed = flips(prev, cur);
  cur.flips = changed;

  console.log(`estate-uptime: ${cur.results.length} service(s) · ${cur.results.length - cur.down} up · ${cur.down} down · ${changed.length} changed since last run`);
  for (const r of cur.results) console.log(`  ${r.status === "UP" ? "✓" : "✗"} ${r.name} — ${r.status}${r.why ? ` (${r.why})` : ""}`);
  if (changed.length) { console.log("\nchanged:"); console.log(renderFlips(changed)); }
  if (opt("json")) writeFileSync(opt("json"), JSON.stringify(cur, null, 2) + "\n");
  // The workflow reads these two files; rendering them HERE (not in an inline `node -e` in YAML)
  // is what the first 48 scheduled runs taught: a one-line script that mixed ESM `import()` with
  // CommonJS `require` never wrote table.md, the issue step then failed on the missing file, and
  // the lane that exists to end failure mail produced one every half hour.
  if (opt("table")) writeFileSync(opt("table"), renderTable(cur) + "\n");
  if (opt("flips")) writeFileSync(opt("flips"), (changed.length ? renderFlips(changed) : "") + "\n");

  // With a previous result, red means NEW outage (one failure mail per incident, not 48 a day).
  // Without one (first run, or run by hand), red means anything is down right now.
  const newlyDown = changed.filter((f) => f.to === "DOWN").length;
  return prev ? (newlyDown ? 1 : 0) : (cur.down ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e); process.exit(2); });
}
