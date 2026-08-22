// Tests for scripts/estate-manifest.mjs — the estate manifest's parser, schema and drift check.
//
// The parser reads a deliberately small subset of YAML. The tests that matter most are the
// REJECTION tests: a parser that silently mis-reads a construct it does not implement would
// hand us a manifest that looks fine and is wrong, which is the exact failure mode the
// manifest exists to prevent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseYaml, validate, deriveSites, checkDrift, load, ManifestError } from "../scripts/estate-manifest.mjs";

const rejects = (src, why) =>
  assert.throws(() => parseYaml(src), ManifestError, `should reject ${why}`);

test("parses block mappings, nesting and scalar types", () => {
  const y = parseYaml(`
# a comment
name: plain
quoted: "with: a colon"
single: 'it''s fine'
yes_: true
no_: false
nada: null
count: 42
ratio: 1.5
nested:
  inner: value
  deeper:
    leaf: 1
`);
  assert.equal(y.name, "plain");
  assert.equal(y.quoted, "with: a colon");
  assert.equal(y.single, "it's fine");
  assert.equal(y.yes_, true);
  assert.equal(y.no_, false);
  assert.equal(y.nada, null);
  assert.equal(y.count, 42);
  assert.equal(y.ratio, 1.5);
  assert.deepEqual(y.nested, { inner: "value", deeper: { leaf: 1 } });
});

test("parses sequences of scalars and of mappings, including nested blocks", () => {
  const y = parseYaml(`
roles:
  - co-founder
  - steward
rows:
  - id: one
    flag: true
    sub:
      a: 1
  - id: two
    flag: false
`);
  assert.deepEqual(y.roles, ["co-founder", "steward"]);
  assert.equal(y.rows.length, 2);
  assert.deepEqual(y.rows[0], { id: "one", flag: true, sub: { a: 1 } });
  assert.deepEqual(y.rows[1], { id: "two", flag: false });
});

test("strips trailing comments from bare scalars but not from quoted ones", () => {
  const y = parseYaml(`a: value   # trailing\nb: "keep # this"\n`);
  assert.equal(y.a, "value");
  assert.equal(y.b, "keep # this");
});

test("rejects every construct it does not implement, by name", () => {
  rejects("a:\n\tb: 1\n", "tabs");
  rejects("a:\n   b: 1\n", "odd indentation");
  rejects("a: {b: 1}\n", "flow mappings");
  rejects("a: [1, 2]\n", "flow sequences");
  rejects("a: &anchor 1\n", "anchors");
  rejects("a: |\n  text\n", "block scalars");
  rejects("a: 1\na: 2\n", "duplicate keys");
  rejects('a: "unterminated\n', "unterminated quotes");
  rejects("not a mapping line\n", "a line that is not key: value");
});

test("reports the line number of a problem", () => {
  try {
    parseYaml("ok: 1\nalso: 2\nbad: {x: 1}\n");
    assert.fail("should have thrown");
  } catch (e) {
    assert.match(e.message, /estate\.yaml:3:/);
  }
});

/* ── schema ───────────────────────────────────────────────────────────────────── */

const minimal = () => ({
  version: 1,
  status: "unknown",
  domains: [{ id: "d", role: "canonical", status: "live", owner: "o", verified: true }],
  repos: [{ id: "r", account: "o", role: "x", visibility: "public", disposition: "trunk", verified: true }],
  sites: [{ id: "s", base: "https://x", repo: "r", classification: "public", status: "live", verified: true }],
  services: [{ id: "sv", kind: "k", host: "h", status: "live", verified: true }],
  outside: [{ id: "v", what: "w", cost: "0", owner: "o", verified: true }],
  data_stores: [{ id: "ds", where: "w", classification: "secret", verified: true }],
  people: [{ id: "p", roles: ["co-founder"] }],
});

test("a well-formed manifest has no problems and no unknowns", () => {
  const { problems, unknowns } = validate(minimal());
  assert.deepEqual(problems, []);
  assert.deepEqual(unknowns, []);
});

test("catches a missing required field", () => {
  const m = minimal();
  delete m.repos[0].disposition;
  assert.match(validate(m).problems.join("\n"), /missing required field "disposition"/);
});

test("catches an unknown classification and an unknown status", () => {
  const m = minimal();
  m.data_stores[0].classification = "sort-of-private";
  m.services[0].status = "probably-up";
  const out = validate(m).problems.join("\n");
  assert.match(out, /classification "sort-of-private" is not one of/);
  assert.match(out, /status "probably-up" is not one of/);
});

test("catches a site pointing at a repo the manifest does not list", () => {
  const m = minimal();
  m.sites[0].repo = "ghost";
  assert.match(validate(m).problems.join("\n"), /repo "ghost" is not in the repos section/);
});

test("catches two domains both claiming canonical", () => {
  const m = minimal();
  m.domains.push({ id: "d2", role: "canonical", status: "live", owner: "o", verified: true });
  assert.match(validate(m).problems.join("\n"), /more than one domain claims role "canonical"/);
});

test("catches a duplicate id inside a section", () => {
  const m = minimal();
  m.repos.push({ ...m.repos[0] });
  assert.match(validate(m).problems.join("\n"), /duplicate id "r"/);
});

test("an unverified row, an unknown cost and an unknown classification all read as unknown", () => {
  const m = minimal();
  m.repos[0].verified = false;
  m.outside[0].cost = "unknown";
  m.data_stores[0].classification = "unknown";
  const { problems, unknowns } = validate(m);
  assert.deepEqual(problems, [], "unknowns are not schema problems");
  assert.equal(unknowns.length, 3, "but every one of them is counted and surfaced");
});

/* ── the real manifest ────────────────────────────────────────────────────────── */

test("the committed estate.yaml parses and passes the schema", () => {
  const { problems } = validate(load());
  assert.deepEqual(problems, []);
});

test("the committed estate.yaml is consistent with every file derived from it", () => {
  assert.deepEqual(checkDrift(load()), []);
});

test("deriveSites reproduces estate-sites.json exactly — the manifest really is the source", () => {
  const live = JSON.parse(readFileSync(new URL("../estate-sites.json", import.meta.url), "utf8"));
  assert.deepEqual(deriveSites(load()), live.sites);
});

test("drift is detected in both directions", () => {
  const m = load();
  const dropped = { ...m, sites: m.sites.filter((s) => s.id !== "beacon-pages") };
  assert.match(checkDrift(dropped).join("\n"), /crawls a site the manifest does not list/);

  const added = {
    ...m,
    sites: [...m.sites, { id: "new", name: "New", base: "https://new.example", repo: "aigovops-beacon",
      classification: "public", status: "live", verified: true, crawl: { enabled: true, failOnDead: true, gated: false } }],
  };
  assert.match(checkDrift(added).join("\n"), /manifest has a crawled site the crawler does not/);
});

test("drift is detected when a founder's handle or email changes", () => {
  const m = load();
  const renamed = { ...m, people: m.people.map((p) => (p.id === "bob" ? { ...p, github: "someone-else" } : p)) };
  assert.match(checkDrift(renamed).join("\n"), /founders\.json: handles/);
});

test("the manifest still records Ken with no GitHub handle — D7 is open, and the file says so", () => {
  const ken = load().people.find((p) => p.id === "ken");
  assert.ok(ken, "Ken must be in the manifest");
  assert.equal(ken.github, undefined, "if this fails, D7 was answered — add the handle to founders.json too");
});
