# Customer-insight report — Omni community portal

*Source: live signed ledger + activity journeys on droplet A (read-only, metadata-only,
anonymized, token-redacted). Generated 2026-06-28. Internal — not Pages-published.*

## The numbers

| Metric | Value |
|---|---|
| Tracked actors | 35 |
| Total events | 687 |
| Avg events / actor | 19.6 |
| "Engaged" (≥3 steps) | 26 / 35 (74%) |
| Human sign-ins | 8 actors (9 sign-in events, 18 link requests) |
| Concierge (asked Jeeves) | **3 actors**, 14 asks |
| Feedback captured | **1 event** (👍, 100% positive, n=1) |
| Governed *holds* (paused for approval) | 13 (social dm ×5, publish ×2, invite, submit-application) |

## What the funnel actually shows

Most of the 687 events are **the governed agent doing work**, not humans clicking:
`gate_receipt` (116) + `action_event` (98) + `draft` (46) + `schedule` (27) + `notify`
(12) dominate — these are Jeeves drafting posts, syncing LinkedIn, running the delight
sweep, each leaving a signed receipt. That's the system working as designed: **every
agent effect is receipted, and 13 real actions correctly *held* for human approval**
(social DMs, publishes, an invite, an application). The governance loop is demonstrably
live on real activity.

The **human** top-of-funnel is thin by contrast:
- Page views: `view portal` 7 → `view concierge` 5 → `view signin` 4 → `click nav-home` 4.
- Only **8 actors ever authenticated**; of those, only **3 ever used the concierge** —
  the product's single most differentiating surface.
- **18 sign-in links requested vs 9 completed sign-ins** — a ~50% magic-link completion
  rate worth investigating (email deliverability? link friction? expiry?).

## Five things worth acting on

1. **Activation gap — concierge is underused (3 of 8 signed-in users).** Jeeves *is* the
   magic; most people never reach it. Surface it on first sign-in (an empty-state prompt,
   a "try asking…" starter set). → feeds the **UA / onboarding** lane.
2. **Feedback drought — 1 signal in 687 events.** The 👍/👎 widget isn't capturing
   anything. Prompt for it at moments of completed value (after a draft is approved, after
   a concierge answer), not just passively on every page.
3. **Magic-link completion ~50%.** 18 requests → 9 sign-ins. Worth a deliverability check
   (the `graph-client-secret` / M365 path) and shortening the link-to-landing hop.
4. **Governance is the proof-point, so show it.** 13 correctly-held actions + 116 receipts
   is the story regulated buyers want. A public, anonymized "what the gate held this week"
   counter would turn invisible safety into visible value.
5. **Security hygiene — a credential leaked into the activity label.** A concierge command
   (`wire telegram <token>`) stored the **raw bot token** in the activity log, violating
   the portal's own "metadata-only, no payloads" rule. Scrub the existing entry and add an
   input filter that redacts token/secret patterns before any label is persisted.

## Caveats

- n is small (35 actors, mostly steward/agent activity); treat directional, not
  statistically firm.
- "Actors" conflates human members, the steward, and the agent — a `is_human` tag on
  events would sharpen every funnel number above. (Cheap automation win — see Lane 4.)
