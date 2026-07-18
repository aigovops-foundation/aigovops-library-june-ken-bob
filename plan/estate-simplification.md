# Estate simplification — one sentence, two rooms, three movements

*Design of record for the estate-wide simplification, 2026-07-17. Critiqued via the
design-review pass before implementation; findings folded in below. Session record:
[`plan/book/when-creation-is-cheap-ch1.md`](book/when-creation-is-cheap-ch1.md).*

> **Status (2026-07-17): SHIPPED.** M1–M5b merged and live (Library #4 #5 #6, Foundation
> #57 #59 #60, Camp #15); Cloud-Mary 8/8 tiers green against the live estate; milestone
> filed in bob-brain. First giving rail live (the $500 Stripe checkout). Still open:
> Ken's contributor/sustainer/founding Stripe links (`apply-stripe-links.sh` flips them
> in one command), and the footer rollout to Beacon, Umbrella, Vendor RFI, and Glean.
>
> **M6 (2026-07-17): the porch wears the garden — SHIPPED.** The garden-warm visual
> redesign is live on the Foundation homepage (Foundation PR #61), chosen from three
> externally-evaluated variants (garden-warm, lantern-daylight, almanac; mockups kept
> in the Foundation repo `mockups/m6-porch/`). Homepage-scoped `css/porch.css`; shared
> `style.css` untouched; 8/8 battery green live. Next: garden skin for support and
> community pages so the porch transition isn't jarring.

## The design in one paragraph

One sentence, identical on every property. Two rooms: the **porch** (the Foundation site —
the only front door: come see, come join, give time, give money) and the **library**
(every other property — reading rooms entered through the porch). Three movements as the
information architecture everywhere: **Get to Yes** (before you ship), **Stay at Yes**
(while it runs), **Recover to Yes** (when it breaks). The garden of humanity is the why —
in the porch's opening breath and the contributor pages, never a decorative footnote.

## The creed (founders own the words)

Full sentence (footers, one canonical string):

> Ship safe AI — never unsafe AI: get to yes, stay at yes, recover to yes, and keep the
> garden of humanity growing.

Short imperative (heroes): **"Ship safe AI. Never unsafe AI."** — the movements follow as
the h1/sub, always with their plain glosses.

Alternate full-sentence candidates, for Ken and Bob to react to:
1. *AI for good, proven in code — get to yes, stay at yes, recover to yes.*
2. *Get to yes, stay at yes, recover to yes — so AI serves the garden of humanity, never
   tramples it.*

## Design-critique findings (pre-implementation gate, 2026-07-17)

1. **Anchor "yes" to safe AI at every first touch** — "Get to Yes" cold invites the
   negotiation-book misread. Eyebrow/sub/meta must say "ship safe AI" before the
   movements land.
2. **Split creed roles** — short imperative for heroes; full sentence for footers.
3. **No dead-end CTAs** — *give money* ships only when a real donation rail exists;
   *give time* ships first. Processor choice is a founder decision (irreversible:
   account creation), raised as a proposal card in M4.
4. **Ship Spanish with English** — every copy change lands in `strings-en.js` and
   `strings-es.js` in the same commit.
5. **The hub defers to the porch** — one front door only works if the Library hub
   visibly points newcomers home.

## Milestones

Each milestone is one reviewable PR; nothing merges without a founder's yes. Foundation
repo work additionally runs the Cloud-Mary battery green before push (house rule).

### M1 — The creed carrier (Library repo) ← this PR
The canonical creed string lands in `docs/estate-footer.js` and renders as the first
brand line on every Library page. The design of record (this doc) and the book chapter
land beside it.
**Accept when:** footer shows the sentence on hub + deep-doc pages, contrast ≥ 4.5:1,
exactly one contentinfo per page, founders have confirmed (or edited) the sentence.

### M2 — The hub reframe (Library repo)
`docs/index.html`: hero becomes short-imperative + movements-with-glosses; the 12-link
arc becomes the three shelves; "six pieces" becomes the stacks (all pages kept, none
deleted); a "start at the porch" line defers to the Foundation site.
**Accept when:** a first-time reader can answer *what is this / why care / what next* in
30 seconds; every existing page reachable within one click of its shelf.

### M3 — The porch (Foundation repo, PR + Cloud-Mary)
Hero rewrite anchored to safe AI (en + es in the same commit); action grid goes from six
cards to primary **Join** + **Read the Library** + contributor rails, with Newsletter and
Events kept as a quiet secondary strip; page title/meta updated.
**Accept when:** one primary CTA above the fold; Cloud-Mary green; es and en heroes say
the same thing.

### M4 — The contributor rails (Foundation repo)
*Give time* page ships (join, contribute a harm case, mentor, build — garden-framed, camp
voice). *Give money* is prepared behind a founder proposal card for the donation
processor; it ships only when the rail is real.
**Accept when:** give-time live and linked from porch + estate footer; give-money
decision made by founders (ship, hold, or member-dues framing).

### M5 — Voice + estate-wide rollout
Porch pages adopt the camp voice standard; the estate footer (with creed) rolls to the
remaining properties (camp, Beacon, Umbrella, Vendor RFI, Glean); movement glosses welded
beside every shelf label estate-wide.
**Accept when:** the creed renders byte-identical on every property; no property's hero
competes with the porch.

**Rollout pattern (learned on the camp, 2026-07-17):** two integration modes, chosen by
what the property already has. *Injector mode* — pages with no footer system load the
Library-hosted `estate-footer.js` with `data-site` (aria-current) and `data-theme="light"`
on light pages (fixed palette; page CSS vars are ignored so the 4.5:1 contract can't
break). *Native mode* — properties with their own footer system (the camp's `shared.js`)
add the creed line inside it, styled natively; a second injector would race the first and
double the contentinfo. Either way the creed string is byte-identical.

> **M10 + M11 (2026-07-17, night): SHIPPED — ALL MILESTONES CLOSED.** The Omni portal
> (51 control-room pages + signin) converted at the token layer (vendored garden tokens,
> omni.css semantic remap, app.js zero-diff, signin flow exercised end-to-end), pushed
> and shipped to droplet A; design lane 10/10 on the host; warden receipt
> rcpt-1f1947240116. M11 (one job per page): both waves merged (Foundation #67), 11/11
> live battery. Follow-up founder decisions on record: landing/mobile keep charcoal
> data-theme=dark (cream-light is a markup call); the June "hide Blog links" rule was
> removed (one-line revert available); Ken's 3 Stripe tier links still pending.

## The garden estate-wide (directed by Bob, 2026-07-17): M6b–M10

Bob's direction: the entire estate — every site, every doc, every repo — redesigns to
match the garden. Family rule: **match the family, not the wallpaper** — porches and
hubs wear garden-warm (cream/orchard/signal, Fraunces); deep reading-room docs wear the
almanac (paper/ink/botanical, same family in print form; base: `mockups/m6-porch/
variant-3-almanac/`). This supersedes M6's "navy stays for the library" note.
Canonical skin: `css/garden.css` in the Foundation repo is the source of truth; other
repos carry a copy with a SOURCE header pointing home.

> **M7–M9 + the Jeeves rule (2026-07-17, later the same day): SHIPPED.** The whole
> estate wears aigovops-july-2026: Library all 25 pages (garden-warm halls, almanac
> reading rooms — Library #7, wall-sync verified), camp token-aligned (#16), Beacon
> (#14), Umbrella (#3, + revived its dead-URL e2e harness), Vendor RFI (#6), Glean
> (#17, generator-level). Jeeves presence rule applied estate-wide: bottom-right
> agent widget only, hero retired; the what-it-does page is jeeves-brief.html
> (Foundation #64, camp #17). Warden's closing audit: 7/7, rcpt-f9b7ab5223d7.
> Remaining: M10 portal surfaces; pulse.mjs template (chip in flight); Dependabot
> chips (Beacon 2-high priority); token-file reconciliation chip.

- **M6b — Foundation site, all 30 pages** (21 top-level + 9 blog/): garden.css extraction
  + per-page conversion; content/links/scripts byte-identical; full battery per PR.
- **M7 — Library**: hub + wings go garden-warm; deep docs (blueprint, control-plane,
  build-tickets, plan, design-book) go almanac; quantum wing included; deploy-gate
  assertions updated with the content, per the M2 lesson.
- **M8 — Camp**: already garden-native; alignment pass only (tokens + creed drift check).
- **M9 — Beacon, Umbrella, Vendor RFI, Glean** (repos cloned 2026-07-17): garden skin +
  estate footer/creed via injector or native mode per the M5 pattern.
- **M10 — Platform surfaces**: Omni portal pages (signin, review, manage, humans-do) via
  the Omni direct-to-main workflow with its own cloud_mary.py battery; V4 repo docs;
  quantum-stack-intelligence webapp (link-don't-duplicate rule — propose, founders call).

## M11 — the subpage simplification (directed by Bob, 2026-07-17 evening)

Same garden language, one level deeper: every subpage gets ONE job, content clusters
logically, duplication dies. From the 15-page IA survey:

- **Nav becomes intent-shaped:** Home · Start Here (ecosystem reborn as orientation) ·
  Frameworks · See It Run (alpha absorbs demo) · Blog · Support.
- **Merges (all with garden-styled redirect stubs — no dead URLs):** demo→alpha;
  ken+bob→founders.html; jeeves-demo + jeeves-front → jeeves-estate/jeeves-brief
  (brief = the designated what-Jeeves-does page; estate = the canonical interactive
  proof); events→Luma redirect.
- **Slimming:** community drops its duplicated tier cards (link to support) and its
  4-CTA banner → 1+1; support consolidates three competing give affordances into one
  giving cluster + FAQ accordion; press bios shrink to one-liners + founders link;
  ecosystem hero's 4-link Jeeves run-on → one line to the brief; the 5× gate-law
  explainer survives only on See It Run + the brief.
- **Bug fixes from the survey:** ken schedule anchor (support.html#schedule doesn't
  exist), dead locale-coffee JS on alpha/demo, frameworks JSON-LD ItemList 5-vs-40,
  blog/events chrome drift (raster logo, divergent footer).

**Accept when:** each subpage answers one visitor intent; no content block exists in
two places; every retired URL 302/meta-redirects to its successor; full battery green
(assertion updates sanctioned where they encode the old IA).

> **M12 + RBAC (2026-07-17, late night): SHIPPED.** The battery is 16 tiers (design ·
> security 134 · privacy 106 · arch 175 · ux 161 · a11y · happy · uptime · errors ·
> e2e · dns · i18n · scale · chaos · unit · docs) — all green live. The estate-health
> orchestrator is seeded daily on droplet A with the results-driven escalation ladder
> (first audit 17/17, rcpt-b9596eaa8f4b). The feedback strip is live on 18 content
> pages → /api/feedback (CORS-allowlisted, rate-limited, zero IP retention) → Jeeves
> routes text to stewards immediately (fan-out now includes store-granted stewards)
> and votes to a daily digest; E2E proven. Multi-role RBAC live with Bob's roster
> (co-founders Bob+Ken; stewards Stacy+Bill pending activation; end-users Yu, Corey,
> Fischer); kill switch + role admin = co-founder-only; all rule surfaces aligned.

## M12 — the estate's operating rhythm (directed by Bob, 2026-07-17 night)

End-to-end disciplines as one battery + adaptive cadence + user feedback:

- **Cloud-Mary grows four tiers**: --security (headers, no secrets in source, HTTPS
  forms, dependency posture), --privacy (Plausible-only, no PII in URLs, no
  third-party cookies, metadata-only promises kept), --arch (estate link integrity,
  canonical/sitemap/load-order, no orphans), --ux (nav consistency, one-h1, CTA
  budget, stub behavior). Mapping of Bob's list: accessibility/uptime/test/automation
  = existing tiers; design = design tier; UX-acceptance ("ua") = happy tier.
- **Estate-health orchestrator (Omni)**: generalizes design_warden — runs the estate
  checks on a daily base cadence that RESPONDS TO RESULTS: red → re-check every few
  hours + steward notification until 2 consecutive greens; sustained green → weekly
  deep pass (scale+chaos). Rule in RUNBOOK-estate-health.md; receipts every run.
- **User feedback**: garden strip ("Was this helpful? 👍 👎 + optional text") above
  the footer on content pages (never stubs/consoles); POSTs to api/feedback on the
  community droplet; Jeeves routes to Ken & Bob (Telegram + review panel, digest at
  volume); honest privacy line; a --feedback battery tier verifies widget + endpoint.
- **Order** (tree-conflict aware): design-review fixes land → Foundation tiers +
  widget; P2 + RBAC ship in Omni → feedback API + orchestrator → wire, verify E2E,
  brain filing.

> **M13 (2026-07-17, midnight): SHIPPED — both halves.** Front-end: three movement
> hubs live (get/stay/recover-to-yes.html), nav = Home · three doors · Join pill,
> ecosystem/alpha stubbed, the three-door nav now a design-tier invariant; 16/16 live
> battery (Foundation #72). Backend: the member portal's tiles regrouped under the
> same three doors + Your membership (Recover previously had NO member option — now
> Get help + protection), 10-locale door keys, SW cache bump caught live; shipped to
> droplet A, battery at documented baseline with standalone proofs. Founder follow-ups
> noted: duplicate Learn/Build tiles, omni.js nav grouping.

## M13 — three doors only (directed by Bob, 2026-07-17 midnight)

Off the main page, EVERYTHING consolidates into the three movements; membership is the
default action. Nav becomes: Home · Get to Yes · Stay at Yes · Recover to Yes · Join
(primary button → the community platform; give time/money on the join thread).

- **get-to-yes.html** (ecosystem/Start-Here reborn): before you ship — the Library
  (primary asset, membership-default CTA), frameworks explorer, training (Glean),
  camp, quantum wing, the estate map.
- **stay-at-yes.html** (alpha/See-It-Run reborn): while it runs — the open source
  (Beacon, Umbrella, Vendor RFI, the platform), live gates demos, watch-it-run.
- **recover-to-yes.html** (new): when it breaks — FailFest + F-AI-Friday corpus,
  practitioner test, durability/recovery posture.
- Old URLs (ecosystem, alpha, frameworks stays as an asset page linked from Get) get
  the garden stub treatment where folded; founders/community/press/support move to the
  Join thread + footer. Backend: the portal's member-facing navigation groups by the
  same three movements where sensible (review + minimal implementation).
- **Test always, update always**: every change through the 16-tier battery; the design
  tier learns the three-door nav as an invariant; estate-health keeps watch; docs,
  brain, and book updated.

**Accept when:** a visitor off the porch sees exactly three ways plus Join, every old
URL still lands somewhere true, and the batteries are green end to end.

> **M14 (2026-07-18): SHIPPED.** The one-breath grammar is live on every content page
> (porch, three hubs, frameworks, support, founders, press, join; corpus + brief
> headers) — Foundation #75, net −61 lines. One-primary-per-hero is a permanent
> design-tier invariant; 16/16 live battery post-deploy. Also this session: the four
> footer threads founder-hidden (#73) and the Join page rebuilt as the reference
> implementation (#74).

## M14 — dead simple, everywhere (directed by Bob, 2026-07-18)

The Join page's grammar becomes the site-wide rule. **The dead-simple rule:** every
content page reads in one breath — (1) hero: one plain-verb h1, one sentence of truth,
exactly ONE primary CTA; (2) at most three sections after the hero, each with one job,
zero duplicated content; (3) one quiet secondary path at the end (a link, never a
banner); (4) the creed footer. Long-form assets (the corpus, blog articles, the brief)
are exempt in body but obey it in their headers. The design tier learns "one primary
CTA in the hero" as an invariant. Applied to: the porch, the three movement hubs,
frameworks, support, founders, press. Reference implementation: community.html.

## M15 — ready for members (directed by Bob, 2026-07-18)

The community platform becomes self-service and rights-respecting:

- **Signup & profile**: magic-link signup flows into profile completion; editable
  profile — display name, email, profile picture (small, sanitized), country + city,
  topics of interest (free-form), mobile number with country code (optional) —
  writes session-principal-only, every change receipted METADATA-ONLY (field names,
  never values).
- **Newsletter**: Substack opt-in stored with timestamp + the real subscribe link
  (we never subscribe anyone server-side); stewards can see opt-ins.
- **Volunteering**: interest flags — policy · founding circle · steward — routed to
  stewards and visible in the console as *volunteered*; NEVER auto-granting (role
  grants stay co-founder-only, per RUNBOOK-roles).
- **Consent**: explicit "use my information to keep the community active" checkbox,
  versioned + timestamped; minimal account without it.
- **Right to be forgotten**: member-initiated, immediate, receipted — PII fields
  purged, avatar deleted, principal pseudonymized; the signed ledger stays (it was
  metadata-only by design — the receipts contain no PII to forget). One-click
  unsubscribe (newsletter + notifications) separate from deletion.
- **Community standards**: docs/COMMUNITY-STANDARDS.md (authored in the house voice,
  policy-as-code framing) rendered as a member page, linked from join + footer.
- Batteries extended (profile/RTBF/consent lanes; a11y/ux over the new pages);
  auth-gating and RBAC guards untouched and green.

## Out of scope (explicitly)
Deleting pages; changing the membership wall; touching DNS, accounts, or payment
processors autonomously; the Omni platform's internal surfaces.
