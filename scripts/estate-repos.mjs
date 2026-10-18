// scripts/estate-repos.mjs — which repositories the estate-level watchdog watches, derived from
// estate.yaml. Same shape and same reasoning as estate-matrix.mjs for sites: ONE input, and every
// row that is left out is NAMED in the log, because a lane covering eight repos of twelve while
// reading as complete is the hollow green this estate keeps finding.
//
//   node scripts/estate-repos.mjs           # print the matrix, and what was excluded and why
//   node scripts/estate-repos.mjs --json    # the strategy.matrix JSON for the workflow
//
// Why this exists (Bob's cut-list decision 7, 2026-10-18): ten repos each ran the shared watchdog
// daily and each produced its own alarm email for the same stale red. One Library lane
// (estate-watchdog.yml) now watches every row below from a single run, reading other repos'
// Actions history with the ESTATE_READ_TOKEN secret — a read-only credential a founder mints.
import { load } from "./estate-manifest.mjs";

const ARCHIVED = new Set(["retired", "archived"]);

export function partitionRepos(repos) {
  const included = [], excluded = [];
  for (const r of repos ?? []) {
    const full = `${r.account}/${r.id}`;
    if (r.watch === false) {
      excluded.push({ repo: full, why: r.watch_note || "watch: false in estate.yaml" });
    } else if (ARCHIVED.has(r.disposition) || /^empty\b/i.test(r.role ?? "")) {
      excluded.push({ repo: full, why: "retired or empty — nothing runs there to go red" });
    } else if (r.visibility !== "public" && r.visibility !== "private") {
      excluded.push({ repo: full, why: `visibility is "${r.visibility ?? "unset"}" — record it in estate.yaml before watching` });
    } else if (r.account !== "aigovops-foundation") {
      excluded.push({ repo: full, why: "not a Foundation repository — personal-account material" });
    } else {
      included.push(r);
    }
  }
  return { included, excluded };
}

export function buildRepoMatrix(repos) {
  const { included, excluded } = partitionRepos(repos);
  return {
    matrix: { include: included.map((r) => ({ name: r.id, repository: `${r.account}/${r.id}` })) },
    excluded,
  };
}

function main(argv) {
  const m = load();
  const { matrix, excluded } = buildRepoMatrix(m.repos);
  if (argv.includes("--json")) { console.log(JSON.stringify(matrix)); return 0; }
  console.log(`estate-repos: ${(m.repos ?? []).length} repositor(ies) in the manifest · ${matrix.include.length} watched · ${excluded.length} excluded`);
  for (const r of matrix.include) console.log(`  ✓ ${r.repository}`);
  if (excluded.length) {
    console.log(`\n? ${excluded.length} excluded — named, not dropped:`);
    for (const e of excluded) console.log(`  - ${e.repo}\n      ${e.why}`);
  }
  if (!matrix.include.length) {
    console.error(`\n✗ the matrix is empty — a lane that watches nothing must not report success`);
    return 1;
  }
  console.log(`\n✓ every active Foundation repository in estate.yaml is watched.`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("estate-repos.mjs")) process.exit(main(process.argv.slice(2)));
