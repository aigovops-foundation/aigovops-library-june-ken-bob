import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLibraryIndex, serializeLibraryIndex } from "../scripts/build-library-index.mjs";

const KEYS = ["t", "s", "ty", "g", "lv", "fw", "c", "k", "u", "m"];
const TYPES = new Set(["Case", "Worksheet", "Tool", "Guide", "Demo", "Plan", "Process"]);
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

test("the 100 harm-case anchors are unique", () => {
  const anchors = records.filter((item) => item.ty === "Case").map((item) => new URL(item.u).hash);
  assert.equal(anchors.length, 100);
  assert.equal(new Set(anchors).size, 100);
});

test("tools exclude empty repos and use an available Pages URL", () => {
  const tools = records.filter((item) => item.ty === "Tool");
  assert.ok(!tools.some((item) => item.t === "aigovops-old"));
  assert.equal(
    tools.find((item) => item.t === "aigovops-foundation-site-redesign-June2026-ken-and-bob")?.u,
    "https://www.aigovops-foundation.com",
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
