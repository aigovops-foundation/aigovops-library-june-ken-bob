# Estate simplification — one sentence, two rooms, three movements

*Design of record for the estate-wide simplification, 2026-07-17. Critiqued via the
design-review pass before implementation; findings folded in below. Session record:
[`plan/book/when-creation-is-cheap-ch1.md`](book/when-creation-is-cheap-ch1.md).*

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

## Out of scope (explicitly)
Deleting pages; changing the membership wall; touching DNS, accounts, or payment
processors autonomously; the Omni platform's internal surfaces.
