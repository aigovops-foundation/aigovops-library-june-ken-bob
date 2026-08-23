// Tests for scripts/autonomy-check.mjs — the enforcer for policies/autonomy.yaml.
//
// The checks that matter are the ones that FAIL. A gate that only ever passes is indistinguishable
// from no gate, and this repo has already been bitten by exactly that: a backup job green for
// weeks while copying nothing, a CI lint that "proved" no ungated effects existed and never ran.
// So every rule below is tested by constructing the violation and asserting it is caught.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readPermissions, readWrittenPaths, readUses, check, loadPolicy, loadWorkflows } from "../scripts/autonomy-check.mjs";

/* ── reading a workflow's permissions ─────────────────────────────────────────── */

test("reads the flow spelling, the block spelling, and comments after a value", () => {
  assert.deepEqual(readPermissions("on: push\npermissions: { contents: read, pages: write }\n").perms,
    { contents: "read", pages: "write" });
  assert.deepEqual(readPermissions("on: push\npermissions:\n  contents: write   # commit the board\n  issues: write\njobs:\n").perms,
    { contents: "write", issues: "write" });
  assert.deepEqual(readPermissions("permissions: {}\n").perms, {});
});

test("a missing permissions block is reported as missing, not as empty", () => {
  const got = readPermissions("name: x\non: [push]\njobs:\n  a:\n    runs-on: ubuntu-latest\n");
  assert.equal(got.missing, true);
  assert.equal(got.perms, undefined, "an absent block must never read as 'no permissions requested'");
});

test("shorthands and anything unreadable are surfaced rather than guessed at", () => {
  assert.deepEqual(readPermissions("permissions: read-all\n").perms, { "*": "read" });
  assert.deepEqual(readPermissions("permissions: write-all\n").perms, { "*": "write" });
  assert.ok(readPermissions("permissions: {\n  contents: read\n}\n").unreadable);
  assert.ok(readPermissions("permissions: something-else\n").unreadable);
});

test("finds every staged path, and flags unbounded staging", () => {
  const r = readWrittenPaths('  run: |\n    git add docs/a.json docs/.b\n    git commit -m x\n');
  assert.deepEqual(r.paths, ["docs/a.json", "docs/.b"]);
  assert.deepEqual(r.wild, []);
  assert.deepEqual(readWrittenPaths("git add -A\n").wild, ["-A"]);
  assert.deepEqual(readWrittenPaths("git add .\n").wild, ["."]);
  assert.deepEqual(readWrittenPaths("# git add docs/x\n").paths, [], "a comment is not an action");
});

/* ── the policy engine ────────────────────────────────────────────────────────── */

const POLICY = () => ({
  classes: [
    { id: "green", unattended: true, requires_write_paths: true,
      allowed_permissions: { contents: "write", issues: "write", actions: "read" } },
    { id: "yellow", unattended: false, requires_write_paths: false,
      allowed_permissions: { contents: "read", "pull-requests": "write" } },
    { id: "red", no_workflow: true, allowed_permissions: null },
  ],
  actions: [{ id: "crawl", class: "green" }],
  workflows: [{ file: "a.yml", class: "green", permissions: { contents: "read" } }],
  prohibitions: [{ id: "force-push", pattern: "git push (--force|-f)\\b", action: "force-push-or-rewrite-history" }],
});
const FILES = (extra = {}) => new Map(Object.entries({ "a.yml": "permissions: { contents: read }\n", ...extra }));
const joined = (p, f) => check(p, f).join("\n");

test("a matching policy and workflow set is clean", () => {
  assert.deepEqual(check(POLICY(), FILES()), []);
});

test("catches automation nobody classified — in both directions", () => {
  assert.match(joined(POLICY(), FILES({ "sneaky.yml": "permissions: { contents: read }\n" })),
    /sneaky\.yml: runs in this repo but is not declared/);
  const p = POLICY();
  p.workflows.push({ file: "ghost.yml", class: "green", permissions: { contents: "read" } });
  assert.match(joined(p, FILES()), /ghost\.yml: declared in the policy but no such workflow exists/);
});

test("catches a workflow with no permissions block — an inherited default is unknown", () => {
  assert.match(joined(POLICY(), FILES({ "a.yml": "on: [push]\njobs: {}\n" })),
    /a\.yml: no top-level "permissions:" block/);
});

test("catches unreadable permissions rather than passing them", () => {
  assert.match(joined(POLICY(), FILES({ "a.yml": "permissions: surprise\n" })), /could not read permissions/);
});

test("catches the read-all/write-all shorthand", () => {
  assert.match(joined(POLICY(), FILES({ "a.yml": "permissions: write-all\n" })), /shorthand.*name each scope/s);
});

test("catches a permission the policy never declared, and one it declared but the file omits", () => {
  assert.match(joined(POLICY(), FILES({ "a.yml": "permissions: { contents: read, issues: write }\n" })),
    /requests "issues: write" which the policy does not declare/);
  assert.match(joined(POLICY(), FILES({ "a.yml": "permissions: {}\n" })),
    /the policy declares "contents: read" but the workflow does not request it/);
});

test("catches a level the file and the policy disagree on", () => {
  assert.match(joined(POLICY(), FILES({ "a.yml": "permissions: { contents: write }\n" })),
    /requests "contents: write" but the policy says "contents: read"/);
});

test("catches a class asking for more than its class allows", () => {
  const p = POLICY();
  p.workflows[0] = { file: "a.yml", class: "yellow", permissions: { contents: "write" } };
  assert.match(joined(p, FILES({ "a.yml": "permissions: { contents: write }\n" })),
    /class yellow allows at most "read"/);
});

test("catches a scope the class does not permit at all", () => {
  const p = POLICY();
  p.workflows[0] = { file: "a.yml", class: "green", permissions: { "id-token": "write" } };
  assert.match(joined(p, FILES({ "a.yml": "permissions: { id-token: write }\n" })),
    /class green does not allow the "id-token" scope at all/);
});

test("a workflow may not be classified red", () => {
  const p = POLICY();
  p.workflows[0] = { file: "a.yml", class: "red", permissions: {} };
  assert.match(joined(p, FILES()), /no workflow may be classified red/);
});

test("catches an action classified under a class that does not exist", () => {
  const p = POLICY();
  p.actions.push({ id: "mystery", class: "chartreuse" });
  assert.match(joined(p, FILES()), /actions\/mystery: unknown class "chartreuse"/);
});

/* ── writes to the repository ─────────────────────────────────────────────────── */

test("contents: write with no declared path allowlist is a violation", () => {
  const p = POLICY();
  p.workflows[0] = { file: "a.yml", class: "green", permissions: { contents: "write" } };
  assert.match(joined(p, FILES({ "a.yml": "permissions: { contents: write }\n" })),
    /holds "contents: write" but declares no "writes:" path allowlist/);
});

test("staging a path outside the allowlist is a violation", () => {
  const p = POLICY();
  p.workflows[0] = { file: "a.yml", class: "green", permissions: { contents: "write" }, writes: ["docs/ok.json"] };
  const src = "permissions: { contents: write }\nrun: git add docs/ok.json plan/secret-plans.md\n";
  assert.match(joined(p, FILES({ "a.yml": src })), /stages "plan\/secret-plans\.md", which is not in its declared writes: allowlist/);
});

test("unbounded staging can never be green, allowlist or not", () => {
  const p = POLICY();
  p.workflows[0] = { file: "a.yml", class: "green", permissions: { contents: "write" }, writes: ["docs/ok.json"] };
  assert.match(joined(p, FILES({ "a.yml": "permissions: { contents: write }\nrun: git add -A\n" })),
    /an unbounded write cannot be classified green/);
});

test("staging anything at all with no allowlist is a violation", () => {
  assert.match(joined(POLICY(), FILES({ "a.yml": "permissions: { contents: read }\nrun: git add docs/x\n" })),
    /stages "docs\/x" with no declared writes: allowlist/);
});

/* ── prohibitions ─────────────────────────────────────────────────────────────── */

test("catches a prohibited action, and does not fire on a comment describing one", () => {
  assert.match(joined(POLICY(), FILES({ "a.yml": "permissions: { contents: read }\nrun: git push --force\n" })),
    /prohibited "force-push" \(force-push-or-rewrite-history\)/);
  assert.deepEqual(check(POLICY(), FILES({ "a.yml": "permissions: { contents: read }\n# never run git push --force here\n" })), []);
});

/* ── supply chain ─────────────────────────────────────────────────────────────── */

const SC = () => {
  const p = POLICY();
  p.supply_chain = { require_sha_pins: true, first_party_prefixes: ["./", "aigovops-foundation/aigovops-library-june-ken-bob/"] };
  return p;
};

test("catches a third-party action pinned to a mutable tag", () => {
  assert.match(joined(SC(), FILES({ "a.yml": "permissions: { contents: read }\n  - uses: actions/checkout@v4\n" })),
    /"actions\/checkout@v4" is pinned to a mutable ref/);
});

test("catches a short SHA, which is not immutable enough", () => {
  assert.match(joined(SC(), FILES({ "a.yml": "permissions: { contents: read }\n  - uses: actions/checkout@11d5960\n" })),
    /pinned to a mutable ref/);
});

test("a full 40-character SHA passes, and the trailing version comment does not confuse it", () => {
  const src = "permissions: { contents: read }\n  - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4\n";
  assert.deepEqual(check(SC(), FILES({ "a.yml": src })), []);
});

test("first-party refs are exempt — a local path and our own reusable workflow at @main", () => {
  const src = "permissions: { contents: read }\n    uses: ./.github/workflows/reusable-link-check.yml\n" +
              "    uses: aigovops-foundation/aigovops-library-june-ken-bob/.github/workflows/reusable-link-check.yml@main\n";
  assert.deepEqual(check(SC(), FILES({ "a.yml": src })), []);
});

test("the rule is off unless the policy asks for it", () => {
  assert.deepEqual(check(POLICY(), FILES({ "a.yml": "permissions: { contents: read }\n  - uses: actions/checkout@v4\n" })), []);
});

test("every third-party action in this repo is SHA-pinned — the regression guard", () => {
  const policy = loadPolicy();
  assert.equal(policy.supply_chain?.require_sha_pins, true, "the policy must keep asking for pins");
  const firstParty = policy.supply_chain.first_party_prefixes;
  for (const [file, src] of loadWorkflows()) {
    for (const { ref, line } of readUses(src)) {
      if (firstParty.some((p) => ref.startsWith(p))) continue;
      assert.match(ref, /@[0-9a-f]{40}$/, `${file}:${line} ${ref}`);
    }
  }
});

/* ── the committed policy, against the real workflows ─────────────────────────── */

test("the committed policy passes against every workflow actually in this repo", () => {
  assert.deepEqual(check(loadPolicy(), loadWorkflows()), []);
});

test("every workflow on disk is declared — this is the guard when someone adds one", () => {
  const declared = new Set(loadPolicy().workflows.map((w) => w.file));
  for (const f of loadWorkflows().keys()) assert.ok(declared.has(f), `${f} is not declared in policies/autonomy.yaml`);
});

test("exactly one workflow writes to the repository, and only to machine-written artifacts", () => {
  // The count is the part with teeth: ONE writer to main, whatever else changes. It fired on
  // 2026-08-23 when ladder row 12 added the run ledger to this workflow's allowlist — which is
  // the right outcome for a new path (someone reads this and decides), and would have been the
  // right outcome for a new WRITER too (someone reads this and objects).
  const writers = loadPolicy().workflows.filter((w) => w.writes?.length);
  assert.equal(writers.length, 1, "a second workflow writing to main is a decision, not a detail");
  assert.equal(writers[0].file, "estate-interaction-crawl.yml");
  assert.deepEqual(writers[0].writes, [
    "docs/estate-health.json", "docs/.estate-notified", "docs/.estate-last-window",
    "ops/receipts/runs.ndjson",
  ]);
});

test("the run ledger is the one declared path that is append-only, and it says so", () => {
  // The other three are regenerated by the next run, which is what makes writing them green.
  // The ledger is not, so the policy carries the reason it is still green — the hash chain —
  // rather than leaving a reader to assume the same argument covers it.
  const wf = loadPolicy().workflows.find((w) => w.file === "estate-interaction-crawl.yml");
  assert.ok(wf.receipts_note, "the exception must carry its justification in the policy");
  assert.match(wf.receipts_note, /append-only/);
  assert.match(wf.receipts_note, /hash chain/);
});

test("the red list still contains the moves CLAUDE.md reserves for a human", () => {
  const red = new Set(loadPolicy().actions.filter((a) => a.class === "red").map((a) => a.id));
  for (const id of ["change-dns-or-registrar", "create-an-account", "enrol-a-key-or-enter-a-credential",
                    "delete-data", "force-push-or-rewrite-history", "change-access-control-or-repo-settings",
                    "accept-a-member-or-grant-access", "send-mail-as-a-founder", "move-money"]) {
    assert.ok(red.has(id), `${id} must stay red`);
  }
});
