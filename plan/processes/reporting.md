# Process — Reporting

**Discipline:** Reporting · **Room:** Status · **Owning agent:** Herald · **Skill:** `status-report`

> Status, leadership, and community updates composed from signed evidence only.

## Trigger
Weekly cadence and on every milestone.

## Repeatable steps  *(the agent does the bureaucracy)*
1. Pull the week’s signed receipts (ships, tests, incidents, a11y, locales).
2. Compose the report (internal-comms format) — facts, not guesses.
3. Flag risks candidly; no smoothing over problems.
4. Leadership review.

## Human gate  *(humans hold the meaning)*
Leadership (Bob/Ken) reviews before distribution.

## Evidence — the receipt
Beacon emits a metadata-only **`artifact`** receipt: `kind, actor=agent:herald, action=report, period, sources[], contentHash`. Signed Ed25519, appended to the append-only ledger, verifiable with `openssl`. **No payloads, ever.**

## Done = Yes
Report signed and distributed; the public page reflects non-secret status. Then it enters **Stay at Yes** (Sentinel watches); on drift/incident it runs **Recover to Yes**.

## Always
Output ships in the member's locale (English-first) and, where user-facing, meets **WCAG 2.2 AA**.
