---
name: estate-health
principle: P5
owner: bobrapp
agent: Sentinel
risk: green
department: estate
description: Open every page of the estate in a real browser, click/verify every button and link, and drive each page to GREEN. Use hourly and before any launch. Trigger on "estate health", "are the buttons working", "check every page", "red or green", "interaction test", "dead button", "estate-health board".
run: prose
inputs: {"type":"object","properties":{"site":{"type":"string"}}}
outputs: {"type":"object"}
---

# estate-health

**Owning agent:** Sentinel (monitor-and-alert)

## When to use
Every hour (the habit), before every launch, and the moment anyone says a button
"doesn't work". This is the browser-driven half of link-check: not *"does the URL
200?"* but *"does the button actually do something?"*. **Green is the goal for every
page.**

## Inputs
- Optionally, a single `site` to focus (default: the whole estate in `estate-sites.json`).

## Procedure (repeatable)
1. **Crawl.** One property: `node scripts/interaction-crawl.mjs --url <base> --out out.json --fail-on-dead`.
   The whole estate → the live board: `node scripts/estate-crawl.mjs` (writes `docs/estate-health.json`).
   The crawl needs a browser and the live domains, so it runs in **GitHub Actions**
   (`estate-interaction-crawl.yml`); a sandbox behind an egress proxy can't reach them.
2. **Read the board.** `docs/estate-health.html` shows every property and every page,
   red or green, auto-refreshing. `node scripts/estate-digest.mjs` prints the founders' digest;
   `--status` returns `green|red|pending`.
3. **Every red page is an action.** For each 🔴, open the named dead/broken control and fix
   it (add the missing link/handler, repair the target). Re-crawl until the page is green.
4. **Deliver.** The hourly workflow updates the pinned **Estate Interaction Health** issue and
   pings the founders (`founders.json`) when a page flips red.

## Human gate
None to *read* or *crawl* (side-effect-free). A **fix** to a page is a normal change that a
human lands. **Never** turn a `failOnDead` gate off to make the board green — fix the button.

## Evidence — the receipt
The board (`docs/estate-health.json`) and the digest are the record; each is regenerated from a
fresh crawl and committed by the workflow. For a signed artifact, emit via `beacon-sign-evidence`
a metadata-only **`artifact`** receipt — `actor=agent:sentinel, action=estate-health, greenPages,
redPages, contentHash`. No payloads.

## Done = Yes
Every reporting page is 🟢 on the board and the digest says GREEN. Then it enters **Stay at
Yes** (the hourly habit watches it); on any page going red, **Recover to Yes** — fix and re-crawl.

## Notes
Detector is proven against a fixture (`test/interaction-crawl.test.mjs`): it catches planted dead
buttons, dead cards, 404 links and missing anchors, and does not cry wolf on links, `onclick`,
`addEventListener`, submits, or containers of buttons. Runbook: `plan/processes/estate-interaction-audit.md`.
