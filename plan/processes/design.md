# Process — Design

**Discipline:** Visual & brand design · **Room:** Makerspace · **Owning agent:** Maker · **Skill:** `design-system-apply`

> Produce on-brand surfaces in the Beacon look warmed with the library garden-of-delight.

## Trigger
A new surface, room, illustration, or rebrand is requested.

## Repeatable steps  *(the agent does the bureaucracy)*
1. Pull the design tokens (Hydra Teal #01696f, Signal Green #2ecc71, warm gold, Inter + DM Mono + Fraunces).
2. Compose the layout to the room metaphor; keep light as the protagonist.
3. Produce a still (SVG/HTML) and a short rationale.
4. Hand to a human for taste + brand-fit.

## Human gate  *(humans hold the meaning)*
A human approves the design direction (Bob/Ken or a delegated designer).

## Evidence — the receipt
Beacon emits a metadata-only **`artifact`** receipt: `kind, actor, action=design, surface, tokens-version, contentHash`. Signed Ed25519, appended to the append-only ledger, verifiable with `openssl`. **No payloads, ever.**

## Done = Yes
Approved design is committed and referenced by the UX flow that uses it. Then it enters **Stay at Yes** (Sentinel watches); on drift/incident it runs **Recover to Yes**.

## Always
Output ships in the member's locale (English-first) and, where user-facing, meets **WCAG 2.2 AA**.
