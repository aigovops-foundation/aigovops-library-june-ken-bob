#!/usr/bin/env node
// autonomy-check — enforce policies/autonomy.yaml against the automation actually in the repo.
//
//   node scripts/autonomy-check.mjs           # check, and print the ledger of what runs unattended
//   node scripts/autonomy-check.mjs --list    # just the ledger
//
// WHAT IT ENFORCES
//   1. Every workflow on disk is declared in the policy, and every declared workflow exists.
//      Undeclared automation is the failure this check exists to prevent: a job nobody
//      classified is a job nobody decided was safe.
//   2. Every workflow declares its `permissions:` EXPLICITLY. An inherited default is an
//      unknown permission set, and unknown is not green.
//   3. A workflow's real permissions match what the policy says, and never exceed what its
//      class allows (read < write).
//   4. Anything holding `contents: write` declares exactly which paths it may write, and every
//      path it actually `git add`s is inside that allowlist.
//   5. No workflow is classified red, and no workflow contains a prohibited pattern.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not parse Actions YAML in general — that is a large
// and hostile grammar, and a parser that half-understands it would report green on something it
// misread. It reads two narrow things by design: the top-level `permissions:` block (both the
// flow and block spellings, plus the read-all/write-all shorthands) and the `git add` lines.
// Anything it cannot read confidently is reported as unreadable and FAILS, rather than passing.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseYaml, ManifestError } from "./estate-manifest.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WF_DIR = join(ROOT, ".github", "workflows");

const LEVEL = { none: 0, read: 1, write: 2 };

/* ── reading a workflow's declared permissions ───────────────────────────────── */

// Returns { perms: {scope: "read"|"write"|"none"}, form } or { missing: true } / { unreadable }.
export function readPermissions(src) {
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^permissions:(.*)$/.exec(line);
    if (!m) continue;
    const rest = m[1].trim();

    if (rest === "read-all") return { perms: { "*": "read" }, form: "shorthand" };
    if (rest === "write-all") return { perms: { "*": "write" }, form: "shorthand" };
    if (rest === "{}") return { perms: {}, form: "flow" };

    if (rest.startsWith("{")) {
      if (!rest.endsWith("}")) return { unreadable: "multi-line flow mapping" };
      const body = rest.slice(1, -1).trim();
      const perms = {};
      if (body) {
        for (const pair of body.split(",")) {
          const p = /^\s*([a-z-]+)\s*:\s*([a-z-]+)\s*$/.exec(pair);
          if (!p) return { unreadable: `permission entry ${JSON.stringify(pair)}` };
          perms[p[1]] = p[2];
        }
      }
      return { perms, form: "flow" };
    }

    if (rest === "") {
      const perms = {};
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (/^\s*(#.*)?$/.test(l)) continue;
        if (!/^\s/.test(l)) break;                       // dedented back to top level
        const p = /^\s+([a-z-]+)\s*:\s*([a-z-]+)\s*(#.*)?$/.exec(l);
        if (!p) return { unreadable: `permission line ${JSON.stringify(l.trim())}` };
        perms[p[1]] = p[2];
      }
      return { perms, form: "block" };
    }

    return { unreadable: `permissions: ${JSON.stringify(rest)}` };
  }
  return { missing: true };
}

// Every path the workflow stages. `git add -A` / `.` is deliberately unreadable → a failure.
export function readWrittenPaths(src) {
  const paths = [];
  const wild = [];
  for (const line of src.split("\n")) {
    if (/^\s*#/.test(line)) continue;
    const m = /(?:^|[;&|]|\s)git add\s+(.+)$/.exec(line);
    if (!m) continue;
    for (const tok of m[1].trim().split(/\s+/)) {
      if (tok.startsWith("-")) {
        if (tok === "-A" || tok === "--all") wild.push(tok);
        continue;
      }
      if (tok === "." || tok === "*") { wild.push(tok); continue; }
      paths.push(tok);
    }
  }
  return { paths: [...new Set(paths)], wild: [...new Set(wild)] };
}

/* ── the check ───────────────────────────────────────────────────────────────── */

export function check(policy, files) {
  const problems = [];
  const P = (s) => problems.push(s);

  const classes = new Map((policy.classes ?? []).map((c) => [c.id, c]));
  if (!classes.size) P("policy declares no classes");

  const declared = new Map();
  for (const w of policy.workflows ?? []) {
    if (!w?.file) { P("a workflows[] row has no file"); continue; }
    if (declared.has(w.file)) P(`${w.file}: declared twice`);
    declared.set(w.file, w);
  }

  const onDisk = new Set(files.keys());
  for (const f of onDisk) if (!declared.has(f)) P(`${f}: runs in this repo but is not declared in policies/autonomy.yaml`);
  for (const f of declared.keys()) if (!onDisk.has(f)) P(`${f}: declared in the policy but no such workflow exists`);

  // Every action's class must be a real class.
  for (const a of policy.actions ?? []) {
    if (!classes.has(a?.class)) P(`actions/${a?.id}: unknown class "${a?.class}"`);
  }

  for (const [file, w] of declared) {
    if (!onDisk.has(file)) continue;
    const src = files.get(file);
    const cls = classes.get(w.class);
    if (!cls) { P(`${file}: unknown class "${w.class}"`); continue; }
    if (cls.no_workflow) { P(`${file}: classified "${w.class}" — no workflow may be classified ${w.class}`); continue; }

    const got = readPermissions(src);
    if (got.missing) {
      P(`${file}: no top-level "permissions:" block — it runs on the repository default, which is an unknown permission set`);
      continue;
    }
    if (got.unreadable) {
      P(`${file}: could not read permissions (${got.unreadable}) — unreadable is a failure, not a pass`);
      continue;
    }
    if (got.perms["*"]) {
      P(`${file}: uses the ${got.form === "shorthand" ? "read-all/write-all" : "wildcard"} shorthand — name each scope instead`);
      continue;
    }

    const want = w.permissions ?? {};
    const allowed = cls.allowed_permissions ?? {};

    for (const [scope, level] of Object.entries(got.perms)) {
      if (!(scope in want)) P(`${file}: requests "${scope}: ${level}" which the policy does not declare`);
      else if (want[scope] !== level) P(`${file}: requests "${scope}: ${level}" but the policy says "${scope}: ${want[scope]}"`);
      const cap = allowed[scope];
      if (cap === undefined) P(`${file}: class ${w.class} does not allow the "${scope}" scope at all`);
      else if ((LEVEL[level] ?? 99) > (LEVEL[cap] ?? 0)) P(`${file}: requests "${scope}: ${level}" but class ${w.class} allows at most "${cap}"`);
    }
    for (const scope of Object.keys(want)) {
      if (!(scope in got.perms)) P(`${file}: the policy declares "${scope}: ${want[scope]}" but the workflow does not request it`);
    }

    // Writes to the repository must be spelled out, path by path.
    const writesRepo = got.perms.contents === "write";
    const allow = w.writes ?? null;
    if (writesRepo && cls.requires_write_paths && !allow) {
      P(`${file}: holds "contents: write" but declares no "writes:" path allowlist`);
    }
    if (allow && !writesRepo) {
      P(`${file}: declares a "writes:" allowlist but does not hold "contents: write"`);
    }
    const { paths, wild } = readWrittenPaths(src);
    for (const w2 of wild) P(`${file}: stages with "git add ${w2}" — an unbounded write cannot be classified green`);
    if (allow) {
      for (const path of paths) {
        if (!allow.includes(path)) P(`${file}: stages "${path}", which is not in its declared writes: allowlist`);
      }
    } else if (paths.length) {
      P(`${file}: stages ${paths.map((p) => `"${p}"`).join(", ")} with no declared writes: allowlist`);
    }
  }

  // Prohibited patterns, anywhere in any workflow.
  for (const pr of policy.prohibitions ?? []) {
    let re;
    try { re = new RegExp(pr.pattern); }
    catch { P(`prohibitions/${pr.id}: not a valid regular expression`); continue; }
    for (const [file, src] of files) {
      src.split("\n").forEach((line, i) => {
        if (/^\s*#/.test(line)) return;             // a comment describing it is not doing it
        if (re.test(line)) P(`${file}:${i + 1}: prohibited "${pr.id}" (${pr.action}): ${line.trim()}`);
      });
    }
  }

  return problems;
}

export function loadWorkflows(dir = WF_DIR) {
  const files = new Map();
  for (const f of readdirSync(dir).sort()) {
    if (!/\.ya?ml$/.test(f)) continue;
    files.set(f, readFileSync(join(dir, f), "utf8"));
  }
  return files;
}

export const loadPolicy = (p = join(ROOT, "policies", "autonomy.yaml")) => parseYaml(readFileSync(p, "utf8"));

/* ── cli ─────────────────────────────────────────────────────────────────────── */

function main(argv) {
  const policy = loadPolicy();
  const files = loadWorkflows();

  const byClass = {};
  for (const w of policy.workflows ?? []) (byClass[w.class] ??= []).push(w);
  const counts = Object.entries(byClass).map(([c, ws]) => `${ws.length} ${c}`).join(" · ");
  console.log(`autonomy-check: ${files.size} workflow(s) on disk · ${counts} declared · ` +
    `${(policy.actions ?? []).length} action(s) classified · ${(policy.prohibitions ?? []).length} prohibition(s)`);

  const writers = (policy.workflows ?? []).filter((w) => w.writes?.length);
  console.log(`\nRuns unattended and writes to the repository — the whole list:`);
  if (!writers.length) console.log("  (none)");
  for (const w of writers) console.log(`  ${w.file} → ${w.writes.join(", ")}`);

  if (argv.includes("--list")) return 0;

  const problems = check(policy, files);
  if (problems.length) {
    console.error(`\n✗ ${problems.length} autonomy violation(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`\n✓ every workflow is declared, least-privileged, and inside its class.`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("autonomy-check.mjs")) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    if (e instanceof ManifestError) { console.error(`✗ policies/autonomy.yaml: ${e.message}`); process.exit(1); }
    throw e;
  }
}
