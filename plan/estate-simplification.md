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

> **M16 (2026-07-18): SHIPPED — the arc closes.** Growth agents live on droplet A:
> seo-scout filed its first real weekly brief on production within minutes
> (draft-38f29f9a — 10 keywords, 10 on-site findings, receipted); content-gardener
> drafts deterministically from estate sources (zero hallucination surface, every
> draft source-cited); membership-health ran 19/19 with the synthetic principal
> self-cleaning (residue 0) — and its FIRST welcome-watchdog alert named all seven
> pending members including both founders ("the founder-welcome promise says nobody
> waits"). Email sender pre-built dark: the deliverability probe now reports the
> blocker daily until the key lands. Schedules seeded (daily/weekly/twice-weekly/
> monthly). Battery 143/146 = exactly the pre-M16 baseline. RUNBOOK-growth +
> RUNBOOK-membership-health are the rules of record.

## M16 — growth, governed (directed by Bob, 2026-07-18)

Two new fleet agents + the membership watchdogs, all propose-only (the decision-gate
rule is the product):

- **seo-scout** (Sentinel/Strategist, weekly + on-demand): audience = policy-as-code /
  AI-governance practitioners. Produces a weekly brief as a Board proposal: per-network
  plays (LinkedIn = practitioners/thought-leadership; X = devs/build-in-public;
  YouTube = demo/tutorial clips from the camp + gates; Instagram = camp/community
  warmth), target keywords, and on-site SEO improvements (meta/schema/internal-link
  suggestions beyond the arch tier's basics). Reads Plausible (API key → broker,
  paste-once) when available.
- **content-gardener** (creator, propose-only): drafts platform-shaped posts from
  estate sources (blog excerpts, harm cases, framework entries, camp tutorials, book
  chapters) into core.drafts → steward approval → the EXISTING gated connectors
  publish (LinkedIn wired; X effector to add, gated; Instagram/YouTube manual or via
  the tools below). Nothing ever auto-publishes; ALLOW_SEND flags stay off until
  founders flip them.
- **Marblism + Sintra combined plan** (both on annual subscriptions): Marblism is
  wired-needs-key (broker paste-once) → use its API for asset/content generation
  feeding the gardener's drafts. Sintra has no public API → its bots execute
  repetitive posting on networks we haven't wired (Instagram scheduling etc.),
  ALWAYS sourced from the same approved-drafts queue — one editorial pipeline, three
  engines, zero ungoverned posts. Written up as RUNBOOK-growth.md.
- **Membership watchdogs** (from the opening-membership plan): membership-health lane
  + agent (daily), welcome watchdog (pending >24h alerts), email deliverability probe
  (once the provider key lands — wiring pre-built, env-driven), monthly RTBF drill,
  backup-drill extension for members + avatars.
- **Humans-Do items**: email-provider API key (THE membership blocker), Plausible API
  key, Marblism key, Ken's Telegram chat-id, Ken's Stripe tier links.

## Out of scope (explicitly)
Deleting pages; changing the membership wall; touching DNS, accounts, or payment
processors autonomously; the Omni platform's internal surfaces.

---

## M17 — The door opens (SHIPPED 2026-07-18/19) · book ch5

The night email went live and the membership door opened all the way. Everything
below is verified on production, receipted, and covered by regression lanes:

- **Join flow fixed** (`07e427e`): `/` routes by identity (stranger → landing,
  applicant → pending, member → portal, steward → cockpit); dark-sender signups get
  the honest doorstep + steward mint-link button. New join-flow lane (39 checks).
- **Email LIVE** (Resend): `email-provider-key` in the AiGovOps vault (app-paste
  pattern — Claude stages the item, founder types only Cmd+V); domain
  **aigovops-foundation.com verified** (DKIM/MX/SPF written into Cloudflare by
  browser automation via the Claude Chrome extension, now installed in Bob's main
  profile — the durable unlock); sender `jeeves@aigovops-foundation.com`; delivery
  proven to Gmail + Hotmail. Three systemic fixes pinned: warden self-heals
  vault-only keys; Resend path sends a real User-Agent (Cloudflare 1010); sandbox
  from-address rule documented.
- **Approval sends the welcome** (`69136cf`): `members.approve()` now emails the
  member their sign-in link the moment a founder approves — the founder-welcome
  promise is machine-carried; watchdog copy is sender-aware.
- **Giving rail live** (Foundation PR #84): "Give any amount" + $25/$50/$500 quick
  gifts (Ken's real Stripe links); tier cards stay pledge-by-email until real tier
  checkouts exist.
- **Onboarding drill green end to end** (`476cd4c`): stranger → join → approval →
  email → magic link → profile → portal → right-to-be-forgotten (purge verified).
  Four splinters fixed: checklist credits M15 + join interest; join.html CSS leak
  (injected surfaces must never inherit page-local styles); anonymous doorstep nav
  (Home · Help · Languages · Sign in); post-forget nav rebuild + display-name
  headline.
- **Beta-ready audit** (`cd25634`): members on Postgres (indexed); backups three
  deep (nightly tarball + pg dump + reciprocal peer push-pull to droplet B, green);
  wardens 20/20 + 17/17; per-IP **and per-recipient** email caps (success-shaped);
  Cloudflare bot-wall passes browsers + Googlebot; load smoke 200×200 OK, p95
  294 ms. Telegram bot now tells unknown senders their own chat id (self-serve
  steward onboarding).
- **Humans-Do movement**: email key ✅ · Stripe links ✅ (rail) · REMAINING: welcome
  the 9 pending members (one click each — the email now sends itself), Ken's one
  Telegram message to @Aigovopsadminbot, Plausible key, Marblism key (its own
  catalog says skip), KDP publish (EPUB now carries ch5).

---

## M18 — The audit turns inward (SHIPPED 2026-07-19) · book ch6

The backlog review, four decisions executed, and the estate's own claims tested:

- **Certification v1** (`1c1876f` lineage): AiGovOps Certified Practitioner — 13 tasks
  over the 100 verified harm cases (8 gate verdicts, 3 control matches, 2 receipt
  forensics), 11/13 to pass, free and retryable, every miss explained. Answer key stays
  server-side; gate tasks sample ACROSS verdicts so "answer 0 to everything" cannot pass;
  attempts one-shot and principal-bound; credential is an HMAC that breaks if the record
  is edited. `verify.html` + badge are PUBLIC and survive steward-only lock. LinkedIn
  add-to-profile deep link. Lane: certification (30 checks).
- **Fleet honesty** (`6d96cf0`): the July audit's "9 of 39" was wrong — measured properly
  it was 30 of 42. `scripts/fleet_audit.py` classifies LIVE / WIRED / DECLARED; 12
  mechanism-less agents moved to a `retired:` block with reason + `readmit_when` (not
  deleted; `core.registry` reads only `agents:`). Lane: fleet honesty (9 checks).
  **The rule proved itself the same day** — `aigovops-agent-uptime` was retired with
  readmit_when "an uptime probe effector lands", the probe landed, and it returned.
- **Droplet B is real preprod** (`d91df32`): not idle — it runs the Library enclave stack;
  omni-preprod now on 127.0.0.1:8798 with its own Postgres 16 + pgvector. **Full restore
  drill PASSED**, counted from inside the tarball: members 13/13, brain 493/493 with
  embeddings intact, feedback 1/1, kv 25/25. `promote-to-prod.sh` (dry-run default,
  refuses a dirty tree or red battery, ships both stages via `ship.sh`).
- **Plumbing** (`1c1876f`): Resend bounce/complaint webhook (Svix-signed; fails closed on
  missing secret, forged signature, swapped payload, hour-old replay) → `core/suppression.py`,
  with the fence INSIDE all three transports; soft bounces don't suppress; a spam complaint
  can never be cleared by a steward. Stripe was already built and verified — only ever
  needed the secret (now a catalog slug). `effectors/uptime.py` + `scripts/uptime_watch.sh`
  (the external half, on droplet B). Lane: plumbing (28 checks).
  **Kill switch VERIFIED already enforcing cross-process** (14/14) — that audit finding
  was stale; nothing to fix.
- **Backup privacy** (`cdd6b19`): the drill's "secrets in the clear" alarm was **wrong** —
  verified from the attacker's position (only the in-tarball key) that the store opens
  nothing. But the real hazard underneath: the store's encryption key is DERIVED from the
  ledger signing key, so safety was accidental. `backup.py` now drops `.gatekey` only once
  the key is escrowed in the broker, failing safe in every doubt. `scripts/anonymize.py`
  pseudonymizes preprod (RFC-2606 `.invalid` emails, ids preserved), refusing production
  three ways — and writing that test caught `OMNI_ENV=production` slipping past the guard,
  because `core/env.py` infers on unknown values. Lane: backup privacy (18 checks).
- **Credentials contract 35/35** — green for the first time in weeks (both webhook secrets
  declared NO_PROBE with reasons; `brain-session-perplexity` finally recorded as what it is,
  a browser session document checked by `session_freshness`, not an API key).

**OPEN founder gates from this milestone:** escrow the ledger signing key (approved,
running in a separate session — until it lands, a backup's chain cannot be
signature-verified); decide whether to delete the 14 existing tarballs that contain
`.gatekey`; and preprod currently holds real member data until `anonymize.py --apply` is
run there.
