# The Master Plan — the one page Bob and Ken open

*Front door for the whole programme, drafted 2026-08-22. It holds three things and links to
everything else: the **decisions** waiting on the two of you, **where we actually are**, and
**which of our twenty-six plan documents are still in force**.*

> Agents do the bureaucracy; humans hold the meaning — and humans hold the keys.

---

## 0 · Why this document exists, and what it replaces

Nothing was missing. Three documents each claimed to be the map — `00-overview.md` ("the plan,
end-to-end"), `END-TO-END-BUILD-PLAN.md` ("one authoritative map"), `MILESTONES.md`
("consolidated roadmap") — and a fourth arrived this morning. Four front doors is the same
disease as five domains and two GitHub accounts: not a shortage of material, a shortage of
canonicity.

So this file is the front door, and every other document keeps **one job**:

| Document | Its one job now |
|---|---|
| **`MASTER-PLAN.md`** (this) | Decisions, status, the register. Start here. |
| `00-overview.md` | *How we operate* — agents, skills, processes, why every step signs a receipt. |
| `END-TO-END-BUILD-PLAN.md` | *The engineering map* — from here to the production backbone. |
| `MILESTONES.md` | *The infra-gate ledger* — M1–M9, what's `[auto]`-done and what waits at a `[gate]`. |
| `auto-running-foundation.md` | *The consolidation programme* — one repo, one clock, one gate. |

Section 4 registers all twenty-six, with a CI check that fails if a new plan document appears
without a job and a status. A plan tree nobody can index is a plan tree nobody reads.

---

## 1 · The decision sheet — about forty-five minutes

These are the whole meeting. Everything downstream sequences from them, and each carries a
recommendation so the argument happens once, here, instead of leaking into every PR for three
months. Full reasoning: [`auto-running-foundation.md`](./auto-running-foundation.md) §3.

| # | Decision | Recommendation | Blocks | Answer |
|---|---|---|---|---|
| **D1** | Canonical domain | `aigovops-foundation.com` — it is the built estate; `estate-sites.json` and `redirect-stub/` already point there | the redirect map, Ad Grants, the Library's home | ______ |
| **D2** | `a-i-gov-ops.com` | Redirect or take down this week — it is live with competing hero copy | credibility in front of sponsors | ______ |
| **D3** | Mono-repo trunk | V4-10k → transfer to the org → rename `aigovops`. **Repoint its Pages links first** (§6 risk) | every subtree merge | ______ |
| **D4** | What stays out | Circle owns membership, Stripe owns money, the CRM owns constituents. Git owns procedure | the ledger's PII line | ______ |
| **D5** | Wordmark | `AiGovOps`, one spelling, CI-enforced. We currently ship four | due diligence | ______ |
| **D6** | Read-only GitHub connection | A fine-grained credential scoped to metadata, contents, issues, pull requests and Actions — read only, nothing else | **42 unknowns in `estate.yaml`** | ______ |
| **D7** | Ken's GitHub handle | One line in `founders.json` | **CODEOWNERS — the most important control in the plan** | ______ |

**If you only answer two: D7 and D6.** D7 is one line and unblocks the two-founder gate on
`policies/` and `skills/`. D6 turns most of the estate manifest from belief into fact. Neither
costs anything and both are blocking work that is otherwise ready.

---

## 2 · Where we actually are

**Live and holding.** The governed core with the Yes-Gate and `SecretsProvider` (Ticket 0,
implemented). Beacon signing with Ed25519 + JCS. Thirteen written skills, twelve processes with
rules of record. The estate clock: hourly interaction crawl, daily tests and red-main watchdog,
weekly link and repo-sync checks, monthly stale sweep, continuous secret scan. Twenty-one
Library pages with SEO and a11y invariants gated in CI. The garden-warm design family across
the estate. A live giving rail.

**Drafted this morning, in review** (PR #61, all checks green): the consolidation plan;
`estate.yaml` — one manifest with `estate-sites.json`, `founders.json` and
`repo-audit.config.json` as derived views; `policies/autonomy.yaml` — Green/Yellow/Red as data,
enforced in CI, which on its first run found four workflows running on an unstated permission
default.

**Waiting on a founder.** The seven decisions. The 1Password cleanup left from M3. The M2
sandbox-privilege call. `help@aigovops.org`, which still cannot receive mail.

### The finding worth reading twice

We do not have a production problem. **We have a merge-queue problem.**

*Measured 2026-08-22. A dated measurement does not rot; the live version of this table is
kept current in PR #61's description.*

| PR | Opened | Still open after |
|---|---|---|
| #40 — mail-health check + estate-mailer skill | 2026-08-14 | **8 days** |
| #46 — two crawler defects, one of which stops the heartbeat | 2026-08-18 | **4 days** |
| #61 — the master plan, `estate.yaml`, `autonomy.yaml` | 2026-08-22 | same day |

All green, all Yellow-class: an agent did the work, a human decides. That is the design working
exactly as intended — and #46 fixes a hang **in the heartbeat that watches the whole estate**,
which had been sitting eight days when this was written.

No amount of further automation touches this number. The Yellow queue moves at the speed of a
founder's attention, and that is the honest constraint on everything in section 5. Worth
deciding, in this same sitting, what the review cadence is: a standing thirty minutes twice a
week would clear it.

---

## 3 · The standing rules, in one place

**The boundary.** Prepare and propose; the human makes the irreversible move. Now data, in
`policies/autonomy.yaml`, and enforced in CI.

**Green** — an agent acts unattended: reversible, observable, receipt-emitting.
**Yellow** — an agent prepares, a human merges: all the work, none of the deciding.
**Red** — never autonomous: DNS, accounts, credentials, deletion, force-push, access control,
repo transfers, retiring a mirror, accepting a member, mail as a founder, money, disabling a
gate.

**Unknown is not green.** A check that could not run reads as unknown, and "everything is fine"
requires zero problems *and* zero unknowns. `estate.yaml` prints its 42. Never turn a
`failOnDead` gate off to fake green.

**One input, derived views.** `estate.yaml` is the source; the three JSON files are generated
from it and CI fails on drift. The same rule will apply to anything else we duplicate.

**Skills are procedure, pinned like dependencies.** No skill edits itself in production;
improvement arrives as a PR. Third-party skills pin to reviewed commits, and their prose is
read as adversarial input — 84.2% of the vulnerabilities in the 98,380-skill study lived in
documentation, not code.

**The ledger is metadata-only** — with one documented historic exception (31 records), which we
document rather than rewrite an append-only chain.

---

## 4 · The plan register — all twenty-six documents

Status: **in force** (being executed) · **reference** (a rule of record) · **shipped** (done,
kept for the record) · **proposal** (waits on a founder) · **historical** (a snapshot) ·
**misfiled** (belongs elsewhere).

Checked by `npm run plan:check` — a new plan document without a row here fails CI.

| Document | Its one job | Status |
|---|---|---|
| [`MASTER-PLAN.md`](./MASTER-PLAN.md) | This front door: decisions, status, register | in force |
| [`auto-running-foundation.md`](./auto-running-foundation.md) | The consolidation programme — one repo, one clock, one gate | in force |
| [`MILESTONES.md`](./MILESTONES.md) | The infra-gate ledger, M1–M9 | in force |
| [`build-tickets.md`](./build-tickets.md) | The engineering backlog — Ticket 0 plus the next ten rocks | in force |
| [`END-TO-END-BUILD-PLAN.md`](./END-TO-END-BUILD-PLAN.md) | The engineering map to the production backbone | in force |
| [`estate-review-2026-07-19.md`](./estate-review-2026-07-19.md) | ~60 findings from six sweeps; Waves 2–4 still carry open items | in force |
| [`growth-100k-recommendations.md`](./growth-100k-recommendations.md) | The reconciled growth plan from three senior reviews | in force |
| [`scale-architecture.md`](./scale-architecture.md) | Running AiGovOps as a workflow system at 100k | in force |
| [`00-overview.md`](./00-overview.md) | How we operate — agents, skills, processes, receipts | reference |
| [`agents.md`](./agents.md) | The cast: each agent's role, dial, and named human | reference |
| [`skills.md`](./skills.md) | The skills — reusable procedures, not facts | reference |
| [`agent-build-plan.md`](./agent-build-plan.md) | How agents build the Library under the Library's own gate | reference |
| [`v4-blueprint.md`](./v4-blueprint.md) | The product blueprint — governance-as-code, end to end | reference |
| [`control-and-deployment.md`](./control-and-deployment.md) | The control plane's durable source (Rev 2026.06 decisions) | reference |
| [`LIBRARY-CONVERSION-GUIDE.md`](./LIBRARY-CONVERSION-GUIDE.md) | The mechanical recipe for the estate design family | reference |
| [`enclave-runbook.md`](./enclave-runbook.md) | The enclave profile — run it yourself, verify offline | reference |
| [`enclave-host-bringup.md`](./enclave-host-bringup.md) | Bare VM to ENCLAVE GREEN, operator's runbook | reference |
| [`deploy-now.md`](./deploy-now.md) | Fly deploy runbook for the core | reference |
| [`estate-simplification.md`](./estate-simplification.md) | One sentence, two rooms, three movements — **all milestones closed** | shipped |
| [`hermes-messenger.md`](./hermes-messenger.md) | The governed messenger — **built, 23 tests green** | shipped |
| [`jeeves-estate-coordination.md`](./jeeves-estate-coordination.md) | Jeeves across the estate — backbone live; tools seam remains | shipped |
| [`jeeves-master-architecture.md`](./jeeves-master-architecture.md) | Jeeves as one mind over the estate | proposal |
| [`ecosystem-agent-skill-map.md`](./ecosystem-agent-skill-map.md) | Reconciling the cast with the deployment | proposal |
| [`estate-start-here.md`](./estate-start-here.md) | A shared drop-in "Start here" for every property | proposal |
| [`overnight-status-2026-06-07.md`](./overnight-status-2026-06-07.md) | Snapshot of one autonomous session | historical |
| [`quantum-for-beginners.md`](./quantum-for-beginners.md) | An explainer, not a plan — belongs with `docs/aigovops-for-quantum/` | misfiled |

Sub-trees keep their own indexes: [`processes/`](./processes/index.md) (17 rules of record),
[`skills/`](./skills/README.md) (13 skills), plus `book/`, `insights/`, `correspondence/`,
`templates/`, `self-hosted/`.

**Three proposals have been waiting on a founder's yes since June.** Each is a *hold*, not a
backlog item — say yes, no, or "not this quarter", and they stop being ambiguous.

---

## 5 · The twelve weeks

Full detail in [`auto-running-foundation.md`](./auto-running-foundation.md) §8.

| | Milestone | When | The demonstrable end |
|---|---|---|---|
| **M0** | The seven decisions | Sat 22 → Mon 24 Aug | Every D has an answer written down |
| **M1** | Consolidation gate | 24–28 Aug | No Foundation IP in a personal account; `estate.yaml` describes everything |
| **M2** | Skills as code + the falsification test | 31 Aug – 4 Sep | We can say honestly whether a volunteer's output is ours |
| **M3** | The clock, everywhere | 7–18 Sep | A week passes with neither founder touching the recurring work |
| **M4** | One front door | 21 Sep – 2 Oct | One hostname; a stranger reads something real before being asked for anything |
| **M5** | The skills library proper | 5–23 Oct | A volunteer's first day is one install command |
| **M6** | Skill provenance | 26 Oct – 13 Nov | A third party can verify a skill we published is unaltered |
| **M7** | Steady state | from 16 Nov | The Foundation runs its own bureaucracy |

The dates assume the Yellow queue moves (§2). If review stays at four-to-eight days, every
milestone slides by roughly that much — the work is not the constraint.

---

## 6 · The PR ladder — what is shipped, what is blocked, on whom

| # | What | Class | Status |
|---|---|---|---|
| 0 | The consolidation plan | Yellow | **in review** — PR #61 |
| 4 | `estate.yaml` + validator + CI drift gate | Yellow | **in review** — PR #61 |
| 6 | `policies/autonomy.yaml` + enforcer | Yellow | **in review** — PR #61 |
| 1a | Repoint `bobrapp.github.io/…V4-10k/` before any rename | Yellow | ready — needs D3 |
| 1b | Transfer V4-10k to the org; rename `aigovops` | **Red** | **Bob** — needs D3 |
| 2 | Apply for GitHub for Nonprofits | **Red** | **Bob** |
| 3 | CODEOWNERS: both founders on `policies/`, `skills/`, `.github/` | Yellow | **blocked on D7** |
| 5 | 301 `a-i-gov-ops.com`; publish the `.org` redirect map | **Red** | **Bob** — needs D2 |
| 7 | Migrate 13 skills; add `principle:`/`owner:`/`risk:` + CI check | Yellow | ready |
| 8 | Three fat skills (AI House, sponsorship, editorial voice) | Yellow | ready |
| 9 | `marketplace.json` + plugin manifest | Yellow | after 7–8 |
| 10 | Third-party skill pin policy | Yellow | ready |
| 11 | One CI matrix over `estate.yaml` for the six unadopted reusables | Yellow | after M1 |
| 12 | Beacon receipt on every scheduled and skill run | Yellow | ready |
| 13 | Weekly founders' digest + `estate.yaml` drift check | Yellow | ready |
| 14 | Subtree each product into the trunk | Yellow | after 1b |
| 15 | `redirect-stub/` into each merged repo's Pages, then archive | **Red** | steward-shipped, after 14 |
| 16 | Redirects live; canonical domain serves everything | **Red** + Yellow | needs D1 |
| 17 | Library on the canonical domain with an ungated preview | Yellow | after 16 |
| 18 | GA4 + HTTPS verified; Ad Grants submitted | **Red** | **Bob** — after 16 |
| 19 | ~20 skills, department-scoped | Yellow | M5 |
| 20 | Skill Provenance in Beacon/Lantern | Yellow | M6 |
| 21 | Circle instrumentation: keep gated, or go public | **Red** | **Bob + Ken** — after M4 |

Nine rows are ready to start and need nothing from you. Six are Red and need one of you
personally. Three sit in review. One is blocked on a single line of JSON.

---

## 7 · What could go wrong

**The Yellow queue stays at a week.** The single biggest risk, and the only one already
measurable (§2). Everything else in this plan assumes review happens.

**A Pages URL dies on a rename.** Not hypothetical — it already happened to 138 references,
including a QR code on a presentation slide. Every rename and archive needs a link sweep before
and after.

**The mono-repo migration eats the twelve weeks.** M1 and M2 deliver before a single product
moves, so a stalled migration still leaves a governed skills library and a canonical domain.

**The falsification test fails and we continue anyway.** If a volunteer's output is obviously
not ours, fix the skills before writing seventeen more. Agree to that now, while it is cheap.

**We automate the reporting of work that is not happening.** A digest that always says green is
a digest nobody reads. The estate-health rule applies to every new check.

**Nobody can currently say whether a restorable backup exists outside nyc1.** The loudest of
`estate.yaml`'s 42 unknowns, and it predates all of this.

---

## 8 · What we are deliberately not doing

No new website. No new repositories beyond the single private ledger archive. No rewrite of the
governed core. No self-modifying skills. No agent that accepts a member, sends mail as a
founder, moves money, or touches DNS. And no new repos of any kind until the disposition pass
is done.

---

*Reviewed by:* **Bob Rapp** ______ · **Ken Johnston** ______ · *Date:* __________

*Decisions D1–D7 recorded on:* __________ · *Review cadence agreed:* __________
