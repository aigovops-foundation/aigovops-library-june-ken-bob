import test from "node:test";
import assert from "node:assert/strict";
import { partitionRepos, buildRepoMatrix } from "../scripts/estate-repos.mjs";
import { load } from "../scripts/estate-manifest.mjs";

const row = (over = {}) => ({ id: "x", account: "aigovops-foundation", role: "A product", visibility: "public", disposition: "keep-separate", verified: true, ...over });

test("an active public Foundation repo is watched", () => {
  const { included, excluded } = partitionRepos([row()]);
  assert.equal(included.length, 1); assert.equal(excluded.length, 0);
});

test("a retired or empty repo is excluded and says why", () => {
  const { excluded } = partitionRepos([row({ disposition: "retired" }), row({ id: "y", role: "Empty. Held the name." })]);
  assert.equal(excluded.length, 2);
  for (const e of excluded) assert.match(e.why, /retired or empty/);
});

test("unknown visibility is excluded — record it first, do not guess", () => {
  const { excluded } = partitionRepos([row({ visibility: "unknown" })]);
  assert.equal(excluded.length, 1); assert.match(excluded[0].why, /visibility/);
});

test("a personal-account repo is excluded", () => {
  const { excluded } = partitionRepos([row({ account: "bobrapp" })]);
  assert.equal(excluded.length, 1); assert.match(excluded[0].why, /personal-account/);
});

test("watch: false opts a row out, carrying its note", () => {
  const { excluded } = partitionRepos([row({ watch: false, watch_note: "no Actions here" })]);
  assert.equal(excluded[0].why, "no Actions here");
});

test("every excluded repo is NAMED as owner/repo", () => {
  const { excluded } = partitionRepos([row({ visibility: "unknown" })]);
  assert.equal(excluded[0].repo, "aigovops-foundation/x");
});

test("the matrix shape is what fromJSON + strategy.matrix expects", () => {
  const { matrix } = buildRepoMatrix([row()]);
  assert.deepEqual(matrix, { include: [{ name: "x", repository: "aigovops-foundation/x" }] });
});

test("the committed manifest yields a non-empty matrix that includes this repo and the site", () => {
  const { matrix } = buildRepoMatrix(load().repos);
  const repos = matrix.include.map((r) => r.repository);
  assert.ok(repos.includes("aigovops-foundation/aigovops-library-june-ken-bob"));
  assert.ok(repos.includes("aigovops-foundation/aigovops-foundation-site-redesign-June2026-ken-and-bob"));
  assert.ok(repos.length >= 8, `only ${repos.length} repos watched`);
});
