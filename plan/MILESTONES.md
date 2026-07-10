# Program milestones

Consolidated roadmap across the infra gates and the growth lanes. Each milestone is marked
**[auto]** (an agent can complete it reversibly) or **[gate]** (crosses the irreversibility
boundary — needs Bob/Ken's explicit, irreversible move; an agent prepares but never executes
it). Updated 2026-07-02.

## M1 — Secrets broker (role-applications, Mac)
- [auto] ✅ `op` CLI working; no-paste `run.sh` + `.env.op` wired; fail-closed verified.
- [gate] ⏳ **Store the Anthropic key** in 1Password as `anthropic-api-key` (one-time secret entry).

## M2 — Enclave host (droplet B) kernel sandbox
- [auto] ✅ gVisor `runsc` installed + registered; kernel isolation proven (`4.19.0-gvisor`).
- [auto] ✅ Full GvisorSandbox envelope validated under real runsc (read-only rootfs, cap-drop,
  no egress).
- [gate] ⏳ **Core↔gVisor wiring decision:** (a) mount `docker.sock` into core *(now known-good)*,
  (b) core-on-host, or (c) defer. Privilege tradeoff → Bob's call.

## M3 — Omni secret centralization (droplet A) — ✅ DONE (2026-07-10)
- [auto] ✅ All **8** secrets migrated from `.env` into the AiGovOps 1Password vault + verified
  reads-back; every `OMNI_SECRET_*` stripped from `.env` (backed up first); omni restarted, portal +
  signin `200`. No file-store shadow — **1Password is the resolution source** (`scripts/migrate-secrets.sh`,
  fail-closed: never strips a key that doesn't verify from the vault first).
- [gate] ✅ Done via a **new Read+Write service account** — the existing SA's vault access is immutable
  (`op service-account` has only `create`/`ratelimit`, no edit); its token was swapped into the droplet
  `.env` **no-paste**.
- [ ] Cleanup left for Bob (1Password console): **revoke the old read-only SA** (`3VAP6…`); de-dupe the
  vault items flagged by the migrate (`Service Account Auth Token: aigovops-deploy` ×6, `DigitalOcean` ×3);
  optionally **rotate** the new token (it was shown in plaintext during setup — fine if the screen was private).

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
- [gate] ✅ **Pushed to `main`** → Pages redeployed; SEO is live (`sitemap.xml`, `robots.txt`, and
  JSON-LD all verified `200` on 2026-07-02).

## M6 — UX + accessibility (Library site)
- [auto] ✅ Governed a11y audit 21/21=100; reduced-motion + focus-visible on 21/21.
- [auto] ✅ Skip-link + `#main` landmark on all 21 pages; every skip target verified to resolve.
- [auto] ✅ Deployed live — `:focus-visible` and skip-link verified on the live site (2026-07-02).
- [gate] ⏳ Contrast spot-check via the axe/pa11y opt-in profile (needs that profile enabled).

## M7 — Automation
- [auto] ✅ Three read-only runbooks (`scripts/runbooks/`), all tested live.
- [gate] ⏳ **Schedule** any runbook (cron / GitHub Action `schedule:` / jeeves) — standing,
  outward-facing → opt-in.

## M8 — Cross-property reach (Glean, V4, Foundation)
- [auto] ✅ **Glean-ia-acs**: SEO + a11y pack replicated — `sitemap.xml`, `robots.txt`, schema.org
  `Course` + per-lesson `LearningResource` JSON-LD, `:focus-visible`, `prefers-reduced-motion`, 44px
  targets, and a `prefers-color-scheme` light theme. Verified live (2026-07-02).
- [gate] ✅ Glean deploy done — Pages live at `bobrapp.github.io/Glean-Mastery/`.
- [auto] ⏳ Replicate the same pack on **V4** and the **Foundation** site (separate repos / PR flows).
- [gate] ⏳ Their respective deploys.

## M9 — Glean-Mastery training (Glean-ia-acs)
- [auto] ✅ Static-site generator (`scripts/build-site.mjs`) + Pages deploy (`pages.yml`), gated by the
  schema + OPA content-integrity checks. Repo made public; Pages enabled via the workflow.
- [auto] ✅ Full **56-lesson** curriculum built (weeks 1–8, levels 200→500): each day carries a real
  working example, resolving sources, a quiz, and a `video_summary`; both CI gates green.
- [auto] ✅ Course UX: localStorage progress + resume, an interactive quiz, a "how it works" start,
  day-N-of-56, and syntax highlighting. Linked off the Library home as the **Glean-ia-acs** card.
- [gate] ⏳ Generate the ~10-second **Veo** clips from each lesson's `video_summary` (needs a Veo/Gemini
  key in the broker) — the scripts write the summaries; the clips don't exist yet.

---

### What an agent executes automatically now
M8's remaining reach (replicate the SEO + a11y pack on **V4** and **Foundation**) and, once a key is
in the broker, M9's Veo clip generation. Everything else is either done [auto ✅] or waits at a
[gate] that's yours — mostly the 1Password vault writes (M1, M3) and the M2 sandbox-privilege call.
