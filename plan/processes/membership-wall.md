# Membership wall — an estate system rule

**Rule: public source, gated experience.** Every Library asset keeps its source public on
GitHub — open, forkable, auditable, true to the Foundation's open-source commitments. The
*rendered experience* is served behind the community membership wall at
`community.aigovops-foundation.com/library/`. Reading the Library at its home address costs
registration — never money, and never secrecy: anyone may still clone the repo. The wall
builds the community roll; it does not hide the work. Say this plainly wherever the wall
appears, so nobody mistakes a membership wall for a confidentiality boundary.

This extends the estate's standing rule (agents automate everything reversible; humans hold
the irreversible gates) to publishing:

## The three surfaces of the estate

| Surface | Access | Examples |
|---|---|---|
| **Public** | No registration, ever | www.aigovops-foundation.com, the GitHub repos, one Library teaser page |
| **Members' Library** | The access ladder below | community…/library/ — the hub, the wings (quantum, Glean, …) |
| **Steward** | Ken and Bob only, session-authoritative | admin/steward pages, kill switch, holds queue |

## The access ladder (amended 2026-07-09, Bob's call)

`OMNI_LIBRARY_ACCESS`, one env var, steward-flipped, tightening as the estate matures:

1. **`open-with-rules`** *(current)* — free reading, no account. The door is agreeing to
   the ten community rules (`library-rules.html` sets a consent cookie; nothing stored
   server-side). Registration is invited on the page, never required.
2. **`signed-in`** — any registered principal reads (applicants included).
3. **`member`** — steward-approved members only.

The rules are the constant: every rung requires agreeing to them (registration implies
them via terms/conduct; anonymous reading consents explicitly). The wall stays a
community-builder, never a paywall and never a secrecy boundary.

## Who does what

- **The librarian agent** (Omni `skills/librarian`, in `agents.yaml`) runs the reversible
  duties automatically: mirroring the public repos into the gated mount every 15 minutes
  (`scripts/library_sync.sh` + `deploy/library-sync.timer`) and watching health. Ops
  detail: Omni `docs/RUNBOOK-library-gate.md`.
- **A steward** holds the two decisions, as gate `?` effects:
  1. *Access mode* — `signed-in` (registering is enough; the default, so growth never
     waits on approvals) vs `member` (Ken/Bob approve each reader).
  2. *Retiring a public mirror* — pointing a github.io Pages deploy at the redirect stub
     (`redirect-stub/index.html` in this repo) so the gated URL becomes the only rendered
     copy. This is the move that makes membership real, and it is near-irreversible in
     spirit (bookmarks, caches, search) — an agent stages it; a human ships it.

## Design invariants

- The gate is enforced in one place (the portal server's `/library/` mount) — one
  chokepoint, inspectable and tested (`tests/test_library_gate.py`, 14 checks). Identity
  stays swappable behind it: if self-serve registration ever outgrows the home-grown flow,
  the signin backend can change (e.g. a hosted IdP) without touching the wall.
- The gated mount lives outside the app directory (`/opt/omni-library`), so app deploys
  can never delete Library content, and Library syncs can never touch the app.
- Steward surfaces and the public foundation site are structurally untouched by the wall —
  no shared code paths changed, proven by the existing auth test suites.
- New Library assets join by one manifest row; retiring their public mirror is a separate,
  per-asset steward decision. Ship the gate first, verify a member can read, retire last.
