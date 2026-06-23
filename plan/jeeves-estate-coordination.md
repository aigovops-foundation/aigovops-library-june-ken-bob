# Jeeves coordinates the whole estate (one fleet, one gate, every property)

> Built 2026-06-21. The backbone and both seams are live in `bobrapp/Omni-Rapp-June-2026`.
> This is the durable design + the remaining tools-seam go-live work.

## The estate

Eight properties, three kinds. One source of truth: `config/estate.json` (repo · kind · deploy ·
department · posture · health), read by the planner, the runbook (`jeeves ops`), the cockpit
(`/api/estate`), and the `jeeves estate` verb.

| Property | Kind | Dept | Posture |
|---|---|---|---|
| Library | site + core | Dev | auto-reversible |
| Foundation site | site | Dev | propose-only |
| Membership community | platform | Community | auto-reversible |
| NCW learning camp | site | Dev | auto-reversible |
| Beacon | tool + site | Evidence | propose-only |
| Umbrella | tool + site | Compliance | propose-only |
| Lantern | tool | Evidence | auto-reversible |
| Vendor RFI | tool + site | Compliance | propose-only |

**Posture** (confirmed by Bob): `auto-reversible` = the fleet does the reversible prep itself
(draft, open a PR, run checks, compile) and the merge/publish/ship holds for a steward;
`propose-only` = a steward initiates AND approves every change (public brand surfaces). Either
way the truly irreversible step always holds for a human.

## Seam A — sites (live)

`core/sites.py` + `jeeves site <property> <change>`. Routes a change through the Dev department's
gated effectors (`draft_pr -> open_pr -> merge`) against the property's repo, honoring posture:
auto-reversible auto-drafts + auto-opens the PR (merge holds); propose-only drafts only. The
platform (community) is excluded — it ships via `ship.sh`. Real GitHub PRs fire when
`OMNI_DEPLOY_DRYRUN=0` and the broker holds `github-token` (else dry-run).

## Seam B — tools (live as governed skills; real CLIs are the next phase)

The dogfooding prize: the Foundation's own toolchain, run by the fleet through its own gate.
`effectors/govtools.py` adds three reversible (verdict 1) skills, granted to the governance +
auditor agents:

- `umbrella_compile` — a framework -> executable YAML controls (Umbrella).
- `beacon_sign` — discover AI + sign a metadata-only evidence bundle, OVERT 1.0 (Beacon).
- `lantern_read` — read the bundle into a human report (Lantern).

`core/govtools.py` + `jeeves govern [framework]` chains them: compile -> sign -> read, each
governed, leaving three drafts; publishing the report externally is a separate, held step.

**To go live (the remaining work).** Today these are dry-run scaffolds (`OMNI_TOOLS_DRYRUN=1`),
consistent with every other effector that waits for its backend. To run the real tools:
1. Vendor or pin the three repos (`umbrella-govops`, `aigovops-beacon`, `aigovops-lantern`) — they
   are Python, Alpha (last pushed 2026-06-03); stabilize their CLIs first.
2. Implement the live branch of each effector (subprocess to the tool's CLI, or import the
   vendored package), producing a real signed bundle / compiled controls / report.
3. Flip `OMNI_TOOLS_DRYRUN=0`. Publishing a bundle stays a held `?` step.

## What this buys

One Jeeves, one brain, one gate, one `?` queue, one signed ledger, one runbook — across all eight
properties, not per-property. A single goal can cross them: *"publish the Q3 report with a signed
evidence bundle"* -> `umbrella_compile` -> `beacon_sign` -> Dev opens the foundation-site PR ->
(hold) steward merges -> Community announces (hold). And the Foundation's own products are
governed by the Foundation's own gate — the proof no competitor has. Related:
[[jeeves-master-architecture]], [[ecosystem-agent-skill-map]].
