# Process — Architecture

**Discipline:** Architecture & compliance · **Room:** Reading Room · **Owning agent:** Lantern + Maker · **Skill:** `framework-map`

> Turn a hard, high-value/high-risk problem into mapped gates and a durable decision record.

## Trigger
A new high-risk capability or a significant design choice arises.

## Repeatable steps  *(the agent does the bureaucracy)*
1. Lantern maps the problem to frameworks → the gates you’ll face.
2. Pull the matching real fail cases from the proof set.
3. Write an ADR (decision, options, the chosen Route + why).
4. Draft/refresh the blueprint section it touches.

## Human gate  *(humans hold the meaning)*
Architecture review (Bob/Ken) approves the direction.

## Evidence — the receipt
Beacon emits a metadata-only **`artifact`** receipt: `kind, actor, action=architecture, frameworks, gates, contentHash`. Signed Ed25519, appended to the append-only ledger, verifiable with `openssl`. **No payloads, ever.**

## Done = Yes
ADR signed; blueprint updated; gates feed the Yes-Gate engine. Then it enters **Stay at Yes** (Sentinel watches); on drift/incident it runs **Recover to Yes**.

## Always
Output ships in the member's locale (English-first) and, where user-facing, meets **WCAG 2.2 AA**.
