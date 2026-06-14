---
name: doc-generate
description: Generate documentation for a capability, API, or process, grounded in source and the receipts it emits. Use when something ships or changes. Trigger on "document this", "write the docs", "update the README", "API docs".
run: prose
---

# doc-generate

**Owning agent:** Scribe

## When to use
A capability/API/process ships or changes.

## Inputs
- The source / schema
- The receipts the capability emits

## Procedure (repeatable)
1. Draft from source + schema + signed receipts (so docs match reality).
2. Plain-language pass; add a runnable example.
3. Cross-link to the framework(s) and the owning process playbook.
4. Maintainer review.

## Human gate
Maintainer review approves the docs.

## Evidence — the receipt
Emit via the `beacon-sign-evidence` skill: a metadata-only **`artifact`** receipt — `kind, actor, action=docs, target, version, contentHash`. **No payloads, ever.**

## Done = Yes
Docs merged + published; HIBT fact-log updated for any decisions. Then it enters **Stay at Yes** (monitored); on drift/incident, **Recover to Yes**.

## Notes
Docs describe how; live facts live in HIBT.md.
