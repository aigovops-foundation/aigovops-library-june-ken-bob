---
name: sponsorship-proposal
principle: P5
owner: bobrapp
agent: Herald
risk: yellow
description: Draft a sponsorship proposal in which every number is traceable to something already signed. Use when a prospective sponsor asks what we do and what it costs. Trigger on "write the sponsorship proposal", "sponsor deck", "what do we offer sponsors", "partnership proposal".
run: handler:sponsorship-proposal
inputs: {"type":"object","required":["prospect"],"properties":{"prospect":{"type":"string"},"tier":{"type":"string","description":"optional — a tier from the sponsorship rate card; omitted means propose from the card, never invent one"}}}
outputs: {"type":"object","required":["prospect","claims","asks","provenance","unsourced"],"properties":{"prospect":{"type":"object"},"claims":{"type":"array"},"asks":{"type":"array"},"provenance":{"type":"array"},"unsourced":{"type":"array"}}}
---

# sponsorship-proposal

**Owning agent:** Herald · **Human gate:** a founder approves; a founder sends; a founder prices.

## Why this skill is narrow on purpose

A sponsorship proposal is the document where a governance organisation is most tempted to
round up. Reach, attendance, downloads, "community of" — these are the numbers nobody checks
and everybody inflates, and they are exactly the numbers a sponsor's diligence will check
later, when the cost of having been wrong is highest.

So the rule here is stricter than "be accurate": **every quantitative claim resolves to a
signed receipt, a crawl result, or a source of record, or it does not appear.** A proposal
that cannot make a claim is a proposal that makes fewer claims. It is not a proposal that
estimates.

This is P5 applied to fundraising: what we cannot trace, we do not assert.

## What this skill will not do

**It does not set or negotiate a price.** Money is Red. Tiers and figures come from the
sponsorship rate card as it stands; if a prospect wants a number that is not on the card, that
is a founder's conversation and this skill records it in `unsourced[]` and stops.

**It does not send, and does not commit the Foundation to anything.** Output is a draft.

**It does not estimate.** No "approximately", no "over N", no rounding up to a rounder number.
A range is only allowed when the source of record itself carries a range.

## Inputs
- The prospect, and what they asked for.
- The sponsorship rate card (tiers, what each includes).
- The evidence available: the signed ledger, `docs/estate-health.json`, the estate manifest,
  and any published figure already in the estate.

## Procedure (repeatable)

1. **Write the claims first, as bare assertions**, before any prose. One line each.
2. **Attach a source to each claim.** Receipt id, crawl timestamp, or file and field. This is
   the step that decides the proposal; do it before you are attached to a sentence.
3. **Delete every claim with no source.** Move it to `unsourced[]` with what would be needed
   to make it sayable. That list goes to the founder — some of them are worth measuring.
4. **Round nothing.** If the ledger says 47, the proposal says 47.
5. **Take the asks from the rate card**, unchanged. No new tier, no bundled discount.
6. **Write the prose around the surviving claims**, then run `editorial-voice` and fix what
   comes back. Do not overclaim: we have full visibility of *effects*, not of model thoughts.
7. **Hand it to a founder** with `unsourced[]` visible, not appended.

## Acceptance criteria

| # | Criterion | How it is checked |
|---|---|---|
| 1 | Every number in the prose appears in `claims[]` | numeric tokens extracted from the body, matched against claims |
| 2 | Every claim carries a resolvable source | each `provenance[].source` is fetched or read; a dead reference fails |
| 3 | No claim is rounded relative to its source | claim value equals source value exactly |
| 4 | No hedge words on a quantity | "approximately", "over", "nearly", "more than" flagged unless the source carries a range |
| 5 | Asks match the rate card verbatim | tier names and figures diffed against the card |
| 6 | `unsourced[]` is surfaced to the founder | present at the top of the handoff |
| 7 | `editorial-voice` reports no `high` findings | that skill's own output |
| 8 | Nothing is sent and no price is set | this skill has neither capability |

## Output schema

```json
{
  "prospect": { "name": "…", "asked": "…" },
  "claims":   [ { "id": "c1", "text": "…", "value": 47, "unit": "…" } ],
  "asks":     [ { "tier": "…", "includes": ["…"], "figure": "…", "fromCard": true } ],
  "provenance": [ { "claim": "c1", "source": "ledger:receipt:…", "checkedAt": "…" } ],
  "unsourced":  [ { "text": "…", "wouldNeed": "a measurement nobody currently takes" } ]
}
```

## Human gate
A founder approves the draft, sets or confirms every figure, and sends it. Sponsorship touches
money and the Foundation's name at the same time; both are Red.

## Evidence — the receipt
Emit via `beacon-sign-evidence`: a metadata-only **`artifact`** receipt —
`kind, actor=agent:herald, action=draft, prospect (an opaque id, NOT a company name or a
contact), claimCount, unsourcedCount, contentHash`. **No prospect identity, no contact
details, no proposal text. Ever.**

## Done = Yes
The founder has a draft in which every number is traceable, `unsourced[]` is explicit, and the
receipt is signed. What the Foundation actually offers, and for how much, remains a human
decision.
