# Process — the estate manifest (`estate.yaml`)

*Rule of record for how the estate describes itself. Drafted 2026-08-22 as PR 4 of
[`plan/auto-running-foundation.md`](../auto-running-foundation.md). Engine:
`scripts/estate-manifest.mjs` · tests: `test/estate-manifest.test.mjs`.*

---

## The one thing to know

```
npm run estate:check
```

Validates `estate.yaml` and fails if any file derived from it has drifted. It runs in CI on
every push, in the `site-checks` job.

---

## What problem this solves

The estate's facts were spread across three JSON files that nobody reconciled —
`estate-sites.json` (what the crawler visits), `founders.json` (who gets the digest),
`repo-audit.config.json` (which accounts get audited) — plus a dozen prose documents that
each knew a different part of the truth. Nothing checked them against each other, so nothing
noticed when they disagreed.

`estate.yaml` is the one input. Those three files become **views** of it:

| View | Derived from | Enforced by |
|---|---|---|
| `estate-sites.json` | `sites[]` where `crawl.enabled` | `--check` (drift), `--regen` (rewrite) |
| `founders.json` | `people[]` with the `co-founder` role | `--check` — emails and handles must match |
| `repo-audit.config.json` | the distinct `repos[].account` values | `--check` — no account may go unaudited |

`--regen` reproduces `estate-sites.json` **byte-identically** today, which is the proof that
the manifest really is the source and not a parallel description of one.

---

## The honesty rule

Every row carries `verified:`. `verified: false` means the row came out of our own documents,
not out of the live system or the GitHub API — which cannot happen until decision **D6** (the
read-only connection) is made. The run counts and prints every unverified row, every unknown
cost, every unknown status and every unclassified store.

Unknowns **do not fail the build**. They are the honest to-do list, and they are loud. Draft
one has **42** of them.

This follows the rule the estate map learned the hard way on 2026-07-19: a check that could
not run reads as **unknown**, never as green. "Everything is fine" requires zero problems
*and* zero unknowns. A page that renders a failed check as a tick is worse than no page,
because it actively buys false calm — a backup job green for weeks while copying nothing is
the canonical example, and it is a row in this manifest.

The same rule sets the default classification. A page nobody had classified once defaulted to
PUBLIC and put the member directory in the open. Here the default is `unknown`, and `unknown`
is never treated as safe.

---

## Why a hand-rolled YAML parser

Node 20 ships no YAML parser. Adding a dependency to the repo that audits its own supply chain
— the same repo that found a 1Password action pinned to a mutable tag with the vault token in
scope — buys a convenience with a governance cost.

So the script reads a deliberately **small subset**: block mappings, block sequences, scalars,
comments. Anything else — flow collections, anchors, aliases, block scalars, tabs, odd
indentation, duplicate keys — is a hard error naming the construct and the line number. It
fails closed rather than guessing, and the rejection tests are the ones that matter most: a
parser that silently mis-reads a construct hands us a manifest that looks fine and is wrong,
which is precisely what the manifest exists to prevent.

If the subset ever becomes a constraint, the honest fix is a pinned, reviewed dependency —
not a cleverer parser.

---

## The shape

```yaml
version: 1
status: unknown              # the manifest itself is a draft until founders ratify it
canonical_domain: null       # pending D1

domains:      # role, registrar, what it serves, who owns it
repos:        # account, role, visibility, disposition (trunk | subtree-into-trunk | keep-separate | pending-disposition)
sites:        # every served URL, its repo, its classification, and its crawl settings
services:     # the running processes and the hosts under them
outside:      # the companies we do not own — cost, owner, what breaks without them
data_stores:  # where data lives and what class it is
people:       # roles are a set; permission is the union
```

Classifications: `public` · `operational` · `personal` · `secret` · `unknown`.
Statuses: `live` · `prepared` · `pending-founder` · `retired` · `unknown`.

---

## How to change it

1. Edit `estate.yaml`. Add `source:` for anything you did not verify yourself, and leave
   `verified: false` until you actually checked.
2. `npm run estate:check`.
3. If the crawler's list changed on purpose, `npm run estate:regen` and commit both files.
4. Open a PR. `estate.yaml` is Yellow — an agent prepares it, a human merges it. Nothing in
   the file causes an action; it describes what we believe we have.

---

## What it is not

It is not a secret store, and it never holds a credential — only the name of the vault that
does. It is not a member or donor record: people, money and consent live in Circle, Stripe
and the CRM, per D4. It holds the two founders and their roles, which `founders.json` already
made public.

It is also not yet true. It is draft one, written from documents, and its most valuable rows
are the ones that say so.
