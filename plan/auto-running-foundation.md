# The auto-running AiGovOps Foundation — one repo, one clock, one gate

*A working plan for Bob and Ken, drafted 2026-08-22 from the Perplexity council review
(GPT-5.6 Sol Thinking + Claude Opus 5 Thinking). It is a **proposal**, not a change: every
irreversible move in it — a transfer, a rename, a DNS record, an archive — waits for one of
you to make it. Nothing here has been executed.*

> Agents do the bureaucracy; humans hold the meaning — and humans hold the keys.

---

## 1 · How to use this document

Read section 3 first — the seven decisions. They take about forty-five minutes between the
two of you and they unblock everything else. Sections 4 through 7 are the design; section 8
is the PR ladder an agent can start executing the moment the decisions land. Section 10 is
the honest list of what could go wrong.

The plan runs **twelve weeks**, from Monday 2026-08-24 to Friday 2026-11-13, and it ends
with a Foundation that keeps itself current without either of you doing bureaucracy — while
still holding every key that matters.

---

## 2 · The thesis, in one paragraph

The council's diagnosis is right and it is not a content problem: the Foundation has more
working material than it has canonical ownership. Jeeves, Beacon, Umbrella, Lantern, the
governed core, thirteen written skills, a manifesto that reads like a specification, and an
hourly interaction crawler — all real, all working, scattered across five domains, two
GitHub accounts and eight-plus repositories, with no single place that says what is true.
An **auto-running foundation** is not more automation on top of that. It is three things:
**one repo** (so there is exactly one source of procedure), **one clock** (so the recurring
work happens whether or not anyone remembers), and **one gate** (so everything the clock
produces arrives as a proposal a human decides). We already have the third — the Yes-Gate is
the product. We already have most of the second — see section 6. What we do not have is the
first, and that is the twelve weeks.

---

## 3 · The seven decisions (this sitting)

Each carries a recommendation. Disagree freely — the point of writing them down is that the
argument happens once, here, instead of leaking into every PR for three months.

### D1 — Canonical domain: **`aigovops-foundation.com`**

The two models split on this. Sol read the live `.com` estate; Claude weighted the `.org`
manifesto and the `.org`-suits-a-501(c)(3) instinct. Our own repo settles it: every property
this repo already monitors is on `.com` — `estate-sites.json` lists
`www.aigovops-foundation.com` and `community.aigovops-foundation.com`, and the Library's own
`redirect-stub/` already points deep links at `community.aigovops-foundation.com/library/`.
The `.com` is the built estate. Moving to `.org` means re-pointing work we have already done
and re-earning the search equity behind it.

**Recommendation:** `.com` is canonical; every `.org` variant 301s into it;
`aigovops.community` stays email-only. Claude's Google Ad Grants point holds either way — the
requirement is *one* domain with GA4 and HTTPS, not a particular TLD, and we are disqualified
today on the multi-domain rule regardless of which one we pick.

**Needs a founder:** yes — registrar and DNS are Red (section 7).

### D2 — `a-i-gov-ops.com`: **redirect it this week**

It is live with competing hero copy. Anyone who meets us at a talk and types the hyphenated
name reads a different value proposition than the manifesto. That is a credibility leak in
front of exactly the sponsors and standards bodies the Fourth Force targets. 301 it to the
canonical domain; do not redesign it, do not keep it as an experiment.

**Needs a founder:** yes — Red.

### D3 — The mono-repo trunk: **`Aigovops-Foundation-Open-Source-V4-10k`**, transferred to the org and renamed `aigovops`

Bob's instruction — treat these as one mono-repo — overrides both models, who each argued
for fewer moving parts in a different direction. It is the right call for the same reason
they were both nervous: the disease is *canonicity*, and a mono-repo is the only structure
where "which copy is true" cannot be asked.

Two candidate trunks. **V4-10k** carries the most code and the longest history (28
workspaces, 188 tests), and making it the trunk resolves the ambiguity the council flagged
about its role — is it a monorepo, a reference integration, an incubator, a predecessor? —
by answering *monorepo*, permanently. **This Library repo** carries the automation spine and
the plan tree, but grafting 28 workspaces in here is more work than grafting docs into
there.

**Recommendation:** V4-10k is the trunk. Transfer it to `aigovops-foundation` **first**
(while it is still Bob's to transfer), then rename it to `aigovops` inside the org. Net new
repositories created: **zero**. The repo count goes *down*, which is what the council asked
for.

**Correction to draft one, and it changes the sequencing.** I wrote that redirects mean no
existing link breaks. That is true for `github.com/...` URLs and for git remotes; it is
**false for GitHub Pages**. Our own 2026-07-19 estate review found exactly this failure:
`bobrapp.github.io/{aigovops-beacon,umbrella-govops}` both 404'd after the org move, because
**Pages does not follow the repo-rename redirects that github.com does** — 138 references
pointed at nothing, including a QR code printed on a presentation slide, while the
`github.com/...` links beside them silently resolved.

So the rename in D3 will kill `bobrapp.github.io/Aigovops-Foundation-Open-Source-V4-10k/`,
which **the Library hub links today** (the "Open Source v4" card in `docs/index.html`). The
pre-step is not optional: repoint every reference to that Pages URL *before* the rename, and
sweep the estate for others afterwards. `estate.yaml` now records that link and its fate.

One standing rule that comes with this: **never create a repository at a name we have freed
up.** A new repo at an old name silently kills the redirect that was protecting every
existing github.com link.

**Needs a founder:** yes — transfer and rename are Red.

### D4 — What does *not* go in the mono-repo

Everything that owns people, money, or consent stays where it is: **Circle** owns membership,
**Stripe/Zeffy** own donations, the **CRM** owns constituents. Git owns *how the Foundation
works*; transactional systems own *what happened to whom*. This is not a preference, it is
the ledger rule we already run under — the ledger and beacons are metadata-only, no
payloads, no PII, ever.

The one genuine exception worth naming: the durability plan calls for a **daily ledger export
to a private repo**. That is one net-new private repo, and it is the only one this plan
proposes. Flagging it rather than sliding it past you.

### D5 — Wordmark: **AiGovOps**, one spelling, everywhere

We currently ship four — AiGovOps, AIGovOps, AI GovOps, Aigovops. To anyone doing sponsor or
regulator due diligence that reads as four organizations. Pick `AiGovOps` (it is the form the
manifesto and this repo already use), and add it to the CI content check so it cannot drift
back.

**Needs a founder:** no — this is Yellow. An agent prepares the sweep; you merge it.

### D6 — Read-only GitHub connection for the disposition pass

Neither model could produce a repository-by-repository disposition matrix, because neither
could read the repos. A fine-grained token or GitHub App scoped to **metadata, contents,
issues, pull requests and Actions — read only; no administration, no secrets, no workflow
write, no delete** — makes that matrix a day's work instead of a guess. A separate,
narrowly-scoped write identity comes later and only ever opens PRs.

**Needs a founder:** yes — credential creation is Red. But it is a *read* credential, which
is the cheapest possible unblock.

### D7 — Ken's GitHub handle

`founders.json` still carries the TODO: we have Ken's email, not his handle. CODEOWNERS
cannot require his review until we have it, which means D7 blocks the single most important
control in this whole plan. One line, one minute.

**Needs Ken:** yes.

---

## 4 · The mono-repo

### Shape

```
aigovops-foundation/aigovops          ← the trunk (was V4-10k)
  estate.yaml                         ← the manifest: every domain, repo, form, cost, owner,
                                        data classification. One input; many outputs.
  policies/
    principles.yaml                   ← the 11 Principles, as data
    autonomy.yaml                     ← Green / Yellow / Red per action class (section 7)
    roles.yaml                        ← co-founder / steward / member; permission is the union
  skills/                             ← every SKILL.md, each with PRINCIPLE: frontmatter
  .claude-plugin/ + marketplace.json  ← one `/plugin marketplace add` and a volunteer has it all
  core/                               ← the governed core: yesgate.shared.js, SecretsProvider
  products/
    beacon/ lantern/ umbrella/ library/ vendor-rfi/ ncw-ai-camp/ aiupdates/
  sites/
    foundation/ community/            ← the porch and the community platform's static surface
  ops/
    workflows-source/                 ← the clock (section 6)
    runbooks/ crawler/ digests/
  docs/                               ← the built public surface
  plan/                               ← durable markdown sources (this file's descendants)
```

### How things move — history preserved, nothing deleted

Each product arrives by `git subtree add --prefix=products/<name>`, which keeps its full
commit history inside the trunk. The source repository is then **archived, not deleted** —
archiving keeps its URL, its stars, its issues and its redirects alive and read-only, and it
is reversible. Deletion is never on the table; it is Red and it is also just wrong here.

The trap to plan around: **an archived repo keeps serving its GitHub Pages site.** Merge a
product in and archive its repo, and `aigovops-foundation.github.io/<repo>/` keeps serving
the old copy forever — a second source of truth, which is precisely the disease. So every
product merge has a matching Pages disposition: replace the source repo's `docs/` with the
`redirect-stub/` pattern this repo already ships (deep-link-preserving, `noindex, follow`)
pointing at the canonical domain, *then* archive. Per the house rule, **retiring a github.io
mirror is a steward-shipped move — never autonomous.**

### The honest costs of a mono-repo

Worth saying out loud before we commit, because they are real and they arrive later than the
benefits:

- **One Pages site.** A repo publishes one Pages site. Consolidation therefore forces the
  canonical-domain decision (D1) to be real, not aspirational — products get served at
  `aigovops-foundation.com/<product>/` or they are not served.
- **CI blast radius.** One broken workflow can red every product at once. Mitigation: path
  filters per product, and the `red-main-watchdog` we already run daily.
- **CODEOWNERS granularity matters more.** In a mono-repo, `policies/` and `skills/` sit
  beside code a volunteer might touch. The two-founder requirement on those paths is the
  whole gate; get it in before the first outside contributor, not after.
- **Clone size.** 28 workspaces plus seven products plus an MP4 is a large first clone.
  Tolerable; worth a `.gitattributes`/LFS look before it is a complaint.
- **Release cadence couples.** If the skills library later outgrows this — past forty entries
  with its own release rhythm — split it out then. Splitting later is cheap; merging later is
  not, which is the argument for merging now.

---

## 5 · The manifesto as specification

The single most valuable idea in either model's review, and it costs one line per file: every
skill declares which of the 11 Principles it implements.

```yaml
---
name: estate-health
principle: P5            # "Observability is non-negotiable. What we can't trace, we can't trust."
owner: bobrapp
risk: green
description: ...
---
```

The council framed this as authoring three new skills. We are further along than that:
**thirteen skills already exist** in `plan/skills/` with frontmatter, procedures, owning
agents, and a process index that maps each to a discipline. So the first skills PR is a
*migration and annotation* PR — move the tree to `skills/`, add `principle:`, `owner:` and
`risk:` to thirteen files, and add a CI check that fails on a skill with no principle. That
turns the manifesto from a page people read into a spec CI tests against, and nobody else in
AI governance can currently claim that.

The three *new* fat skills the council asked for — the monthly AI House session announcement,
the sponsorship proposal, and the Foundation editorial voice — are the falsification test in
M2, not the foundation of the library.

**Third-party skills are dependencies.** Pin them to reviewed commits, never a floating ref,
and read their prose as adversarial input: 84.2% of the vulnerabilities found across the
98,380-skill study lived in documentation, not code. A skill that says "ignore previous
instructions" in its procedure body is an exploit with a README.

**No skill edits itself in production.** Improvement arrives as a PR, reviewed under
CODEOWNERS, or it does not arrive.

---

## 6 · The clock — most of it already exists

This is the part the council could not see from outside, and it changes the shape of the
work. The recurring machinery of an auto-running foundation is already built and running *in
this repo*:

| Cadence | What runs today | Where |
|---|---|---|
| Hourly | Estate interaction crawl — every button on every page, in a real browser | `estate-interaction-crawl.yml` |
| Daily | Library test suite; red-main watchdog (15:00 UTC — a working-hours alarm, not a 3am one) | `library-tests.yml`, `red-main-watchdog.yml` |
| Weekly | Link check (Mon 16:00 UTC); repo-sync check (Mon 13:00 UTC) | `link-check.yml`, `repo-sync-check.yml` |
| Monthly | Stale sweep (1st, 14:00 UTC) | `stale-sweep.yml` |
| Continuous | Secret scan; dependency triage | `secret-scan.yml`, `reusable-dependency-triage.yml` |

More to the point, **seven of these are already written as reusable workflows** with adoption
instructions in their headers — `reusable-link-check.yml` literally documents how another
repo calls it in one line. Exactly one of the seven has actually been adopted cross-repo
(`repo-sync-check`). Six standing invitations, unaccepted, for two years' worth of good
reasons that all amount to *it is another repo*.

**The mono-repo is what makes them run everywhere by default.** Cross-repo adoption becomes a
local `uses: ./.github/workflows/...` in one matrix over `estate.yaml`. That is the single
biggest automation win available, and it is configuration, not invention.

What is genuinely missing from the clock, and lands in M3:

- **A receipt on every scheduled run.** We have Ed25519 signing and JCS canonical form in
  Beacon already; a hook that emits one signed metadata-only receipt per skill or workflow
  run is wiring. Then "what has the Foundation done unattended this month" is a query, not a
  memory.
- **A weekly founders' digest** that is one page: what ran, what flipped red↔green, what
  proposals are waiting on a human, what drifted from `estate.yaml`. `founders.json` and the
  estate-health digest are the seed.
- **Drift detection against `estate.yaml`** — a property in the manifest with no live
  monitor, a repo not in the manifest, a page whose owner left. Drift is the thing that
  silently un-automates an automated organization.

---

## 7 · Autonomy classes — reconciling two vocabularies

The council proposed `autonomy.yaml` with Green/Yellow/Red. This repo already runs
`[auto]`/`[gate]` in `plan/MILESTONES.md`. They are the same idea at different resolutions;
`autonomy.yaml` writes the existing house rule down as data:

**Green — an agent acts unattended.** Reversible, observable, receipt-emitting. Crawls,
link checks, test runs, audits, drift reports, digests, drafting a PR. Green work does not
ask permission because undoing it costs nothing.

**Yellow — an agent prepares; a human merges.** Every content change, every skill change,
every policy edit, every site copy change. The agent does all of the work and none of the
deciding. This is the Yes-Gate applied to the Foundation's own bureaucracy, and it is where
most of the value lives.

**Red — never autonomous, ever.** DNS and registrar changes. Creating accounts, enrolling
keys, entering credentials. Deleting data, force-pushing, rewriting history. Changing access
controls, sharing, or repo settings. Committing or pushing to `main`. Accepting a member,
granting access, or sending mail as Bob or Ken. Retiring a github.io mirror. Anything
touching money.

The mapping is exact: Green = `[auto]`, Yellow = `[auto]` that ends in a PR, Red = `[gate]`.

**Drafted, and it caught something on its first run.** `policies/autonomy.yaml` now holds the
three classes, twenty-eight classified actions, all nineteen workflows, and nine prohibited
patterns; `scripts/autonomy-check.mjs` enforces it in CI. The first run found **four workflows
with no `permissions:` block at all** — `ci`, `deploy-validate`, `link-check` and
`secret-scan` were running on the repository default, which is to say on a permission set
nobody in this repo had ever stated. All four now declare `contents: read`. That is what
writing a rule down as data buys: an automated organization that can prove its own limits,
and finds out where it could not.

---

## 8 · Milestones

Dated, each ending in something demonstrable. **[auto]** = an agent can finish it reversibly.
**[gate]** = it crosses the irreversibility boundary and waits for Bob or Ken.

### M0 — Decisions · Sat 2026-08-22 → Mon 2026-08-24 · [gate]
The seven decisions in section 3. **Done when** each has an answer written into this file and
Ken's handle is in `founders.json`.

### M1 — Consolidation gate · Week 1, Mon 2026-08-24 → Fri 2026-08-28
The week with no new code in it. Transfer V4-10k to the org and rename it `aigovops`; apply
for GitHub for Nonprofits; land CODEOWNERS requiring both founders on `policies/`, `skills/`
and `.github/`; write `estate.yaml` from the three proto-manifests we already have
(`estate-sites.json`, `founders.json`, `repo-audit.config.json`); 301 `a-i-gov-ops.com`;
publish the redirect map. **Done when** no Foundation production IP sits under a personal
account and `estate.yaml` describes every property we own.

### M2 — Skills as code + the falsification test · Week 2, Mon 2026-08-31 → Fri 2026-09-04
Migrate the thirteen existing skills into `skills/` with `principle:`/`owner:`/`risk:`
frontmatter and a CI check that fails an unprincipled skill. Add the three new fat skills
(AI House announcement, sponsorship proposal, editorial voice), each with acceptance criteria
and an output schema. Wire `marketplace.json` and the plugin manifest. Then hand it to **one
volunteer for one weekend** and read what comes back. **Done when** we can honestly say
whether their output is indistinguishable from ours. A no is a result, not a failure — it
tells us the skills carry procedure but not voice, which is the cheapest thing to learn now
and the most expensive to learn at twenty skills.

### M3 — The clock, everywhere · Weeks 3–4, Mon 2026-09-07 → Fri 2026-09-18
Turn six unadopted reusable workflows into one matrix over `estate.yaml`. Emit a signed
Beacon receipt on every scheduled run and every skill run. Ship the weekly founders' digest
and the `estate.yaml` drift check. **Done when** a week passes in which neither founder
touched the recurring work and the digest proves it ran.

### M4 — One front door · Weeks 5–6, Mon 2026-09-21 → Fri 2026-10-02
Redirects live estate-wide. The Library served on the canonical domain with an **ungated
preview** (the funnel currently leaks across three hostnames before any value exchange:
search → GitHub Pages → JS redirect → Circle registration). GA4 and HTTPS verified; Google Ad
Grants submitted. **Done when** one hostname serves everything and a stranger can read
something real before being asked for anything.

### M5 — The skills library proper · Weeks 7–9, Mon 2026-10-05 → Fri 2026-10-23
Expand to roughly twenty skills across executive, editorial, events, community, development
and governance, with department scoping so the content volunteer never loads finance skills.
**Done when** a new volunteer's first day is one install command and a scoped skill set.

### M6 — Skill provenance · Weeks 10–12, Mon 2026-10-26 → Fri 2026-11-13
Ship Skill Provenance as a Beacon/Lantern extension — signed skills, verifiable at install,
using the Ed25519 + JCS we already have. Publish the repo. Instrument the Circle gate
honestly: at $219/month against a gated library, if registration-to-participation stays low
after the domain fix, the library belongs on the public site. **Done when** a third party can
verify a skill we published came from us, unaltered.

### M7 — Steady state · from Mon 2026-11-16
The Foundation runs its own bureaucracy. Quarterly: re-read `estate.yaml` against reality,
re-audit third-party skill pins, rehearse disaster recovery, and re-ask which Yellow items
have earned Green.

---

## 9 · The PR ladder

Every row is one reviewable PR. **Class** is the autonomy class from section 7 — Green ships
itself, Yellow waits for a merge, Red waits for a founder to act outside GitHub. Repos are
named as they will be *after* M1.

| # | M | Repo / path | What | Class |
|---|---|---|---|---|
| 0 | M0 | library → `plan/`, `docs/` | **This plan** — markdown source, rendered page, hub link | Yellow |
| 1a | M1 | library + estate | Repoint every reference to `bobrapp.github.io/Aigovops-Foundation-Open-Source-V4-10k/` — Pages does not survive a rename | Yellow |
| 1b | M1 | — | Transfer V4-10k to the org; rename to `aigovops` | **Red** |
| 2 | M1 | — | Apply for GitHub for Nonprofits (free Team) | **Red** |
| 3 | M1 | `aigovops/CODEOWNERS` | Both founders required on `policies/`, `skills/`, `.github/`; branch protection on `main` | Yellow (needs D7) |
| 4 | M1 | `estate.yaml` + `scripts/estate-manifest.mjs` | **Draft shipped.** The manifest, plus a validator that regenerates `estate-sites.json` byte-identically and fails CI on drift against all three proto-manifests. 42 rows still unverified pending D6. Moves to the trunk at M1. | Yellow |
| 5 | M1 | — | 301 `a-i-gov-ops.com` → canonical; publish the `.org` redirect map | **Red** |
| 6 | M1 | `policies/autonomy.yaml` + `scripts/autonomy-check.mjs` | **Draft shipped.** Green/Yellow/Red as data: 28 classified actions, all 19 workflows declared, 9 prohibited patterns, and a CI gate that fails on undeclared automation, an inherited permission default, or an unbounded write. Found and fixed 4 workflows running on the repo default. Moves to the trunk at M1. | Yellow |
| 7 | M2 | `aigovops/skills/` | Migrate 13 skills; add `principle:`/`owner:`/`risk:`; CI fails an unprincipled skill | Yellow |
| 8 | M2 | `aigovops/skills/` | Three fat skills: AI House announcement, sponsorship proposal, editorial voice | Yellow |
| 9 | M2 | `aigovops/marketplace.json`, `.claude-plugin/` | One-command install; department scoping stub | Yellow |
| 10 | M2 | `aigovops/skills/THIRD-PARTY.md` | Pin policy + pinned commit list for any external skill | Yellow |
| 11 | M3 | `aigovops/.github/workflows/` | One matrix over `estate.yaml` calling the six unadopted reusable workflows locally | Yellow |
| 12 | M3 | `aigovops/ops/receipts/` | Beacon receipt hook on every scheduled and skill run (metadata only) | Yellow |
| 13 | M3 | `aigovops/ops/digests/` | Weekly founders' digest + `estate.yaml` drift check | Yellow |
| 14 | M3 | products (subtree) | `git subtree add` each product, one PR per product, history preserved | Yellow |
| 15 | M3 | old product repos | `redirect-stub/` into each merged repo's Pages, then archive | **Red** (steward-shipped) |
| 16 | M4 | `sites/foundation/` | Redirect map live; canonical domain serves everything | **Red** for DNS, Yellow for content |
| 17 | M4 | `sites/foundation/library/` | Library on the canonical domain with an ungated preview | Yellow |
| 18 | M4 | — | GA4 + HTTPS verified; Ad Grants submitted | **Red** |
| 19 | M5 | `aigovops/skills/` | ~20 skills, department-scoped (one PR per department) | Yellow |
| 20 | M6 | `products/beacon/`, `products/lantern/` | Skill Provenance: sign a skill, verify at install | Yellow |
| 21 | M6 | — | Circle instrumentation decision: keep gated, or move the library public | **Red** |

Green work — the crawls, audits, drift reports and digests — does not appear as PRs. That is
the point of Green: it runs, it emits a receipt, and it only reaches you when something
flipped.

---

## 10 · What could go wrong

**The mono-repo migration eats the twelve weeks.** Seven subtree merges, seven Pages
dispositions, one CI matrix. Mitigation: M1 and M2 deliver value before a single product
moves — the manifest, CODEOWNERS, the skills tree and the falsification test all land first.
If the migration stalls, we still have a governed skills library and a canonical domain.

**The falsification test fails and we keep going anyway.** If a volunteer's output is
obviously not ours, the honest response is to fix the skills before writing seventeen more,
even though M5 is already on the calendar. Write that down now, while it is cheap to agree
to.

**CODEOWNERS arrives after the first outside contributor.** Then the gate is theatre. PR 3
is early in the ladder for that reason, and it is blocked only by D7 — one line.

**A Pages URL dies on a rename and nobody notices.** Not hypothetical — it already happened
once, to 138 references. Every rename and every archive in this plan needs a link sweep
before and after, not just a redirect assumption.

**A stale Pages mirror outlives its merge.** Covered in section 4; it is the most likely
concrete way this plan creates a second source of truth while trying to remove one.

**We automate the reporting of work that is not happening.** A weekly digest that always says
green is a digest nobody reads. The estate-health rule already has the right instinct — never
turn a `failOnDead` gate off to fake green — and it applies to every new check in M3.

---

## 11 · What we are deliberately not doing

No new website. No new repositories beyond the single private ledger archive named in D4. No
rewrite of the governed core — it works, and Ticket 0 (`SecretsProvider` + FileProvider) is
already implemented. No self-modifying skills. No agent that accepts a member, sends mail as
a founder, moves money, or touches DNS. And no new repos of any kind until the disposition
pass is done — the sprawl compounds, and every repo added now makes the consolidation more
expensive.

---

*Reviewed by:* **Bob Rapp** ______  ·  **Ken Johnston** ______  ·  *Date:* __________

*Decisions D1–D7 recorded above on:* __________
