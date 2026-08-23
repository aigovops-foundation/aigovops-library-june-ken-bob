# Repository estate audit

> What we own on GitHub, what state it is in, and what is missing — as a text file
> you can read, mail, or file as a dated record.

The estate interaction audit (`plan/processes/estate-interaction-audit.md`) watches the
*rendered* estate: does every button on every page actually do something. This is its
counterpart one layer down: does every **repository** behind those pages have the things
that make it maintainable, publishable and safe. Same posture — the agent runs the crawl
and writes the finding; the human makes the irreversible move.

## Running it

```bash
# full audit — needs a token with `repo` scope
GITHUB_TOKEN=$(gh auth token) npm run audit:repos

# no token, or the API is unreachable: audit the inventory only
npm run audit:repos:offline
```

Both npm shortcuts pass `--open`: when the run finishes it copies the report to the
clipboard and reveals it in the file manager, so the last step is *paste* rather than hunt
for a path. A report nobody opens is a report nobody read. Every run also prints the
`cat` / `pbcopy` / `open -R` commands, so the handoff works even when `--open` can't (no
clipboard tool, headless CI). Nothing there can fail a run — a missing `pbcopy` must never
turn a successful audit into a failed one.

Outputs land in `audit/`, which is **gitignored on purpose**. The report enumerates
private repository names and this repo is public; the script and its config are source,
the reports are not. Same lesson as `keys/*.pem` — the ignore rule covers the whole
directory, not the one file we happened to be thinking about.

Useful flags: `--owners a,b`, `--stale-days N`, `--dormant-days N`, `--no-deep`,
`--out PATH`, `--json PATH`, `--include-archived`. `node scripts/repo-audit.mjs --help`
is the header comment of the script itself.

## The two tiers, and why the report shouts about them

**Inventory tier** needs no token. It reasons about the estate as a whole from repo
metadata: which owner holds what, staleness, archive candidates, near-duplicate names,
date-stamped names, scratch repos, the public/private mix.

**Deep tier** opens each repository and checks README, LICENSE, description, topics,
`.gitignore`, a CI workflow, tests, `SECURITY.md`, dependabot, CODEOWNERS, open and
stale PRs, and root-level files whose *names* look like credentials.

If the deep tier cannot run — no token, or every call refused — the report says so in a
box at the top and the inventory findings stand alone. This is deliberate. An audit that
quietly reports "no findings" because it never opened the door is worse than no audit:
it manufactures confidence. **An empty findings list at the inventory tier means an
unopened estate, not a clean one.**

## Severities

| | meaning | example |
|---|---|---|
| `BLOCKER` | act before anything else | credential-shaped file in a public repo |
| `RISK` | real exposure or governance gap | public repo with no licence; Foundation work in a personal account |
| `GAP` | missing the thing that makes it maintainable | no README, no CI, empty repo, stale PR |
| `NOTE` | tidy-up, decide at leisure | scratch repos, date-stamped names |

Exit code is 1 when any `BLOCKER` is present, so a scheduled run fails loudly.

## What it does not do

It reads metadata and root-level file *listings*. It does not read file contents beyond
`package.json`, does not scan git history, and does not verify that a credential-shaped
file contains a credential — it flags the shape and leaves the judgement to a human.
Branch protection and org settings need admin scope and are not checked. None of this
replaces GitHub secret scanning; it catches the class of mistake that scanning missed in
June, when a dev keypair sat in HEAD of a public repo for six weeks because the ignore
rule covered one directory.

## Acting on it

Every fix line in the report is a proposal, not an action. Transfers, deletions,
archiving and credential rotation are irreversible and outward-facing: the agent prepares
and proposes, Bob or Ken decide. On a credential finding the order matters — **rotate
first, then purge from history**. A deleted secret that was already cloned is still a
live secret.

## Scheduling it

Not scheduled yet, and not a decision an agent should make alone: a workflow in this
public repo would produce artifacts naming private repositories, and the run needs a PAT
with `repo` scope in Actions secrets. Both are founder calls. Until then it is a manual
run — sensible cadence is monthly, or before any push to open more of the estate up.
