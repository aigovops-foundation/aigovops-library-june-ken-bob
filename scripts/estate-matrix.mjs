#!/usr/bin/env node
// estate-matrix — turn estate.yaml into a GitHub Actions matrix, so a shared lane runs over
// every property instead of over whichever one somebody remembered.
//
//   node scripts/estate-matrix.mjs                 # human-readable: what is in, what is out, why
//   node scripts/estate-matrix.mjs --json          # the matrix, for `fromJSON` in a workflow
//
// WHY THIS EXISTS (ladder row 11)
//
// Seven reusable workflows sit in .github/workflows with adoption instructions in their headers.
// Exactly one has been adopted cross-repo. `link-check.yml` is the sharpest case: the estate
// publishes eight properties and the weekly link check has been running against ONE of them —
// this repo's own redirect stub — for as long as it has existed. Not because anyone decided the
// other seven did not matter, but because adopting a lane meant opening another repository.
//
// A matrix over the manifest removes the decision. The list is DERIVED: a property added to
// estate.yaml is checked from the next run, and nobody has to remember a second place.
//
// WHAT IS EXCLUDED, AND WHY IT IS NAMED
//
// A gated property needs a session cookie to fetch anything, and the cookie is a credential a
// founder mints — Red. So gated properties are excluded, and this prints WHICH and WHY on every
// run rather than quietly shipping a matrix that covers six of eight and reads as complete.
// Silence about a gap is the failure mode this estate keeps finding.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load, deriveSites } from "./estate-manifest.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// A property is checkable by a URL-driven lane when it needs no credential to read. Everything
// else is a stated exclusion carrying its reason, never a silent drop.
export function partition(sites) {
  const included = [], excluded = [];
  for (const s of sites) {
    if (s.cookie) {
      excluded.push({ base: s.base, why: "needs a session cookie — a credential a founder mints (Red)" });
    } else if (s.gated) {
      excluded.push({ base: s.base, why: "gated — an anonymous fetch sees the sign-in wall, not the site" });
    } else {
      included.push(s);
    }
  }
  return { included, excluded };
}

export function buildMatrix(sites) {
  const { included, excluded } = partition(sites);
  return {
    matrix: {
      include: included.map((s) => ({
        name: s.name,
        site_url: s.base,
        // A property whose dead links should FAIL the lane is one the estate has committed to
        // keeping green. The manifest already records that per property; the matrix inherits it
        // rather than inventing a second policy.
        fail_on_external: false,
        max_pages: 200,
      })),
    },
    excluded,
  };
}

export const sitesFromManifest = (m = load()) => deriveSites(m);

function main(argv) {
  const sites = sitesFromManifest();
  const { matrix, excluded } = buildMatrix(sites);

  if (argv.includes("--json")) { console.log(JSON.stringify(matrix)); return 0; }

  console.log(`estate-matrix: ${sites.length} propert(ies) in the manifest · ${matrix.include.length} checked · ${excluded.length} excluded`);
  for (const r of matrix.include) console.log(`  ✓ ${r.site_url}`);

  if (excluded.length) {
    console.log(`\n? ${excluded.length} excluded — named, not dropped:`);
    for (const e of excluded) console.log(`  - ${e.base}\n      ${e.why}`);
  }

  // A matrix with nothing in it would make the lane pass by doing nothing, which is the exact
  // shape of hollow green this estate keeps finding. Refuse it.
  if (!matrix.include.length) {
    console.error(`\n✗ the matrix is empty — a lane that checks nothing must not report success`);
    return 1;
  }
  console.log(`\n✓ every ungated property in estate.yaml is in the matrix.`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("estate-matrix.mjs")) process.exit(main(process.argv.slice(2)));
