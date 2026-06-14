---
name: design-system-apply
description: Apply the AiGovOps visual system (Beacon look + library garden-of-delight) to any surface, illustration, or page. Use when building or restyling a room, page, mockup, or graphic. Trigger on "design this", "make it on-brand", "style this room", "apply the design system", "make it look like Beacon".
run: prose
---

# design-system-apply

**Owning agent:** Maker

## When to use
Any new or restyled surface that must feel like the Foundation.

## Inputs
- What the surface is (room, page, illustration)
- Whether it’s an app "screen" (dark) or a document/illustration (warm)

## Procedure (repeatable)
1. Pull tokens: Hydra Teal #01696f, Signal Green #2ecc71, warm gold #e8c25a; fonts Inter + DM Mono (Beacon) and Fraunces / Cinzel / Cormorant for warmth.
2. Choose the mode: dark teal-indigo for interfaces; warm parchment for plans/illustrations.
3. Make light the protagonist; map layout to the room metaphor; keep generous spacing and soft edges.
4. Produce the artifact (SVG/HTML) plus a one-line rationale.

## Human gate
A human approves taste and brand-fit (Bob/Ken or delegated designer).

## Evidence — the receipt
Emit via the `beacon-sign-evidence` skill: a metadata-only **`artifact`** receipt — `kind, actor, action=design, surface, tokens-version, contentHash`. **No payloads, ever.**

## Done = Yes
Approved design is committed and referenced by the UX flow / page that uses it. Then it enters **Stay at Yes** (monitored); on drift/incident, **Recover to Yes**.

## Notes
Reference exemplars in `docs/` (blueprint = dark; design-book = warm; plan = blended).
