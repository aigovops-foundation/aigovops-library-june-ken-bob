import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildLibraryIndex, serializeLibraryIndex } from "../scripts/build-library-index.mjs";

const KEYS = ["t", "s", "ty", "g", "lv", "fw", "c", "k", "u", "m"];
const TYPES = new Set(["Case", "Worksheet", "Tool", "Guide", "Demo", "Plan", "Process"]);
const LIBRARY_URL = "https://community.aigovops-foundation.com/library/";
const corpus = JSON.parse(readFileSync(new URL("../docs/data/verified-harms-2026-W24.json", import.meta.url), "utf8"));
const sourceCases = Array.isArray(corpus) ? corpus : Object.values(corpus).find(Array.isArray);
const records = buildLibraryIndex();

test("the Library index contains at least 170 source-derived records", () => {
  assert.ok(records.length >= 170, `got ${records.length}`);
});

test("every record has the compact schema and the correct field types", () => {
  for (const [index, item] of records.entries()) {
    assert.deepEqual(Object.keys(item).sort(), [...KEYS].sort(), `record ${index}`);
    for (const key of ["t", "s", "ty", "g", "lv", "c", "k", "u"]) {
      assert.equal(typeof item[key], "string", `record ${index}.${key}`);
    }
    assert.ok(Array.isArray(item.fw), `record ${index}.fw`);
    assert.ok(item.fw.every((framework) => typeof framework === "string"), `record ${index}.fw items`);
    assert.equal(typeof item.m, "boolean", `record ${index}.m`);
    assert.ok(TYPES.has(item.ty), `record ${index}.ty: ${item.ty}`);
    assert.ok(item.u.startsWith("https://"), `record ${index}.u: ${item.u}`);
  }
});

test("case deep links retain all 100 unique harm-case IDs", () => {
  const ids = records.filter((item) => item.ty === "Case").map((item) => {
    assert.match(item.u, /f-ai-friday\.html\?id=VH-/u);
    return new URL(item.u).searchParams.get("id");
  });
  assert.equal(ids.length, 100);
  assert.equal(new Set(ids).size, 100);
});

test("a case with more than three frameworks retains every normalized tag", () => {
  const source = sourceCases.find(({ frameworks = [] }) =>
    frameworks.length > 3 && frameworks.some((framework) => String(framework).startsWith("ISO")));
  assert.ok(source, "expected a source case with more than three frameworks including ISO");
  const item = records.find((record) =>
    record.ty === "Case" && new URL(record.u).searchParams.get("id") === source.id);
  assert.ok(item, `missing case ${source.id}`);
  const expected = source.frameworks.map((framework) =>
    String(framework).split(/\s*\(/u)[0].trim().slice(0, 30));
  assert.deepEqual(item.fw, expected);
  assert.ok(item.fw.some((framework) => framework.startsWith("ISO/IEC 42001")));
});

test("members-only pages keep their public description so topic search finds them", () => {
  const membersOnly = records.filter((item) => item.m);
  assert.ok(membersOnly.length > 0);
  assert.ok(!records.some((item) => item.s === "Members-only Library page — sign in to read."));
  const controlPlane = membersOnly.find((item) => item.u.endsWith("control-plane.html"));
  assert.ok(controlPlane);
  assert.match(controlPlane.s, /sandbox/iu);
});

test("tools exclude empty repos and use an available Pages URL", () => {
  const tools = records.filter((item) => item.ty === "Tool");
  assert.ok(!tools.some((item) => item.t === "aigovops-old"));
  assert.equal(
    tools.find((item) => item.t === "aigovops-foundation-site-redesign-June2026-ken-and-bob")?.u,
    "https://www.aigovops-foundation.com",
  );
  assert.equal(
    tools.find((item) => item.t === "aigovops-library-june-ken-bob")?.u,
    LIBRARY_URL,
  );
});

test("the front door and search pages are not Library content records", () => {
  for (const page of ["front-door.html", "find.html"]) {
    assert.ok(!records.some((item) => item.u.endsWith(`/library/${page}`)));
  }
});

test("building the same inputs twice produces byte-identical JSON", () => {
  assert.equal(serializeLibraryIndex(buildLibraryIndex()), serializeLibraryIndex(buildLibraryIndex()));
});
