# Scope — "Start here": one persona-narrated onboarding for the entire estate

**Goal.** Turn the Library's persona-narrated tour (`docs/onboarding.html`, 47 scenes /
13 chapters, Beacon-persona narrator + subtitles) into a **shared, drop-in "Start here"**
that every estate property opens with — one canonical walkthrough, deep-linked to each
property's own chapter — instead of each site doing its own onboarding.

This mirrors the pattern that already works estate-wide: **`jeeves-widget.js`** (hosted once
on the Foundation, dropped into every page via one `<script>` + `data-jeeves-site`).

## Architecture (single source of truth, drop-in launcher)

1. **One canonical tour.** `onboarding.html` stays the single source. No per-property copies
   (copies drift). Everything points at it.
2. **Deep-linking.** Teach the player `?start=<chapter-slug>` (and `#start=`) so a property can
   open the tour at *its* chapter — e.g. Beacon → `?start=governance-tools`, NCW →
   `?start=ncw`, Community → `?start=community`. *(Reversible, in this repo — Phase 1.)*
3. **The launcher widget — `start-here.js`.** A dependency-free drop-in, hosted next to
   `jeeves-widget.js` on the Foundation. One line per property:
   `<script src="https://www.aigovops-foundation.com/start-here.js" data-estate-id="beacon" defer></script>`
   It renders a small **"▶ Start here"** affordance (matched to the Jeeves-widget look) that
   opens the tour in an overlay/iframe, deep-linked by `data-estate-id`. *(Phase 2.)*
4. **Consistent design.** Tour + launcher use the canonical `css/tokens.css` brand tokens and
   the Beacon-persona narrator — so the *experience* is identical on every property.

## Per-property rollout (posture-aware, governed)

Each property is its own repo with its own deploy + **posture** (from `config/estate.json`).
The rollout is exactly what Jeeves's **site seam** (`jeeves site <id> <change>`) is built for —
reversible drafts; auto-reversible properties open+merge, propose-only properties open a PR for
a steward.

| Property | Deploy | Posture | Rollout |
|---|---|---|---|
| Library | push → Pages | auto-reversible | already hosts the tour; add launcher |
| Foundation | PR + Cloud-Mary | propose-only | host `start-here.js` here; add include (PR) |
| Community | ship.sh → droplet | auto-reversible | add launcher to control-room pages |
| NCW | PR → Pages | auto-reversible | add launcher (`data-estate-id="ncw"`) |
| Beacon · Umbrella · Vendor-RFI | push → Pages | propose-only | add launcher via PR each |
| Lantern | python pkg | — | n/a (no site) |
| Open-source v4 | push → Pages | — | add launcher to the landing |

## Phasing

- **Phase 1 — in this repo, reversible (no human gate):** add `?start=` deep-linking to the
  player; build `start-here.js`; demo both on the Library. Ship on approval.
- **Phase 2 — cross-repo, propose-only (human-gated):** host `start-here.js` on the Foundation
  (lives beside `jeeves-widget.js`); add the one-line include to each property via the site
  seam — **one small PR per propose-only property, you approve each.** Uses the Foundation's
  PR + Cloud-Mary flow.

## Decisions for Bob

1. **Where does the launcher live?** Recommend the Foundation (next to `jeeves-widget.js`) so
   it's already on the estate CDN path. *(Default: yes.)*
2. **Canonical tour URL.** Today it's the Library Pages path. If `aigovops.org` gets un-parked,
   a clean `aigovops.org/start` is the nicer public URL. *(Tie-in to the parked-domain fix.)*
3. **Launch affordance.** A persistent corner "▶ Start here" badge, or only a first-visit
   prompt? *(Recommend: corner badge, dismissible, remembers via localStorage.)*

## Not in scope (flagged)

- The **studio voice-over / MP4 / talking-avatar** ride along once the ElevenLabs key write
  completes (Touch-ID gated) — independent of this rollout.
- Consolidating the scattered Foundation Jeeves-demo pages (`jeeves-demo`, `-console`,
  `-estate`, `-front`, `-brief`) is a related "combine the sites" cleanup — separate scope.
