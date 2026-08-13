# CLAUDE.md — house rules for this repo

You are working in the **AiGovOps Library** repo for the AiGovOps Foundation
(co-founders **Bob Rapp** and **Ken Johnston**). Read this before making changes.

> "Agents do the bureaucracy; humans hold the meaning — and humans hold the keys."

## The one rule that overrides everything: the irreversibility boundary

**Prepare and propose; the human makes the irreversible move.** You may edit files,
run tests, build, and stage changes freely. But **pause for Bob's (or Ken's) explicit
approval before anything irreversible**, and never do these autonomously:

- committing or pushing to `main`
- DNS / registrar / domain changes
- creating accounts, enrolling keys, or entering credentials
- deleting data, force-pushing, or rewriting history
- changing access controls, sharing, or repo/account settings

When you reach such a step, stop, show exactly what you're about to do, and ask. This is
not a formality — it is the project's core governance principle applied to its own tooling.
Flag risks plainly; never paper over a problem to seem agreeable. Bob values candor over
comfort.

## What this repo is

A connected set of artifacts that explain and run the AiGovOps governed core. Six rendered
pages plus a running Node core.

```
docs/                 ← GitHub Pages root (public site; secret-free)
  index.html          ← the hub ("the six pieces"); links the others
  demo.html  design-book.html  blueprint.html  plan.html
  control-plane.html  ← security, control & deployment (+ Rev 2026.06 decisions)
  build-tickets.html  ← the backlog: Ticket 0 + next 10 items
plan/                 ← durable markdown sources (no secrets)
  control-and-deployment.md   build-tickets.md
  agents.md  skills.md  processes/  skills/
core/                 ← dependency-free Node 20+ governed core
  src/core/yesgate.shared.js  ← SINGLE SOURCE of the Yes-Gate logic
  src/  test/  Dockerfile  compose.yml  .env.example
scripts/build-docs.mjs ← inlines yesgate.shared.js into docs/index.html
.github/workflows/    ← ci.yml (core tests) · pages.yml (deploy docs/)
```

## How to ship a change (this repo, direct-to-main)

This repo ships straight to `main`; a push triggers `pages.yml`, which rebuilds and
deploys `docs/`. (The *other* repo — the main Foundation site — uses a PR + Cloud-Mary
workflow; do not apply that here.)

1. Edit files under `docs/` and/or `plan/`. Keep a doc's HTML page and its markdown
   source in sync.
2. If you changed the Yes-Gate logic, edit it **only** in
   `core/src/core/yesgate.shared.js`, then run `npm run build:docs` (re-inlines it into
   `docs/index.html` between the BEGIN/END-SHARED markers). The page stays one
   self-contained file that works on `file://` and on Pages.
3. If you changed core code, run the core tests: `cd core && npm test`.
4. Show Bob the diff and **ask before committing/pushing.** On approval: commit with a
   `type: summary` message (feat/fix/docs/chore…), push to `main`.
5. Pages redeploys automatically (~1 min). Live at
   `https://aigovops-foundation.github.io/aigovops-library-june-ken-bob/`.

## Design conventions

- **Garden-warm, estate-wide** (the navy "architectural blueprint" is RETIRED). Cream ground
  (`#FAF7F0`/`#F7F3E8`), orchard green accents (`#2E7D4F`/`#1F5E3A`), Fraunces for display.
  Match the aigovops-july-2026 design system — the same tokens the community and Beacon use.
- **Deep docs** (blueprint, control-plane, build-tickets): Fraunces (display), Source Serif 4
  (body), IBM Plex Mono (technical) — a touch more "technical document" than the hub, but the
  same garden-warm palette; numbered sections with a sticky nav and a "← back" link. Match the
  existing pages' CSS tokens exactly.
- **The hub** (`index.html`): Fraunces + Source Sans 3 + DM Mono, garden-warm; leads with the
  live "See it run" demo before the shelves (the intuition-first order).
- Write in prose, not bullet-soup; be precise and honest; don't overclaim (e.g. "100%
  visibility of *effects*", not of model thoughts). Keep the founders' voice.

## Architecture decisions in force (Rev 2026.06)

The principle: **define the safety contract once at the interface; enforce it with the
strongest backend each environment allows; scope every view by identity.**

- **Secrets — tiered behind one `SecretsProvider` interface.** FileProvider (lab:
  keychain/`.env`), VaultProvider (community/enclave: Vault / cloud KMS). One call site;
  identical broker semantics everywhere; an agent never receives a raw secret.
- **Chokepoint — sandbox contract from day one; gVisor where the kernel allows.** Tools
  run sandboxed, no ambient network/filesystem, egress only via a declared proxy.
- **Oversight — one surface, role-scoped, multi-role.** Roles are a set (co-founder /
  steward / end-user); permission is the union. Co-founders (Bob, Ken) hold everything
  including the global kill switch and role administration; stewards see all effects and
  approve/moderate but hold neither the kill switch nor role admin; members see only
  their own effects. Rule of record: Omni `docs/RUNBOOK-roles.md`.
- **Membership wall — public source, gated experience.** Library repos stay public on
  GitHub; the rendered Library is served member-gated at community…/library/ (registration,
  never money or secrecy). Rule of record: `plan/processes/membership-wall.md`. Retiring a
  github.io mirror is a steward-shipped move — never autonomous.

Full detail: `docs/control-plane.html` / `plan/control-and-deployment.md`.
Backlog & next steps: `plan/build-tickets.md` — start with **Ticket 0** (`SecretsProvider`
+ FileProvider), the smallest slice that proves mint → scope → expire → log → revoke.

## Secrets & safety hygiene

- Never commit secrets. `core/keys/` holds only `.gitkeep`. Any real secret file must be
  gitignored.
- Tokens/credentials live only in the shell session, never written to a file or committed.
- The ledger and beacons are metadata-only — no payloads, no PII, ever.

## Estate interaction health — the hourly rule

**Green is the goal for every page.** Every hour, the whole estate is crawled in a real
browser and every button and link is verified to actually *do* something (not just "does the
URL 200?"). A control that looks clickable but leads nowhere is a defect, the same as a 404.

- Engine + runbook: `scripts/interaction-crawl.mjs`, `plan/processes/estate-interaction-audit.md`;
  live board `docs/estate-health.html`; skill `plan/skills/estate-health/`.
- The hourly run scores the estate (share of pages fully green) and delivers the digest to the
  founders (`founders.json`) — a heartbeat, pinging on any red↔green flip. A red page is an
  action: fix the button; **never turn a `failOnDead` gate off to fake green.**

## Membership — read is open-able, creation is gated (and the boundary holds)

The governed model already answers "let them read but not create without Ken or Bob": a member's
role is **read + propose**; every effect is a proposal the human decides (the Yes-Gate). Member
activity is metadata in the signed ledger. Keep it there.

But **onboarding members, granting access, and sending mail on the founders' behalf are
irreversible, outward-facing moves** — creating accounts / changing access controls / registrar
+ identity wiring. Per the one rule that overrides everything, an agent **prepares and proposes**
these; it never auto-accepts a member, auto-grants access, or sends an email as Bob/Ken without
their explicit approval and the real credentials. Auto-accept and auto-mail are **steward-shipped**,
never autonomous — exactly as the membership wall itself is.
