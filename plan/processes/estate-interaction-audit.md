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

## How it runs (and stays green)

- **`estate-interaction-crawl.yml`** (aggregator) — scheduled + on-demand. Crawls every
  property in `estate-sites.json`, writes `docs/estate-health.json`, and **exits non-zero if any
  `failOnDead` property has a dead/broken control**, so the estate turning red is loud.
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
