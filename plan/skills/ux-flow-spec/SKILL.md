---
name: ux-flow-spec
description: Specify how a member moves through a room toward Yes — every state, transition, and fallback. Use before building a new journey or interaction. Trigger on "design the flow", "spec the UX", "map the states", "what happens when…".
run: prose
---

# ux-flow-spec

**Owning agent:** Maker

## When to use
A new journey, room interaction, or conversation.

## Inputs
- The room and the member goal
- Known constraints (latency budget, offline, locale)

## Procedure (repeatable)
1. Enumerate states: entry, happy path, error, empty, human-gate, offline.
2. Write transitions + copy intent + the path to Yes for each state.
3. Honor the latency budget: cheap/cached-Yes first; cloud only when it earns it.
4. Prototype the critical path; review with a member-representative human.

## Human gate
Usability review signs off the flow.

## Evidence — the receipt
Emit via the `beacon-sign-evidence` skill: a metadata-only **`artifact`** receipt — `kind, actor, action=ux-flow, room, states-count, contentHash`. **No payloads, ever.**

## Done = Yes
Flow spec approved; design, UA, and accessibility reference it. Then it enters **Stay at Yes** (monitored); on drift/incident, **Recover to Yes**.

## Notes
Pair with design-system-apply (look) and ua-help-authoring (words).
