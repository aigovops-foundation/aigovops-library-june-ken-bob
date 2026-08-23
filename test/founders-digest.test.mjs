// Tests for scripts/founders-digest.mjs — the weekly page for Bob and Ken.
//
// The one that matters most is staleness. A monitor that has stopped reporting looks exactly
// like a healthy estate unless something says otherwise, and this repo has already shipped a
// backup job that was green for weeks while copying nothing. So the digest must say "the
// heartbeat is old" louder than it says "everything is green".

import { test } from "node:test";
import assert from "node:assert/strict";
import { collectHealth, collectDrift, collectWaiting, collect, render } from "../scripts/founders-digest.mjs";

const HOUR = 3.6e6;
const NOW = Date.parse("2026-08-22T12:00:00Z");
const board = (generatedAt, sites = [{ status: "green", summary: {} }], estate = { score: 100, greenPages: 10, redPages: 0 }) =>
  ({ generatedAt, sites, estate });

/* ── the heartbeat ────────────────────────────────────────────────────────────── */

test("a fresh green board reads green", () => {
  const h = collectHealth(NOW, board("2026-08-22T11:30:00Z"));
  assert.equal(h.overall, "green");
  assert.equal(h.stale, false);
});

test("a board that has not beaten in hours is stale — the case that must not read as healthy", () => {
  const h = collectHealth(NOW, board(new Date(NOW - 9 * HOUR).toISOString()));
  assert.equal(h.stale, true);
  assert.equal(h.ageHours, 9);
  assert.match(render({ ...collect(NOW), health: h }, "2026-08-22"), /The heartbeat is 9h old/);
});

test("a red page makes the board red", () => {
  const h = collectHealth(NOW, board("2026-08-22T11:30:00Z", [{ status: "red", summary: {} }], { redPages: 2 }));
  assert.equal(h.overall, "red");
});

test("a missing board is reported as unavailable, not as green", () => {
  const h = collectHealth(NOW, null);
  assert.equal(h.available, false);
  assert.notEqual(h.overall, "green");
});

/* ── drift ────────────────────────────────────────────────────────────────────── */

const site = (id, crawl) => ({ id, base: `https://${id}`, crawl });

test("a crawl-disabled property with nothing watching it is drift", () => {
  const d = collectDrift({ sites: [site("orphan", { enabled: false })] });
  assert.equal(d.length, 1);
  assert.equal(d[0].kind, "unwatched");
});

test("a property that declares what watches it is NOT drift — no crying wolf", () => {
  assert.deepEqual(collectDrift({ sites: [site("doorstep", { enabled: false, watched_by: "a nightly check" })] }), []);
});

test("a crawled property is not drift", () => {
  assert.deepEqual(collectDrift({ sites: [site("live", { enabled: true, failOnDead: true })] }), []);
});

test("an unclassified store, an unknown service status and an unowned domain are all drift", () => {
  const d = collectDrift({
    data_stores: [{ id: "backup", where: "?", classification: "unknown" }],
    services: [{ id: "core", host: "fly", status: "unknown" }],
    domains: [{ id: "x.org", status: "unknown", owner: "unknown" }],
  });
  assert.deepEqual(d.map((x) => x.kind).sort(), ["owner-unknown", "status-unknown", "unclassified"]);
});

/* ── waiting on a human ───────────────────────────────────────────────────────── */

const base = {
  estate: { canonical_domain: null, ratified_by: null, people: [] },
  principles: { principles: [{ id: "P1", verified: true }] },
  skills: [],
  register: { rows: [] },
  founders: { handles: [] },
};

test("an unanswered canonical domain and an unratified manifest both wait", () => {
  const w = collectWaiting(base).map((x) => x.what);
  assert.ok(w.some((x) => /D1/.test(x)));
  assert.ok(w.some((x) => /estate\.yaml/.test(x)));
});

test("a co-founder with no GitHub handle surfaces as D7", () => {
  const w = collectWaiting({ ...base, estate: { ...base.estate, people: [{ id: "ken", name: "Ken Johnston", roles: ["co-founder"] }] } });
  assert.ok(w.some((x) => /D7 — Ken Johnston's GitHub handle/.test(x.what)));
});

test("a handle in the manifest but missing from founders.json is drift, not a decision", () => {
  const w = collectWaiting({
    ...base,
    estate: { ...base.estate, people: [{ id: "bob", roles: ["co-founder"], github: "bobrapp" }] },
    founders: { handles: [] },
  });
  assert.ok(w.some((x) => x.why === "drift" && /bobrapp/.test(x.note)));
});

test("unrecorded principles, unmapped skills and held proposals each wait", () => {
  const w = collectWaiting({
    ...base,
    principles: { principles: [{ id: "P1", verified: true }, { id: "P3", verified: false }] },
    skills: [{ id: "a", fm: { principle: "unknown" } }],
    register: { rows: [{ file: "idea.md", status: "proposal" }] },
  });
  assert.ok(w.some((x) => /Principles/.test(x.what)));
  assert.ok(w.some((x) => /no principle/.test(x.what)));
  assert.ok(w.some((x) => x.what === "idea.md"));
});

test("nothing waits when everything is answered", () => {
  assert.deepEqual(collectWaiting({
    estate: { canonical_domain: "aigovops-foundation.com", ratified_by: "Bob + Ken", people: [{ id: "b", roles: ["co-founder"], github: "bobrapp" }] },
    principles: { principles: [{ id: "P1", verified: true }] },
    skills: [{ id: "a", fm: { principle: "P1" } }],
    register: { rows: [{ file: "x.md", status: "in force" }] },
    founders: { handles: ["bobrapp"] },
  }), []);
});

/* ── the real repo ────────────────────────────────────────────────────────────── */

test("the digest renders against the committed estate, and names the gates", () => {
  const md = render(collect(NOW), "2026-08-22");
  for (const g of ["estate manifest", "autonomy", "skills", "plan register"]) {
    assert.ok(md.includes(g), `the digest should report the ${g} gate`);
  }
  assert.match(md, /Waiting on a human/);
  assert.match(md, /Unknowns/);
});

test("every gate is green right now — if this fails, the digest is telling the truth and something broke", () => {
  for (const g of collect(NOW).gates) assert.ok(g.ok, `${g.name}: ${g.detail}`);
});

test("the red-classed skill is restated in the digest", () => {
  assert.match(render(collect(NOW), "2026-08-22"), /Never run unattended:.*op-github-deploy/);
});
