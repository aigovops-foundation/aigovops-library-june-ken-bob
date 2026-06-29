# Program milestones

Consolidated roadmap across the infra gates and the growth lanes. Each milestone is marked
**[auto]** (an agent can complete it reversibly) or **[gate]** (crosses the irreversibility
boundary — needs Bob/Ken's explicit, irreversible move; an agent prepares but never executes
it). Updated 2026-06-28.

## M1 — Secrets broker (role-applications, Mac)
- [auto] ✅ `op` CLI working; no-paste `run.sh` + `.env.op` wired; fail-closed verified.
- [gate] ⏳ **Store the Anthropic key** in 1Password as `anthropic-api-key` (one-time secret entry).

## M2 — Enclave host (droplet B) kernel sandbox
- [auto] ✅ gVisor `runsc` installed + registered; kernel isolation proven (`4.19.0-gvisor`).
- [auto] ✅ Full GvisorSandbox envelope validated under real runsc (read-only rootfs, cap-drop,
  no egress).
- [gate] ⏳ **Core↔gVisor wiring decision:** (a) mount `docker.sock` into core *(now known-good)*,
  (b) core-on-host, or (c) defer. Privilege tradeoff → Bob's call.

## M3 — Omni secret centralization (droplet A)
- [auto] ✅ Confirmed the 6 secrets are in `.env`, not yet in 1Password; migrate path staged.
- [gate] ⏳ **Grant the service account Read & Write** on the AiGovOps vault (1Password console).
  Then [auto] the on-host migrate + verify runs on a word.

## M4 — Customer insight
- [auto] ✅ Live report generated (`plan/insights/customer-insight-2026-06-28.md`): 35 actors /
  687 events, funnel, 5 actions.
- [auto] ✅ Weekly `insight-digest.sh` runbook (tested live).
- [gate] ⏳ Activation fixes (concierge empty-state, feedback prompts) live on the **portal repo**
  — drafted there, shipped via its own PR flow.

## M5 — SEO / discoverability (Library site)
- [auto] ✅ `sitemap.xml` + `robots.txt`; canonical + JSON-LD 21/21; fixed 9 missing `og:url`.
- [auto] ✅ `seo-drift-check.mjs` runbook (runs clean).
- [auto] ✅ Wired into CI as a `site-checks` job — discoverability can't regress silently.
- [gate] ⏳ **Push to `main`** → Pages redeploys the site live.

## M6 — UX + accessibility (Library site)
- [auto] ✅ Governed a11y audit 21/21=100; reduced-motion + focus-visible on 21/21.
- [auto] ✅ Skip-link + `#main` landmark on all 21 pages; every skip target verified to resolve.
- [gate] ⏳ Contrast spot-check via the axe/pa11y opt-in profile (needs that profile enabled).

## M7 — Automation
- [auto] ✅ Three read-only runbooks (`scripts/runbooks/`), all tested live.
- [gate] ⏳ **Schedule** any runbook (cron / GitHub Action `schedule:` / jeeves) — standing,
  outward-facing → opt-in.

## M8 — Cross-property reach (Glean, V4, Foundation)
- [auto] Replicate the SEO + a11y pack on the other properties (separate repos / PR flows).
- [gate] ⏳ Their respective deploys.

---

### What an agent executes automatically now
M5 (CI wiring) and M6 (skip-link/landmark rollout) — the remaining reversible items in this
repo. Everything else is either already done [auto ✅] or waits at a [gate].
