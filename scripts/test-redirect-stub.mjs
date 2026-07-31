#!/usr/bin/env node
/**
 * Live check of what this repo's Pages site ACTUALLY serves: the doorstep, not the Library.
 *
 * WHY THIS EXISTS. The scheduled live check used to run the full page suite (test-library.mjs in
 * http mode) against this URL, asserting the old homepage — "the three shelves", links to
 * /plan.html, an <h1> mentioning "yes". Those assertions were written when this site WAS the
 * Library. It isn't any more: pages.yml deploys `redirect-stub`, and the Library itself moved
 * behind the membership wall at community…/library/. So the check failed every night for reasons
 * that were correct behaviour — a control testing a target that no longer exists in that form.
 * A control that cries wolf nightly is worse than no control: people stop reading it.
 *
 * WHAT IT CHECKS NOW — the three things that are actually load-bearing here:
 *   1. the doorstep works        — the stub serves, says it moved, and points at the community
 *   2. the destination is alive  — gate in front, real content behind the door. A status code
 *                                  alone proves nothing: the /library/ mount is membership-walled,
 *                                  so an anonymous request 302s to a door (and following that 302
 *                                  makes every URL look identical). A status-only check is blind
 *                                  twice — it can't tell the gate from dead content. So we assert
 *                                  the wall is up for anonymous readers AND that a public page
 *                                  serves its own content behind the one-click consent cookie,
 *                                  while a nonsense sibling 404s. (controls-must-fail-loud.)
 *   3. THE WALL IS UP           — the deep Library pages are NOT served from here. This is a
 *                                  positive assertion of the governance rule (public source,
 *                                  gated experience): if a deploy ever accidentally published
 *                                  docs/ instead of redirect-stub, the Library would silently
 *                                  go public and nothing else would notice.
 *
 * The pre-deploy structural gate over the real pages (test-library.mjs --dir docs) is unchanged
 * and still runs in pages.yml — that is where the Library's own content is verified.
 *
 * Run: node scripts/test-redirect-stub.mjs [--base <url>]
 */

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const BASE = argOf("--base", "https://aigovops-foundation.github.io/aigovops-library-june-ken-bob").replace(/\/+$/, "");
const COMMUNITY = "https://community.aigovops-foundation.com/library/";

// Pages that belong to the Library itself. If any of these serves from the mirror, the wall is
// down. Kept deliberately short: one per "shelf" is enough to catch a whole-directory publish.
const WALLED = ["demo.html", "blueprint.html", "control-plane.html", "plan.html", "build-tickets.html"];

let pass = 0, fail = 0;
const ok = (c, label, detail = "") => {
  if (c) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};

async function get(url, { redirect = "follow", cookie = "" } = {}) {
  try {
    const headers = { "User-Agent": "aigovops-stub-check" };
    if (cookie) headers.cookie = cookie;
    const r = await fetch(url, { redirect, headers });
    return { status: r.status, html: await r.text().catch(() => ""), url: r.url, location: r.headers.get("location") || "" };
  } catch (e) {
    return { status: 0, html: "", url, location: "", error: String(e) };
  }
}

const main = async () => {
  console.log(`redirect stub — ${BASE}\n`);

  console.log("[1] the doorstep serves and explains itself");
  const home = await get(BASE + "/");
  ok(home.status === 200, "stub returns 200", `got ${home.status}`);
  const low = home.html.toLowerCase();
  ok(low.includes("has moved") || low.includes("new home"), "says the Library moved");
  ok(/http-equiv=["']refresh["']/i.test(home.html), "carries a meta refresh");
  ok(home.html.includes(COMMUNITY), "points at the community Library", COMMUNITY);
  ok(/github\.com\/aigovops-foundation\/aigovops-library/i.test(home.html),
     "still links the public source (public source, gated experience)");

  console.log("\n[2] the destination is alive — gate in front, real content behind the door");
  // The /library/ mount is membership-walled by design (public source, gated experience). A
  // status-only check is blind twice over: it can't tell the gate from dead content, and following
  // the 302 makes every /library/ URL look like one identical page. So assert BOTH invariants:
  //   (a) anonymous readers are gated — a deep page 302s to a door, destination preserved via ?next=
  //   (b) content behind the door is real — with the one-click consent cookie (omni_rules=1: no
  //       account, no payment, what the "I agree" button sets) a public page serves its OWN
  //       content, and a nonsense sibling does NOT (200-real vs 404-nonsense: no soft-404 catch-all).
  const CONSENT = "omni_rules=1";
  const DOORSTEP = /community rules|enter the library/i;

  // (a) the wall is up — anonymous reader is sent to a door with the destination preserved
  const anon = await get(COMMUNITY + "watch-gates.html", { redirect: "manual" });
  ok([301, 302].includes(anon.status) && /\/(library-rules|signin)\.html\?next=/.test(anon.location),
     "anonymous reader is sent to a door, destination preserved (?next=)",
     `status ${anon.status} → ${anon.location || "(no Location)"}`);

  // (b) content behind the door is real and routes per-URL
  const real  = await get(COMMUNITY + "watch-gates.html", { cookie: CONSENT });
  const bogus = await get(COMMUNITY + "__soft404-probe-does-not-exist__.html", { cookie: CONSENT });
  ok(real.status === 200 && !DOORSTEP.test(real.html) && /recorded walkthrough/i.test(real.html),
     "behind the door, a public Library page serves its own content (not a soft-404 doorstep)",
     DOORSTEP.test(real.html) ? "got the doorstep, not the page" : `status ${real.status}`);
  ok(real.status === 200 && bogus.status !== 200 && real.html !== bogus.html,
     "the mount routes per-URL behind the door — no soft-404 catch-all",
     `real=${real.status} nonsense=${bogus.status} (a catch-all would serve 200 for both)`);

  console.log("\n[3] the membership wall is up — Library pages are NOT served here");
  for (const p of WALLED) {
    const r = await get(`${BASE}/${p}`, { redirect: "manual" });
    // 404 is the wall holding. A 200 means a deploy published docs/ and the Library went public.
    ok(r.status === 404 || r.status === 0, `/${p} is not published from the mirror`, `got ${r.status}`);
  }

  console.log(`\nSTUB: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
