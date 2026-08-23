#!/usr/bin/env node
// repo-move — everything about moving a repository that a machine may do, and nothing it may not.
//
//   node scripts/repo-move.mjs --preflight
//   node scripts/repo-move.mjs --verify  --from owner/repo --to owner/repo
//   node scripts/repo-move.mjs --apply   --to owner/repo --pages-url https://.../
//
// WHAT THIS DOES NOT DO, AND CANNOT. It does not transfer a repository, rename one, or change
// any repository setting. Three separate reasons, and the first alone is decisive:
//
//   1. There is no transfer or rename tool in this session's GitHub surface at all. Those are
//      admin-settings operations and nothing here reaches them.
//   2. The session is scoped to this repository; the source repo is not attached, and attaching
//      one grants read or push — never admin.
//   3. policies/autonomy.yaml classes `transfer-rename-or-archive-a-repository` and
//      `change-access-control-or-repo-settings` as RED: a human does them, with their own hands
//      and their own credentials.
//
// So this automates the two halves a machine SHOULD own — proving the move is safe to make, and
// doing every reversible thing afterwards — and prints the exact click-path for the part in the
// middle. That is the same shape the estate's own deploy agents use: drive right up to the
// irreversible click, then stop.

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { load as loadEstate } from "./estate-manifest.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

const OLD_PAGES = "https://bobrapp.github.io/Aigovops-Foundation-Open-Source-V4-10k/";

// A reference is a BLOCKER when it cannot be repointed at a github.com URL. An <a href> can;
// an iframe cannot, because GitHub sends X-Frame-Options: deny and the panel renders blank —
// and a silent blank is worse than a 404, because nobody reports it.
const REFERENCES = [
  { file: "docs/index.html",        kind: "link",   blocker: false },
  { file: "docs/onboarding.html",   kind: "iframe", blocker: true  },
];

const sh = (args) => execFileSync("git", args, { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] });

export function scanReferences(root = ROOT) {
  const out = [];
  for (const ref of REFERENCES) {
    let body = "";
    try { body = readFileSync(join(root, ref.file), "utf8"); } catch { continue; }
    if (body.includes(OLD_PAGES)) out.push(ref);
  }
  return out;
}

// git ls-remote is the honest check: it proves the repository answers at a URL, and GitHub's
// rename/transfer redirect is followed by git, so the old URL answering with the SAME head as
// the new one is proof the redirect is live rather than an assumption.
export function remoteHead(slug) {
  try { return sh(["ls-remote", `https://github.com/${slug}`, "HEAD"]).split(/\s+/)[0] || null; }
  catch { return null; }
}

function preflight() {
  const outstanding = scanReferences();
  const blockers = outstanding.filter((r) => r.blocker);
  const safe = outstanding.filter((r) => !r.blocker);

  console.log(`repo-move preflight — ${outstanding.length} reference(s) still point at the old Pages URL`);
  for (const r of safe)     console.log(`  ~ ${r.file} (${r.kind}) — repointable at a github.com URL; do it before the rename`);
  for (const r of blockers) console.log(`  ! ${r.file} (${r.kind}) — CANNOT use a github.com URL (X-Frame-Options: deny). It will break at the rename and can only be fixed once the new Pages URL exists.`);
  if (!outstanding.length)  console.log("  none — every reference already survives a rename.");

  console.log(`
The three steps below are RED. They are yours, not mine — there is no tool here that can
perform them, and policies/autonomy.yaml reserves them for a founder regardless.

  1. Transfer   github.com/bobrapp/Aigovops-Foundation-Open-Source-V4-10k
                → Settings → Danger Zone → Transfer → owner: aigovops-foundation
  2. Rename     in the org → Settings → Rename → aigovops
  3. Pages      Settings → Pages → re-enable under the org, and note the URL

Then, and this part IS mine:

  node scripts/repo-move.mjs --verify --from bobrapp/Aigovops-Foundation-Open-Source-V4-10k \\
                                      --to   aigovops-foundation/aigovops
  node scripts/repo-move.mjs --apply  --to   aigovops-foundation/aigovops \\
                                      --pages-url <the URL from step 3>
`);
  // A known blocker is not a failure to be gated on — it is a fact to carry into the move.
  return 0;
}

function verify() {
  const from = opt("from"), to = opt("to");
  if (!from || !to) { console.error("--verify needs --from owner/repo and --to owner/repo"); return 1; }

  const newHead = remoteHead(to);
  const oldHead = remoteHead(from);
  const problems = [];

  console.log(`repo-move verify\n  ${to}    ${newHead ?? "no answer"}\n  ${from}  ${oldHead ?? "no answer"}`);

  if (!newHead) problems.push(`${to} does not answer — the transfer or rename has not landed`);
  if (newHead && oldHead && oldHead !== newHead) problems.push(`${from} answers with a DIFFERENT head — something else now occupies the old name, so the redirect is gone`);
  if (newHead && !oldHead) console.log(`  note: the old slug does not answer. Fine if the repo is private; otherwise the redirect is not working.`);
  if (newHead && oldHead === newHead) console.log(`  ✓ the old slug redirects to the new one (same head) — existing clones and github.com links keep working.`);

  console.log(`  ! Pages does NOT follow that redirect. ${OLD_PAGES} is gone for good.`);

  if (problems.length) { console.error(`\n✗ ${problems.join("\n✗ ")}`); return 1; }
  console.log(`\n✓ the move landed. Run --apply next.`);
  return 0;
}

function apply() {
  const to = opt("to"), pages = opt("pages-url");
  if (!to || !pages) { console.error("--apply needs --to owner/repo and --pages-url https://.../"); return 1; }
  if (!/^https:\/\/\S+\/$/.test(pages)) { console.error("--pages-url must be an https URL ending in /"); return 1; }

  const [account, repo] = to.split("/");
  if (!account || !repo) { console.error("--to must be owner/repo"); return 1; }

  const edits = [];
  const sub = (file, from, into) => {
    const p = join(ROOT, file);
    const s = readFileSync(p, "utf8");
    if (!s.includes(from)) return false;
    writeFileSync(p, s.split(from).join(into));
    edits.push(file);
    return true;
  };

  // The iframe — the reference that could not be fixed in advance.
  sub("docs/onboarding.html", OLD_PAGES, pages);

  // The manifest: the repo has moved, and the property becomes watchable for the first time.
  let y = readFileSync(join(ROOT, "estate.yaml"), "utf8");
  const OLD_ID = "Aigovops-Foundation-Open-Source-V4-10k";
  y = y.replace(new RegExp(`  - id: ${OLD_ID}\\n    account: bobrapp\\n`),
                `  - id: ${repo}\n    account: ${account}\n`);
  // The site row points at the repo by id. Renaming one without the other leaves the manifest
  // referentially broken — which the estate gate catches, but only after a bad commit. Caught
  // here by dry-running --apply before shipping it.
  y = y.split(`    repo: ${OLD_ID}\n`).join(`    repo: ${repo}\n`);
  y = y.split(OLD_PAGES).join(pages);
  y = y.replace(/(  - id: v4-platform-page\n(?:.*\n)*?    status: )unknown/, "$1live");
  writeFileSync(join(ROOT, "estate.yaml"), y);
  edits.push("estate.yaml");

  console.log(`repo-move apply → ${to}\n  pages: ${pages}`);
  for (const f of [...new Set(edits)]) console.log(`  updated ${f}`);
  console.log(`
Left for a human on purpose:
  - estate.yaml still has crawl.enabled false for v4-platform-page. Turn it on once the new
    Pages URL actually serves, then \`npm run estate:regen\` so the crawler picks it up —
    enabling a crawl against a URL that 404s just teaches everyone to ignore a red board.
  - re-run: npm run estate:check && npm run plan:check && npm run skills:check
`);
  return 0;
}

function main() {
  if (argv.includes("--verify"))   return verify();
  if (argv.includes("--apply"))    return apply();
  return preflight();
}

if (process.argv[1] && process.argv[1].endsWith("repo-move.mjs")) process.exit(main());
