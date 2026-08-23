// Tests for scripts/repo-move.mjs — the half of a repository move a machine may do.
//
// The distinction the whole script turns on is link-vs-iframe: an <a href> can be repointed at a
// github.com URL ahead of a rename, an iframe cannot, because GitHub sends X-Frame-Options: deny
// and the panel renders BLANK. A silent blank is worse than a 404 — nobody reports it. So the
// tests below are mostly about that classification staying honest.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanReferences, remoteHead } from "../scripts/repo-move.mjs";

const OLD = "https://bobrapp.github.io/Aigovops-Foundation-Open-Source-V4-10k/";

function fakeRoot({ index, onboarding }) {
  const root = mkdtempSync(join(tmpdir(), "move-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "docs", "index.html"), index);
  writeFileSync(join(root, "docs", "onboarding.html"), onboarding);
  return root;
}

test("a reference that is gone is not reported", () => {
  const root = fakeRoot({ index: "<a href='https://github.com/x/y'>ok</a>", onboarding: "no url here" });
  assert.deepEqual(scanReferences(root), []);
});

test("the iframe reference is reported as a blocker, the link is not", () => {
  const root = fakeRoot({ index: `<a href="${OLD}">card</a>`, onboarding: `src:"${OLD}"` });
  const found = scanReferences(root);
  assert.equal(found.length, 2);
  assert.equal(found.find((r) => r.file === "docs/index.html").blocker, false);
  assert.equal(found.find((r) => r.file === "docs/onboarding.html").blocker, true);
});

test("only the iframe remains outstanding in the real repo — the link was repointed in #67", () => {
  const found = scanReferences();
  assert.deepEqual(found.map((r) => r.file), ["docs/onboarding.html"]);
  assert.equal(found[0].blocker, true, "and it is still classed a blocker");
});

test("the blocker really is an iframe src, not a link — the classification is not just a label", () => {
  const html = readFileSync(new URL("../docs/onboarding.html", import.meta.url), "utf8");
  assert.match(html, new RegExp(`src:\\s*"${OLD.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}"`),
    "onboarding must reference the old URL as a scene src");
  assert.match(html, /<iframe id="frame"/, "and those scene srcs must be loaded into an iframe");
});

test("remoteHead returns null for a slug that does not exist, rather than throwing", () => {
  assert.equal(remoteHead("aigovops-foundation/definitely-not-a-real-repo-x9"), null);
});
