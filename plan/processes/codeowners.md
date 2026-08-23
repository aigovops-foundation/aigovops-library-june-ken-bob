# Process — the two-founder gate (`CODEOWNERS`)

*Rule of record for who must review changes to the files that decide how the estate behaves.
PR 3 of [`plan/MASTER-PLAN.md`](../MASTER-PLAN.md). File: `/CODEOWNERS` · guard:
`test/plan-register.test.mjs`.*

---

## What is gated

| Path | Why |
|---|---|
| `/policies/` | The rules that define what may happen without a human. A policy that can be changed without review is not a policy. |
| `/plan/skills/` | Procedure. A production skill never edits itself; changes arrive as a PR. |
| `/.github/` | The clock, and everything that runs unattended. |
| `/estate.yaml` | The manifest of what the Foundation owns. |
| `/plan/MASTER-PLAN.md` | The front door for the programme. |

---

## It is not enforcing yet, and the file says so

**A CODEOWNERS entry naming a user without write access to the repository is silently
ignored by GitHub.** No warning, no error — the review requirement simply never applies. As of
2026-08-23 the only collaborator on this repo is `@bobrapp`, so every line naming
`@kenjohnston-ai` is currently inert.

Two moves make it real, and both sit on the irreversible side of the boundary — they are a
founder's, never an agent's:

1. **Give `@kenjohnston-ai` write access** — org membership or repo collaborator.
2. **Turn on branch protection for `main`** with *Require review from Code Owners*.

And a third thing worth deciding rather than assuming: CODEOWNERS on its own asks for **one**
listed owner to approve. If "both founders" is meant literally, branch protection also needs
**Require approvals: 2** — otherwise either founder alone satisfies the gate.

This is written down because a control everyone believes in and nothing enforces is worse than
no control. It is the same failure this estate has met twice already: a backup job green for
weeks while copying nothing, and a CI lint that "proved" no ungated effects existed and had
never run.

---

## The typo guard

`test/plan-register.test.mjs` asserts that every handle CODEOWNERS names appears in
`founders.json`. A misspelled handle is not a loud failure — GitHub ignores it exactly as it
ignores a user without access — so the spelling is checked where it can be checked, offline,
on every push.

`estate.yaml` and `founders.json` must also agree on the founders' handles; the estate manifest's
drift check enforces that, and the founders' digest reports it if they diverge.

---

## Changing it

Adding a path to CODEOWNERS is Yellow: an agent prepares, a founder merges. Removing one is
worth a sentence in the PR saying why the file stopped needing two pairs of eyes — that is
exactly the change nobody notices later.
