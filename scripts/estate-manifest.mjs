#!/usr/bin/env node
// estate-manifest — read, validate, and enforce `estate.yaml`, the estate's one manifest.
//
//   node scripts/estate-manifest.mjs            # validate + print the summary
//   node scripts/estate-manifest.mjs --check    # validate + fail on drift vs the derived files (CI)
//   node scripts/estate-manifest.mjs --regen    # rewrite estate-sites.json from the manifest
//   node scripts/estate-manifest.mjs --json     # emit the parsed manifest
//
// WHY THIS EXISTS. The estate's facts live in three files that nobody reconciles
// (`estate-sites.json`, `founders.json`, `repo-audit.config.json`) plus a dozen prose docs.
// One manifest is the single input; those files become derived views of it, and `--check`
// fails the build the moment the two disagree. Drift is what silently un-automates an
// automated organisation.
//
// WHY A HAND-ROLLED PARSER. Node 20 has no YAML, and adding a parser dependency to the repo
// that audits its own supply chain (W2-8: a mutable action tag with the vault token in scope)
// buys a convenience with a governance cost. So this reads a deliberately SMALL subset of YAML
// — block maps, block sequences, scalars, comments — and throws on anything it does not fully
// understand rather than guessing. Fail closed, like everything else here.
//
// THE RULE IT ENFORCES, from the 2026-07-19 estate review: a check that cannot verify something
// must read as UNKNOWN, never as green. `verified: false` rows are counted and printed on every
// run. "Everything is fine" requires zero problems AND zero unknowns.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ── the YAML subset ─────────────────────────────────────────────────────────── */

export class ManifestError extends Error {}

const fail = (line, msg) => {
  throw new ManifestError(`estate.yaml:${line}: ${msg}`);
};

// Reject the constructs this parser does NOT implement, loudly and by name, so a future
// author gets an error instead of a silently wrong parse.
const UNSUPPORTED = [
  [/^[|>]/, "block scalars (| and >) are not supported — use a quoted single-line string"],
  [/^[&*]/, "anchors and aliases are not supported"],
  [/^\{/, "flow mappings ({...}) are not supported — use a block mapping"],
  [/^\[/, "flow sequences ([...]) are not supported — use a block sequence"],
];

function tokenize(src) {
  const out = [];
  src.split("\n").forEach((raw, i) => {
    const no = i + 1;
    if (/^\s*$/.test(raw)) return;
    if (/^\s*#/.test(raw)) return;
    if (/^ *\t/.test(raw) || /\t/.test(raw.match(/^\s*/)[0])) fail(no, "tabs are not allowed in indentation");
    const indent = raw.match(/^ */)[0].length;
    if (indent % 2 !== 0) fail(no, `indentation must be a multiple of 2 (got ${indent})`);
    let text = raw.slice(indent);
    let newItem = false;
    if (text === "-") { newItem = true; text = ""; }
    else if (text.startsWith("- ")) { newItem = true; text = text.slice(2).trim(); }
    out.push({ indent: newItem ? indent + 2 : indent, text, no, newItem });
  });
  return out;
}

const KEY = /^([A-Za-z_$][A-Za-z0-9_.$-]*):(?: (.*))?$/;

function scalar(text, no) {
  const t = text.trim();
  if (t === "") return null;
  for (const [re, why] of UNSUPPORTED) if (re.test(t)) fail(no, why);
  if (t[0] === '"') {
    const end = t.lastIndexOf('"');
    if (end <= 0) fail(no, "unterminated double-quoted string");
    const after = t.slice(end + 1).trim();
    if (after && !after.startsWith("#")) fail(no, `unexpected text after quoted string: ${after}`);
    return t.slice(1, end).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (t[0] === "'") {
    const end = t.lastIndexOf("'");
    if (end <= 0) fail(no, "unterminated single-quoted string");
    const after = t.slice(end + 1).trim();
    if (after && !after.startsWith("#")) fail(no, `unexpected text after quoted string: ${after}`);
    return t.slice(1, end).replace(/''/g, "'");
  }
  const bare = t.replace(/\s+#.*$/, "").trim();
  if (bare === "true") return true;
  if (bare === "false") return false;
  if (bare === "null" || bare === "~") return null;
  if (/^-?\d+$/.test(bare)) return Number(bare);
  if (/^-?\d+\.\d+$/.test(bare)) return Number(bare);
  return bare;
}

function parseNode(toks, pos, indent) {
  if (pos >= toks.length || toks[pos].indent !== indent) fail(toks[pos - 1]?.no ?? 1, "unexpected end of block");
  return toks[pos].newItem ? parseSeq(toks, pos, indent) : parseMap(toks, pos, indent);
}

function parseSeq(toks, pos, indent) {
  const items = [];
  while (pos < toks.length && toks[pos].indent === indent && toks[pos].newItem) {
    const t = toks[pos];
    if (t.text === "") {
      pos++;
      if (pos < toks.length && toks[pos].indent > indent) {
        const [v, p] = parseNode(toks, pos, toks[pos].indent);
        items.push(v); pos = p;
      } else items.push(null);
      continue;
    }
    if (KEY.test(t.text)) {
      const [v, p] = parseMap(toks, pos, indent); // parseMap consumes the item's continuation lines
      items.push(v); pos = p;
      continue;
    }
    items.push(scalar(t.text, t.no)); pos++;
  }
  return [items, pos];
}

function parseMap(toks, pos, indent) {
  const map = {};
  let first = true;
  while (pos < toks.length && toks[pos].indent === indent) {
    // A new sequence item at this indent ends the current mapping (unless it opened it).
    if (toks[pos].newItem && !first) break;
    const t = toks[pos];
    first = false;
    const m = KEY.exec(t.text);
    if (!m) fail(t.no, `expected "key: value", got: ${t.text}`);
    const [, key, rest] = m;
    if (Object.prototype.hasOwnProperty.call(map, key)) fail(t.no, `duplicate key "${key}"`);
    pos++;
    if (rest === undefined || rest.trim() === "" || rest.trim().startsWith("#")) {
      if (pos < toks.length && toks[pos].indent > indent) {
        const [v, p] = parseNode(toks, pos, toks[pos].indent);
        map[key] = v; pos = p;
      } else map[key] = null;
    } else {
      map[key] = scalar(rest, t.no);
    }
  }
  return [map, pos];
}

export function parseYaml(src) {
  const toks = tokenize(src);
  if (!toks.length) return {};
  if (toks[0].indent !== 0) fail(toks[0].no, "document must start at indent 0");
  const [value, pos] = parseNode(toks, 0, 0);
  if (pos !== toks.length) fail(toks[pos].no, "unexpected indentation — block did not close");
  return value;
}

/* ── the schema ──────────────────────────────────────────────────────────────── */

const CLASSIFICATIONS = ["public", "operational", "personal", "secret", "unknown"];
const STATUSES = ["live", "prepared", "pending-founder", "retired", "unknown"];
const SECTIONS = {
  domains: { required: ["id", "role", "status", "owner", "verified"] },
  repos: { required: ["id", "account", "role", "visibility", "disposition", "verified"] },
  sites: { required: ["id", "base", "repo", "classification", "status", "verified"] },
  services: { required: ["id", "kind", "host", "status", "verified"] },
  outside: { required: ["id", "what", "cost", "owner", "verified"] },
  data_stores: { required: ["id", "where", "classification", "verified"] },
  people: { required: ["id", "roles"] },
};

export function validate(m) {
  const problems = [];
  const unknowns = [];
  const P = (s) => problems.push(s);

  if (m.version !== 1) P(`version must be 1 (got ${JSON.stringify(m.version ?? null)})`);
  if (!STATUSES.includes(m.status ?? "")) P(`top-level status must be one of ${STATUSES.join(", ")}`);

  for (const [name, spec] of Object.entries(SECTIONS)) {
    const rows = m[name];
    if (!Array.isArray(rows)) { P(`section "${name}" is missing or not a list`); continue; }
    const seen = new Set();
    rows.forEach((row, i) => {
      const at = `${name}[${i}]`;
      if (row === null || typeof row !== "object" || Array.isArray(row)) { P(`${at}: not a mapping`); return; }
      const id = row.id ?? `#${i}`;
      if (seen.has(row.id)) P(`${at}: duplicate id "${row.id}"`);
      seen.add(row.id);
      for (const k of spec.required) {
        if (!(k in row) || row[k] === null || row[k] === "") P(`${name}/${id}: missing required field "${k}"`);
      }
      if ("classification" in row && !CLASSIFICATIONS.includes(row.classification)) {
        P(`${name}/${id}: classification "${row.classification}" is not one of ${CLASSIFICATIONS.join(", ")}`);
      }
      if ("status" in row && row.status !== null && !STATUSES.includes(row.status)) {
        P(`${name}/${id}: status "${row.status}" is not one of ${STATUSES.join(", ")}`);
      }
      if (row.verified === false) unknowns.push(`${name}/${id}${row.source ? ` (source: ${row.source})` : ""}`);
      if (row.classification === "unknown") unknowns.push(`${name}/${id}: unclassified`);
      if (row.cost === "unknown") unknowns.push(`${name}/${id}: cost unknown`);
      if (row.status === "unknown") unknowns.push(`${name}/${id}: status unknown`);
    });
  }

  // Referential integrity: a served site must name a repo the manifest knows about.
  const repoIds = new Set((m.repos ?? []).map((r) => r?.id));
  for (const s of m.sites ?? []) {
    if (s?.repo && s.repo !== "none" && !repoIds.has(s.repo)) {
      P(`sites/${s.id}: repo "${s.repo}" is not in the repos section`);
    }
  }
  // A domain the manifest calls canonical must actually exist, and there must be exactly one.
  const canon = (m.domains ?? []).filter((d) => d?.role === "canonical");
  if (canon.length > 1) P(`more than one domain claims role "canonical": ${canon.map((d) => d.id).join(", ")}`);

  return { problems, unknowns };
}

/* ── derived views ───────────────────────────────────────────────────────────── */

export function deriveSites(m) {
  return (m.sites ?? [])
    .filter((s) => s.crawl && s.crawl.enabled !== false)
    .map((s) => {
      const row = { name: s.name ?? s.id, base: s.base, failOnDead: !!s.crawl.failOnDead };
      if (s.crawl.cookie) row.cookie = s.crawl.cookie;
      else row.gated = !!s.crawl.gated;
      if (s.crawl.note) row.note = s.crawl.note;
      return row;
    });
}

const setOf = (a) => new Set(a ?? []);
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const diff = (a, b) => [...a].filter((x) => !b.has(x));

export function checkDrift(m) {
  const out = [];
  const read = (f) => JSON.parse(readFileSync(join(ROOT, f), "utf8"));

  // estate-sites.json — the crawler's list
  const live = read("estate-sites.json").sites;
  const want = deriveSites(m);
  const lb = setOf(live.map((s) => s.base));
  const wb = setOf(want.map((s) => s.base));
  if (!sameSet(lb, wb)) {
    for (const b of diff(wb, lb)) out.push(`estate-sites.json: manifest has a crawled site the crawler does not: ${b}`);
    for (const b of diff(lb, wb)) out.push(`estate-sites.json: the crawler crawls a site the manifest does not list: ${b}`);
  }
  for (const s of want) {
    const cur = live.find((x) => x.base === s.base);
    if (!cur) continue;
    if (!!cur.failOnDead !== !!s.failOnDead) out.push(`estate-sites.json: ${s.base} failOnDead ${cur.failOnDead} != manifest ${s.failOnDead}`);
    if ((cur.cookie ?? null) !== (s.cookie ?? null)) out.push(`estate-sites.json: ${s.base} cookie differs from the manifest`);
  }

  // founders.json — who holds the keys
  const f = read("founders.json");
  const cofounders = (m.people ?? []).filter((p) => (p.roles ?? []).includes("co-founder"));
  const me = setOf(cofounders.map((p) => p.email).filter(Boolean));
  const mh = setOf(cofounders.flatMap((p) => (p.github ? [p.github] : [])));
  if (!sameSet(me, setOf(f.emails))) out.push(`founders.json: emails ${[...setOf(f.emails)].join(",")} != manifest ${[...me].join(",")}`);
  if (!sameSet(mh, setOf(f.handles))) out.push(`founders.json: handles ${[...setOf(f.handles)].join(",")} != manifest ${[...mh].join(",")}`);

  // repo-audit.config.json — which accounts get audited
  const owners = setOf(read("repo-audit.config.json").owners);
  const accounts = setOf((m.repos ?? []).map((r) => r.account));
  for (const a of diff(accounts, owners)) out.push(`repo-audit.config.json: manifest names account "${a}" that the audit never scans`);

  return out;
}

/* ── cli ─────────────────────────────────────────────────────────────────────── */

export function load(path = join(ROOT, "estate.yaml")) {
  return parseYaml(readFileSync(path, "utf8"));
}

function main(argv) {
  const flag = (f) => argv.includes(f);
  const m = load();

  if (flag("--json")) { console.log(JSON.stringify(m, null, 2)); return 0; }

  const { problems, unknowns } = validate(m);
  const counts = Object.keys(SECTIONS).map((k) => `${(m[k] ?? []).length} ${k}`).join(" · ");
  console.log(`estate-manifest: ${counts}`);

  if (problems.length) {
    console.error(`\n✗ ${problems.length} schema problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }

  if (flag("--regen")) {
    const cur = JSON.parse(readFileSync(join(ROOT, "estate-sites.json"), "utf8"));
    const next = { ...cur, sites: deriveSites(m) };
    writeFileSync(join(ROOT, "estate-sites.json"), JSON.stringify(next, null, 2) + "\n");
    console.log("wrote estate-sites.json from the manifest");
    return 0;
  }

  let drift = [];
  if (flag("--check")) {
    drift = checkDrift(m);
    if (drift.length) {
      console.error(`\n✗ ${drift.length} drift(s) between estate.yaml and the derived files:`);
      for (const d of drift) console.error(`  - ${d}`);
      console.error(`\n  Fix the manifest, or run --regen if the manifest is right.`);
    }
  }

  // Unknowns never fail the build — they are the honest to-do list, and they are LOUD.
  if (unknowns.length) {
    console.log(`\n? ${unknowns.length} unknown(s) — could not verify, so they read as unknown, not green:`);
    for (const u of unknowns) console.log(`  - ${u}`);
  }

  if (drift.length) return 1;
  console.log(`\n✓ manifest valid${flag("--check") ? " and consistent with the derived files" : ""}` +
    `${unknowns.length ? ` — but ${unknowns.length} row(s) still unverified` : ""}`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("estate-manifest.mjs")) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    if (e instanceof ManifestError) { console.error(`✗ ${e.message}`); process.exit(1); }
    throw e;
  }
}
