# Process — UX — flows

**Discipline:** Experience & flow · **Room:** Makerspace · **Owning agent:** Maker · **Skill:** `ux-flow-spec`

> Define how a member moves through a room toward Yes — every state, every fallback.

## Trigger
A new journey, room interaction, or conversation is introduced.

## Repeatable steps  *(the agent does the bureaucracy)*
1. Map the states (entry, happy path, error, empty, human-gate, offline).
2. Write the flow spec: triggers, transitions, copy intent, the path to Yes.
3. Prototype the critical path; check latency budget (cheap/cached-Yes first).
4. Review with a member-representative human.

## Human gate  *(humans hold the meaning)*
Usability review signs off the flow.

## Evidence — the receipt
Beacon emits a metadata-only **`artifact`** receipt: `kind, actor, action=ux-flow, room, states-count, contentHash`. Signed Ed25519, appended to the append-only ledger, verifiable with `openssl`. **No payloads, ever.**

## Done = Yes
Flow spec approved; design + UA + a11y reference it. Then it enters **Stay at Yes** (Sentinel watches); on drift/incident it runs **Recover to Yes**.

## Always
Output ships in the member's locale (English-first) and, where user-facing, meets **WCAG 2.2 AA**.
