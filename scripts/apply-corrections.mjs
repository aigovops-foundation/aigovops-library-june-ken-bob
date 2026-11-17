#!/usr/bin/env node
// scripts/apply-corrections.mjs
//
// The signed verified-harms batch is never edited. Corrections live beside it in
// docs/data/corrections-<batch>.json, and this script applies them to produce the copy
// every page reads: docs/data/verified-harms-current.json, plus the case list embedded
// in docs/f-ai-friday.html.
//
//   node scripts/apply-corrections.mjs          # write the corrected copy and the page
//   node scripts/apply-corrections.mjs --check  # fail if either is out of date (CI)
//
// It refuses to run when the batch's hash differs from the corrections file or the
// archive manifest, when a correction's old value does not match the batch exactly,
// or when the manifest's record of the corrections file is stale.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "docs", "data");
const BATCH_FILE = "verified-harms-2026-W24.json";
const CORRECTIONS_FILE = "corrections-2026-W24.json";
const CURRENT_FILE = "verified-harms-current.json";
const PAGE = join(ROOT, "docs", "f-ai-friday.html");
const CASES_LINE = /^(\s*const CASES = )(\[.*\]);$/m;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function fail(message) {
  console.error(`apply-corrections: ${message}`);
  process.exit(1);
}

// The page embeds the cases in the spacing Python's json.dumps used when it was built
// (", " and ": ", no indent, non-ASCII kept). Matching it keeps diffs to real changes.
export function pageJson(value) {
  if (Array.isArray(value)) return `[${value.map(pageJson).join(", ")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${pageJson(item)}`).join(", ")}}`;
  }
  return JSON.stringify(value);
}

export function applyCorrections(batch, corrections) {
  const cases = structuredClone(batch.cases);
  const byId = new Map(cases.map((item) => [item.id, item]));
  const touched = new Set();

  corrections.corrections.forEach((fix, index) => {
    const where = `correction ${index + 1} (${fix.id}, ${fix.op})`;
    const item = byId.get(fix.id);
    if (!item) fail(`${where}: no case ${fix.id} in the batch`);
    const sources = item.source;

    switch (fix.op) {
      case "replace_source": {
        const at = sources.indexOf(fix.from);
        if (at === -1 || sources.lastIndexOf(fix.from) !== at) fail(`${where}: source not found exactly once`);
        if (sources.includes(fix.to)) fail(`${where}: replacement is already a source`);
        sources[at] = fix.to;
        break;
      }
      case "add_source":
        if (sources.includes(fix.to)) fail(`${where}: already a source`);
        sources.push(fix.to);
        break;
      case "remove_source": {
        const at = sources.indexOf(fix.from);
        if (at === -1) fail(`${where}: source not found`);
        sources.splice(at, 1);
        if (sources.length === 0) fail(`${where}: would leave the case with no source`);
        break;
      }
      case "set":
        if (!same(item[fix.field], fix.from)) fail(`${where}: ${fix.field} does not match the old value`);
        item[fix.field] = fix.to;
        break;
      case "replace_text": {
        const text = String(item[fix.field] ?? "");
        const at = text.indexOf(fix.from);
        if (at === -1 || text.lastIndexOf(fix.from) !== at) fail(`${where}: text not found exactly once in ${fix.field}`);
        item[fix.field] = text.slice(0, at) + fix.to + text.slice(at + fix.from.length);
        break;
      }
      default:
        fail(`${where}: unknown op`);
    }
    touched.add(fix.id);
  });

  for (const id of touched) byId.get(id).corrected_on = corrections.issued;
  return { cases, touched };
}

export function build() {
  const batchBytes = readFileSync(join(DATA, BATCH_FILE));
  const correctionsBytes = readFileSync(join(DATA, CORRECTIONS_FILE));
  const batch = JSON.parse(batchBytes.toString("utf8"));
  const corrections = JSON.parse(correctionsBytes.toString("utf8"));
  const manifest = JSON.parse(readFileSync(join(DATA, "archive-manifest.json"), "utf8"));

  const batchHash = sha256(batchBytes);
  if (batchHash !== corrections.applies_to_sha256) fail(`${BATCH_FILE} hash ${batchHash} is not the one ${CORRECTIONS_FILE} corrects`);
  const record = manifest.batches.find((entry) => entry.batch === batch.batch);
  if (!record || record.sha256 !== batchHash) fail(`${BATCH_FILE} no longer matches its signed hash in archive-manifest.json`);
  const listed = (record.corrections ?? []).find((entry) => entry.file === `docs/data/${CORRECTIONS_FILE}`);
  if (!listed || listed.sha256 !== sha256(correctionsBytes)) fail(`archive-manifest.json does not record the current ${CORRECTIONS_FILE} hash`);

  const { cases, touched } = applyCorrections(batch, corrections);
  const current = {
    ...batch,
    name: `${batch.name} (with corrections)`,
    based_on: { file: BATCH_FILE, sha256: batchHash },
    corrections: {
      file: CORRECTIONS_FILE,
      sha256: sha256(correctionsBytes),
      issued: corrections.issued,
      count: corrections.corrections.length,
      cases: [...touched].sort(),
    },
    cases,
  };
  const currentText = `${JSON.stringify(current, null, 2)}\n`;

  const page = readFileSync(PAGE, "utf8");
  if (!CASES_LINE.test(page)) fail("docs/f-ai-friday.html has no single-line `const CASES = [...]`");
  const pageText = page.replace(CASES_LINE, (_match, lead) => `${lead}${pageJson(cases)};`);
  return { currentText, pageText, touched };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { currentText, pageText, touched } = build();
  const currentPath = join(DATA, CURRENT_FILE);
  if (process.argv.includes("--check")) {
    let stale = [];
    try { if (readFileSync(currentPath, "utf8") !== currentText) stale.push(`docs/data/${CURRENT_FILE}`); }
    catch { stale.push(`docs/data/${CURRENT_FILE} (missing)`); }
    if (readFileSync(PAGE, "utf8") !== pageText) stale.push("docs/f-ai-friday.html");
    if (stale.length) fail(`out of date, run node scripts/apply-corrections.mjs: ${stale.join(", ")}`);
    console.log(`apply-corrections: up to date (${touched.size} corrected cases)`);
  } else {
    writeFileSync(currentPath, currentText);
    writeFileSync(PAGE, pageText);
    console.log(`apply-corrections: wrote docs/data/${CURRENT_FILE} and docs/f-ai-friday.html (${touched.size} corrected cases)`);
  }
}
