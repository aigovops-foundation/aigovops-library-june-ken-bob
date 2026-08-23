# Estate interaction audit — the rule + runbook

> **The rule.** Every page of the estate, every button and every link, is opened in a
> real browser, clicked or verified, and must actually *do something*. A control that
> looks clickable but leads nowhere is a defect — the same as a 404. We watch this
> live, across the whole estate, and drive it to **100% working**.

This is the missing half of link-checking. `reusable-link-check.yml` asks *"does this
`href` return 200?"* — curl, no browser. It cannot see:

- a card or `<div>`/`<span>` that **looks** clickable (styled as a button, `cursor:pointer`)
  but has **no link and no handler** — clicking it does nothing;
- a `<button>` whose JS handler was **deleted** (e.g. a widget removed estate-wide);
- a **language toggle** or menu that silently no-ops;
- a page that **throws on load** (dead JS breaks every button below it);
- an in-page `#anchor` that points at a target that **no longer exists**.

The interaction crawler catches exactly these.

## How it decides (no false wolves)

`scripts/interaction-crawl.mjs` drives headless Chromium over every same-origin page and
classifies each interactive element. The trick that makes it trustworthy: it **instruments
`addEventListener` before the page's own scripts run**, so a real click/pointer/submit
handler is *seen*, not guessed — including framework and event-delegation handlers.

| Verdict | Meaning |
|---|---|
| **WIRED / LINK** | Has a resolvable `href`, an `onclick`, a form submit, or an attached listener. Works. |
| **BROKEN** | An internal link whose target returns **4xx/5xx**, or an `#anchor` to a missing target. |
| **DEAD** | Looks clickable (`<button>`, `[role=button]`, `.btn`/`.cta`, `cursor:pointer`) but has **no link and no handler**. |
| **EXTERNAL** | Off-origin link — reported, never fails our build (a third party's 403 is not our bug). |
| **DELEGATED?** | No direct handler but the page uses delegation — surfaced for review, not failed. |

It never clicks destructively (no forms submitted, no state mutated): classification is by
inspection + target-verification, so a run has **no side effects** and is deterministic. It
also **won't cry wolf** — an element wrapped by a link, or a container whose children are the
real buttons, is not flagged.

**Proven:** against a fixture with planted defects it catches the dead button, the dead card,
the 404 link, and the missing anchor, while passing every real link, `onclick`, `addEventListener`,
and submit button — zero false positives (`core`-style test: `test/interaction-crawl.test.mjs`).

## Run it yourself

```bash
# one property
node scripts/interaction-crawl.mjs --url https://www.aigovops-foundation.com \
     --out out.json --site-name "Foundation" --fail-on-dead

# the whole estate → writes docs/estate-health.json (what the monitor reads)
node scripts/estate-crawl.mjs
```

Locally behind an egress proxy, serve a checkout and add `BLOCK_EXTERNAL=1` so third-party
analytics/fonts can't masquerade as errors; the crawl runs on-origin.

## The real-time monitor

`docs/estate-health.html` is the live board: every property, its dead/broken counts, and a
drill-down of each defect, colour-coded, auto-refreshing every 30s. It reads
`docs/estate-health.json`, which the aggregator rewrites on every run. It answers, at a glance,
*"is the whole estate 100% clickable right now?"*

## The habit — crawl hourly, mail once a day

Every hour, on the hour, **`estate-interaction-crawl.yml`** runs the whole estate end-to-end and
scores **every page red or green — green is the goal for each one**. It then:

1. rewrites `docs/estate-health.json` (the live board updates), committing data-only;
2. builds the founders' digest (`scripts/estate-exec-digest.mjs`) — deduped across mirrored
   properties and grouped by **cause**, not by symptom;
3. keeps one pinned **Estate Interaction Health** issue whose body always shows the latest crawl,
   commenting when the set of causes changes;
4. **mails the founders once a day, in the 05:00 America/Los_Angeles window** (`scripts/send-mail.mjs` →
   Microsoft Graph; recipients are `founders.json` `emails`).

The crawl stays hourly so the board and the pinned issue still catch a regression within the hour.
Only the **mail** is once daily. It was briefly twice (05:00 and 17:00) on 2026-08-19; a second
identical mail teaches you to stop opening the first, so it went back to one the same evening.

### The mail is red and the fix, nothing else

Changed 2026-08-19 at Bob's request. Amber ("waiting on a decision") and the green roster live on
the board, linked at the foot of every mail; the mail carries only what is red, each row naming the
**page it was found on**. A finding you cannot locate is a finding you cannot fix — an earlier mail
reported a 404 without saying which page carried the link. One non-red line is kept deliberately:
`Not checked:` for the gated surfaces, because dropping it turns "nobody looked" into something
that reads as "nothing is wrong".

**A dead control is red, not amber.** It was filed amber as "a design question rather than a broken
link", which was survivable until the mail became red-only — then 105 dead controls on Beacon
produced the subject line *"all green"* in the same run whose own verdict step failed with *"Estate
has red pages"*. The digest now **exits non-zero rather than claim green** while any dead or broken
control is counted; severity is assigned per issue-type, so that guard is what stops a future amber
type reintroducing the same silence.

### Why the send is a window, not an hour

The send asks **"which window has most recently *opened*, and has it gone out?"** against
`docs/.estate-last-window` (the Pacific date) — it does **not** match the Pacific hour. Matching the hour made the mail
depend on a run existing at that hour, and five of ten consecutive scheduled runs once never
executed a step: they queued an hour behind a runner backlog and were cancelled when the next hour
entered the concurrency group. A cancelled run cannot check the time, so the window passed in
silence — which reads exactly like "nothing is red".

So a lost 12:00Z run is covered by 13:00Z, and a ninety-minute delay still sends. Before 05:00 the
window that most recently opened is YESTERDAY's, so a night-time run finds it already sent and stays
quiet. The window is
recorded **only after a successful send**: a window marked sent before the send succeeds is a window
that never gets retried. If that push loses a race, the next run sends again — a duplicate digest is
a far cheaper mistake than a silent miss.

There is **no second cron and no UTC arithmetic**: the hourly run asks the runner for the Pacific
hour, which lands on `05` once per day and keeps doing so across both DST changes. A
UTC cron pinned at `0 12,0 * * *` is right for eight months and an hour early for four.

The mail also does not depend on housekeeping: it requires only that the digest was **built**. A
failed board commit or pinned-issue update once skipped every step below it, including the send.

The run **fails red** if any `failOnDead` page has a dead/broken control, so a regression is loud
in the Actions tab as well as on the board.

> Hourly crawling is deliberate: a dead button on a launch page is an hourly-cadence problem, not a
> weekly one. The whole-estate crawl is a few minutes of CI per hour.

### Changing the send: verify quiet by watching, not by reading

**A change to notification behaviour is not verified until a real run has been observed doing the
quiet thing.** Reading the code is not enough, and neither is a green step.

On 2026-08-20 the mail was changed to once a day, recorded in `docs/.estate-last-window`. That file
was never tracked by git. The recording step guarded its commit with
`git diff --quiet -- docs/.estate-last-window`, and **`git diff` does not see untracked files** — so
the guard reported "no change", skipped the commit, and never added the file. Every later run
started from a clean checkout with no memory, decided the window was unsent, and mailed.

**Six consecutive hourly sends** before anyone noticed. The step reported success the whole time,
because writing a file and skipping a commit is not an error. The sibling `docs/.estate-notified`
*is* tracked, so the identical guard three lines above it always worked — which is what made it
invisible.

It surfaced only when someone asked what the current state was, and the answer was checked against
the live repo instead of recalled.

So, when you change what gets sent or when:

1. **Watch a real scheduled run afterwards.** Not the code, not the diff, not a dry run.
2. **Check three signals, not one** — the window decision line, the mail step's conclusion, and the
   actual count of `send-mail(graph): sent` in the log. A step can be `skipped` for the wrong
   reason; only the log says whether mail left.
3. **Confirm the state it depends on is real.** `git ls-files docs/.estate-last-window` should name
   it, and its contents should equal `TZ=America/Los_Angeles date +%F`. State the mechanism writes
   but never persists looks identical to state that works, until the next checkout.
4. **A silent failure and a working control look the same from inside.** The whole point of this
   file is that silence is not evidence — the same applies to the machinery that produces it.

The other changes made the same day were each proven by execution: the anchor fix by re-crawling
the live site, the window logic by running the workflow's own shell over 72 simulated hours, the
test isolation by driving the deployed effector on the droplet. All held. The one verified by
reading is the one that broke.

## How it runs

- **`estate-interaction-crawl.yml`** (hourly aggregator, above) — the estate-wide habit + digest.
- **`reusable-interaction-crawl.yml`** — a property gates its **own PRs** by adopting it in one
  line (the same pattern as the link checker):

  ```yaml
  jobs:
    interaction-crawl:
      uses: aigovops-foundation/aigovops-library-june-ken-bob/.github/workflows/reusable-interaction-crawl.yml@main
      with:
        site_url: "https://aigovops-foundation.github.io/umbrella-govops/"
        fail_on_dead: true
  ```

The crawl runs in **GitHub Actions**, where the live domains are reachable (a sandbox behind an
egress proxy cannot reach them — that is why the board updates from CI, not from a laptop).

## The estate (edit `estate-sites.json` to add a property)

Foundation site · Community platform*· Library (rendered)*· Beacon · Umbrella · Lantern · NCW AI
Camp. *Gated surfaces need an authenticated session to crawl — listed as **pending** until an
auth recipe is wired (a steward-issued crawl token; never a scraped human login).

## The human's part

Agents run the crawl and open the fix PRs; a human still lands anything irreversible. Turning a
`failOnDead` gate **off** to get a green board — instead of fixing the button — is exactly the
move this rule exists to prevent. Fix the button.
