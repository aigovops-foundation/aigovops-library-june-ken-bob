#!/usr/bin/env node

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml } from "./estate-manifest.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "docs", "data", "library.json");
const LIBRARY_URL = "https://community.aigovops-foundation.com/library/";
const GITHUB_URL = "https://github.com/aigovops-foundation/";
const LEVELS = [
  ["100-begin", "Begin", "Pre-pend"],
  ["200-retrofit", "Retrofit", "Policy"],
  ["300-hold", "Hold", "Operate"],
  ["400-prove", "Prove", "Audit"],
];
const TYPES = new Set(["Case", "Worksheet", "Tool", "Guide", "Demo", "Plan", "Process"]);

const record = (fields) => ({
  t: "",
  s: "",
  ty: "",
  g: "",
  lv: "",
  fw: [],
  c: "",
  k: "",
  u: "",
  m: false,
  ...fields,
});

function trimAtWord(text, max) {
  const value = String(text ?? "").trim();
  if (value.length <= max) return value;
  return value.slice(0, max).replace(/\s+\S*$/u, "").trim();
}

function caseSummary(text) {
  const value = String(text ?? "").trim();
  if (value.length <= 170) return value;
  return `${trimAtWord(value, 170).replace(/[,;:]+$/u, "").trim()}…`;
}

function boundedDescription(text) {
  return String(text ?? "").trim().slice(0, 160);
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_match, hex, decimal) =>
      String.fromCodePoint(Number.parseInt(hex ?? decimal, hex ? 16 : 10)));
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gu)) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return result;
}

function pageMetadata(file) {
  const html = readFileSync(join(ROOT, "docs", file), "utf8");
  const title = decodeEntities(/<title\b[^>]*>([\s\S]*?)<\/title>/iu.exec(html)?.[1] ?? "")
    .replace(/<[^>]*>/gu, "")
    .trim()
    .replace(/^AiGovOps Library — /u, "")
    .replace(/^AiGovOps — /u, "")
    .replace(/\s+(?:— AiGovOps[^|·]*|\|[^|]*|· AiGovOps.*)$/u, "")
    .trim();
  const descriptionTag = html.match(/<meta\b[^>]*>/giu)?.find((tag) =>
    attributes(tag).name?.toLowerCase() === "description");
  const description = decodeEntities(attributes(descriptionTag ?? "").content ?? "").trim();
  const name = file.toLowerCase();
  const type = /demo|watch|tour/u.test(name)
    ? "Demo"
    : /plan|tickets|blueprint|control|durability|board|pulse|health|design-book|auto-running/u.test(name)
      ? "Plan"
      : "Guide";

  return { title, description: boundedDescription(description), type };
}

function toolsFromEstate() {
  const estate = parseYaml(readFileSync(join(ROOT, "estate.yaml"), "utf8"));
  return (estate.repos ?? [])
    .filter((repo) => repo.account === "aigovops-foundation")
    .filter((repo) => !/^Empty/iu.test(String(repo.role ?? "")))
    .filter((repo) => !repo.archived && !repo.retired &&
      !["archived", "retired", "keep-separate"].includes(String(repo.disposition ?? "").toLowerCase()) &&
      !["archived", "retired", "keep-separate"].includes(String(repo.status ?? "").toLowerCase()))
    .map((repo) => {
      const purpose = repo.description ?? repo.purpose ?? repo.role ?? "";
      const page = repo.pages_url;
      const url = typeof page === "string" && /^https?:\/\//iu.test(page)
        ? page
        : `https://github.com/${repo.account}/${repo.id}`;
      return record({
        t: repo.id,
        s: boundedDescription(purpose),
        ty: "Tool",
        u: url,
      });
    });
}

export function buildLibraryIndex() {
  const corpus = JSON.parse(readFileSync(join(ROOT, "docs", "data", "verified-harms-2026-W24.json"), "utf8"));
  const cases = Array.isArray(corpus) ? corpus : Object.values(corpus).find(Array.isArray);
  if (!Array.isArray(cases)) throw new Error("verified-harms corpus has no case list");

  const records = cases.map((item) => record({
    t: `${item.org} (${item.year})`,
    s: caseSummary(item.incident),
    ty: "Case",
    fw: (item.frameworks ?? []).slice(0, 3)
      .map((framework) => String(framework).split(/\s*\(/u)[0].trim().slice(0, 30)),
    c: item.country ?? "",
    k: item.gate ?? "",
    u: `${LIBRARY_URL}f-ai-friday.html#${item.id}`,
  }));

  const pages = readdirSync(join(ROOT, "docs"))
    .filter((file) => file.endsWith(".html") && file !== "find.html" && file !== "front-door.html")
    .sort()
    .map((file) => {
      const page = pageMetadata(file);
      return record({
        t: page.title,
        s: page.description,
        ty: page.type,
        u: `${LIBRARY_URL}${file}`,
        m: true,
      });
    });

  const worksheets = LEVELS.flatMap(([key, name, gate]) => {
    const level = key.slice(0, 3);
    const makeWorksheet = (spanish) => record({
      t: `Worksheet ${level} ${name}${spanish ? " (ES)" : ""}`,
      s: "One hour on a real case: a rule in your own words, a signed receipt, then Thursday.",
      ty: "Worksheet",
      g: gate,
      lv: level,
      u: spanish
        ? `https://github.com/aigovops-foundation/practice/tree/main/docs/es/levels/${key}`
        : `https://github.com/aigovops-foundation/practice/tree/main/levels/${key}`,
    });
    return [makeWorksheet(false), makeWorksheet(true)];
  });

  const processes = readdirSync(join(ROOT, "plan", "processes"))
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => {
      const markdown = readFileSync(join(ROOT, "plan", "processes", file), "utf8");
      const heading = /^# (.+)$/mu.exec(markdown)?.[1] ?? "";
      return record({
        t: heading.replace(/^Process — /u, "").slice(0, 80),
        s: "How the Foundation runs this, step by step.",
        ty: "Process",
        u: `${GITHUB_URL}aigovops-library-june-ken-bob/blob/main/plan/processes/${file}`,
      });
    });

  const result = [...records, ...pages, ...worksheets, ...toolsFromEstate(), ...processes];
  for (const item of result) {
    if (!TYPES.has(item.ty)) throw new Error(`unknown Library record type: ${item.ty}`);
  }
  return result;
}

export function serializeLibraryIndex(records = buildLibraryIndex()) {
  return `${JSON.stringify(records)}\n`;
}

function main(argv) {
  const expected = serializeLibraryIndex();
  if (argv.includes("--check")) {
    let actual;
    try {
      actual = readFileSync(OUTPUT, "utf8");
    } catch {
      console.error("library-index: docs/data/library.json is missing; run npm run library:index");
      return 1;
    }
    if (actual !== expected) {
      console.error("library-index: docs/data/library.json differs from a fresh build");
      return 1;
    }
    console.log(`library-index: checked ${buildLibraryIndex().length} records`);
    return 0;
  }

  writeFileSync(OUTPUT, expected);
  const counts = {};
  for (const item of buildLibraryIndex()) counts[item.ty] = (counts[item.ty] ?? 0) + 1;
  console.log(`library-index: wrote ${Object.values(counts).reduce((sum, count) => sum + count, 0)} records (${Object.entries(counts).map(([type, count]) => `${count} ${type}`).join(" · ")})`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("build-library-index.mjs")) {
  process.exit(main(process.argv.slice(2)));
}
