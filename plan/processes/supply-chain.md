# Process — the supply chain (pinning what our automation pulls in)

*Rule of record for third-party actions and third-party skills. Ladder row 10 of
[`plan/MASTER-PLAN.md`](../MASTER-PLAN.md). Policy: `policies/autonomy.yaml`
(`supply_chain:`) · checker: `scripts/autonomy-check.mjs` · tests:
`test/autonomy-check.test.mjs`.*

---

## The one thing to know

Every third-party `uses:` in a workflow names a **40-character commit SHA**, with the
human-readable version in a trailing comment:

```yaml
- uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
```

`npm run autonomy:check` fails the build on anything else.

---

## Why a tag is not a pin

A tag is a pointer, and the person who owns the repository can move it. Pin to `@v4` and you
have not chosen a version — you have subscribed to whatever that owner publishes next, and it
runs inside our jobs with whatever the token can reach.

This is not theoretical here. The 2026-07-19 estate review found the **1Password action
pinned to `@v4` with the vault service-account token in scope**, and wrote the finding up as
W2-8: *a tag re-point exfiltrates the estate's canonical secret store.* That one was fixed.

What the fix missed, and this row found: **ten more `uses:` lines were still on mutable
tags** — `actions/checkout@v4`, `actions/github-script@v7`, `actions/setup-node@v4`,
`actions/upload-artifact@v4`, across `estate-fix-request`, `estate-interaction-crawl` and
`reusable-interaction-crawl`. Two of those workflows hold `issues: write`, and one holds
`contents: write` on `main`. All ten are now SHA-pinned, and the gate keeps them that way.

The lesson is the one this repo keeps relearning: fixing the instance is not fixing the
class. A finding without a gate comes back.

---

## First-party is exempt, and why that is safe

Two prefixes are excluded, declared in `policies/autonomy.yaml`:

- `./` — this repo's own tree.
- `aigovops-foundation/aigovops-library-june-ken-bob/` — our own reusable workflows, referenced
  at `@main`.

Those are same-repo references, not supply-chain edges: the same people who can move that
`main` can already push to the file calling it. Pinning them would add ceremony without
removing an attacker.

When the estate adopts these reusables from *other* repos (M3), that changes — a different
repo calling ours at `@main` is trusting a branch it does not control. The reusable workflows'
own headers should carry a release tag by then.

---

## Third-party skills follow the same rule

A skill carrying a `source:` field came from outside this repo. It is a dependency, and it is
read as **adversarial input** — 84.2% of the vulnerabilities found across the 98,380-skill
study lived in documentation, not code. A skill whose procedure body says "ignore previous
instructions" is an exploit with a README.

So a third-party skill must declare:

```yaml
source: https://github.com/someone/their-skills
pinned: <40-character commit SHA>    # the exact commit that was read
reviewed: 2026-08-22                 # by a human, on this date
```

**We have none today**, which is the cheapest possible moment to write the rule. Enforcement
lands in `scripts/skills-check.mjs` as a one-line addition once the skills-as-code row (#62)
merges — it is written and tested there, and deliberately not stacked onto this PR so each
stays independently reviewable.

---

## Reviewing a bump

1. Read the diff between the pinned commit and the new one. Not the release notes — the diff.
2. Prose counts as code. A changed README, description or procedure body is a change.
3. Update the SHA and the trailing version comment together, so the pin stays legible.
4. `npm run autonomy:check`, then open a PR. Dependency bumps are Yellow: an agent prepares,
   a human merges.

A bump that cannot be diffed is a bump that does not land.
