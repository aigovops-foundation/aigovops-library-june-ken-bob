# Process — the autonomy policy (`policies/autonomy.yaml`)

*Rule of record for what an agent may do alone. Drafted 2026-08-22 as PR 6 of
[`plan/auto-running-foundation.md`](../auto-running-foundation.md). Engine:
`scripts/autonomy-check.mjs` · tests: `test/autonomy-check.test.mjs`.*

> Prepare and propose; the human makes the irreversible move.

---

## The one thing to know

```
npm run autonomy:check
```

It prints the ledger of everything that runs unattended and what it may write, then fails if
any workflow is undeclared, over-permissioned, or doing something prohibited. It runs in CI on
every push, in the `site-checks` job.

---

## What problem this solves

The irreversibility boundary was prose. Prose is what everyone means to follow and nobody can
check. `policies/autonomy.yaml` is the same rule as data — three classes, twenty-eight
classified actions, every workflow declared, nine prohibited patterns — so CI enforces it
instead of us remembering it.

Nothing in the file grants an agent anything it did not already have. It describes and
constrains what is already running.

---

## The three classes

**Green — an agent acts unattended.** Reversible, observable, receipt-emitting; undoing it
costs nothing. Crawls, link checks, test runs, audits, drift reports, digests, opening an
issue, drafting a PR.

**Yellow — an agent prepares; a human merges.** The agent does all of the work and none of the
deciding, and the output is a pull request. Content, code, skills, policies (including this
one), site copy, dependency pins. This is the Yes-Gate applied to the Foundation's own
bureaucracy, and it is where most of the value lives.

**Red — never autonomous, ever.** DNS and registrar. Creating accounts, enrolling keys,
entering credentials. Deleting data, force-pushing, rewriting history. Access control and repo
settings. Transferring, renaming or archiving a repository. Retiring a github.io mirror.
Accepting a member, granting access, sending mail as a founder. Money. Disabling a gate.

**No workflow may be classified red.** If a job would need one of these, the job is wrong — it
should stop and ask. The checker enforces that.

The classes map onto the markers already used in `plan/MILESTONES.md`: Green = `[auto]`,
Yellow = `[auto]` ending in a PR, Red = `[gate]`.

---

## What the checker actually enforces

1. **Every workflow on disk is declared, and every declared workflow exists.** Undeclared
   automation is the failure this exists to prevent: a job nobody classified is a job nobody
   decided was safe. Add a workflow without a policy row and CI fails.
2. **Every workflow declares `permissions:` explicitly.** An inherited default is an *unknown*
   permission set, and unknown is not green — the same rule `estate.yaml` and the estate map
   run under. Four workflows were inheriting silently when this was written (`ci`,
   `deploy-validate`, `link-check`, `secret-scan`); all four now declare `contents: read`.
3. **Real permissions match the policy, and never exceed the class cap** (read < write).
4. **Anything holding `contents: write` declares its write paths**, and every path it actually
   `git add`s is inside that allowlist. `git add -A` and `git add .` can never be green.
5. **No prohibited pattern appears in any workflow** — force-push, `--force-with-lease`,
   `gh repo delete`, remote branch deletion, repo-settings edits, `gh pr merge`, `--no-verify`,
   piping a brokered secret to stdout. A comment describing one is not doing one.

### The one workflow that writes to `main`

`estate-interaction-crawl.yml`, and only these three paths:

```
docs/estate-health.json   docs/.estate-notified   docs/.estate-last-window
```

All three are machine-written artifacts the next run regenerates, which is exactly what keeps
this green rather than red. An agent writing prose or code to `main` is not green — it is
yellow, and it arrives as a pull request.

---

## What it deliberately does not do

It does not parse Actions YAML in general. That is a large and hostile grammar, and a parser
that half-understood it would report green on something it misread. It reads two narrow things
by design — the top-level `permissions:` block (flow spelling, block spelling, and the
`read-all`/`write-all` shorthands) and the `git add` lines — and **anything it cannot read
confidently fails rather than passes**.

It also does not enforce job-level `permissions:` overrides. A job can currently narrow the
top-level grant; it cannot widen it past what the workflow declares, so the cap still holds.
Reading job-level blocks is the obvious next increment.

---

## How to change it

1. Adding a workflow? Add its row to `workflows:` in the same commit. CI will tell you if you
   forget, which is the point.
2. Changing a class, an action's classification, or a prohibition is a **Yellow** change to a
   **Red** subject: an agent may draft it, and only a founder merges it. `policies/` is one of
   the paths CODEOWNERS will require both founders on (PR 3).
3. `npm run autonomy:check` before you push.

A policy that can rewrite itself unattended is not a policy.
