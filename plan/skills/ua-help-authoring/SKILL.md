---
name: ua-help-authoring
description: Author in-context user assistance: tooltips, gate summaries, and the agent’s gentle "shall I?". Use when a feature users will touch is shipping. Trigger on "write the help", "add tooltips", "explain this gate to users", "user assistance".
---

# ua-help-authoring

**Owning agent:** Scribe

## When to use
Any feature or gate a member will encounter.

## Inputs
- The UX flow spec
- The gate(s) involved and their plain-language meaning

## Procedure (repeatable)
1. Find the moments of confusion in the flow.
2. Write plain-language help, tooltips, and one-line gate summaries ("here’s your path to Yes", never a wall of red).
3. Mark source strings (English-first) and hand to translate-and-sign.
4. Editorial review for tone and clarity.

## Human gate
Editorial review approves the help content.

## Evidence — the receipt
Emit via the `beacon-sign-evidence` skill: a metadata-only **`artifact`** receipt — `kind, actor, action=ua-help, feature, locales, contentHash`. **No payloads, ever.**

## Done = Yes
Help bundle shipped, localized, accessible, referenced from the feature. Then it enters **Stay at Yes** (monitored); on drift/incident, **Recover to Yes**.

## Notes
Humane copy is a delight requirement, not a polish pass.
