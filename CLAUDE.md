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

- **Deep docs** (blueprint, control-plane, build-tickets): navy "architectural blueprint"
  aesthetic — Cinzel (display), Spectral (body), IBM Plex Mono (technical); indigo
  `#0c1430` with teal/green/gold accents; grid background; numbered sections with a sticky
  nav and a "← back" link. Match the existing pages' CSS tokens exactly.
- **The hub** (`index.html`): Fraunces + DM Mono, teal/green on near-black.
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
- **Oversight — one surface, role-scoped.** Stewards (founders) see all + the global kill
  switch; members see only their own effects.

Full detail: `docs/control-plane.html` / `plan/control-and-deployment.md`.
Backlog & next steps: `plan/build-tickets.md` — start with **Ticket 0** (`SecretsProvider`
+ FileProvider), the smallest slice that proves mint → scope → expire → log → revoke.

## Secrets & safety hygiene

- Never commit secrets. `core/keys/` holds only `.gitkeep`. Any real secret file must be
  gitignored.
- Tokens/credentials live only in the shell session, never written to a file or committed.
- The ledger and beacons are metadata-only — no payloads, no PII, ever.
