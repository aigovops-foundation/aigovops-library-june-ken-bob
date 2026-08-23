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

// These two ran the other way until 2026-08-23: they asserted the iframe blocker was still
// outstanding. The move happened, --apply cleared it, and they failed — which is what a guard
// tied to a fact is supposed to do at the moment the fact changes. They now hold the post-move
// state, so a regression that reintroduces the dead URL fails just as loudly.
test("no reference to the old Pages URL survives — the move is complete", () => {
  assert.deepEqual(scanReferences(), [],
    "if this fails, something reintroduced a URL that GitHub no longer serves");
});

test("the onboarding scene points at the new Pages site, and still loads it in an iframe", () => {
  const html = readFileSync(new URL("../docs/onboarding.html", import.meta.url), "utf8");
  assert.ok(!html.includes(OLD), "the retired Pages URL must be gone");
  assert.match(html, /src:"https:\/\/aigovops-foundation\.github\.io\/aigovops\/"/,
    "the v4 scene should load the repository's new Pages site");
  assert.match(html, /<iframe id="frame"/,
    "and it is still an iframe — which is why it could never have taken a github.com URL");
});

test("remoteHead returns null for a slug that does not exist, rather than throwing", () => {
  assert.equal(remoteHead("aigovops-foundation/definitely-not-a-real-repo-x9"), null);
});
