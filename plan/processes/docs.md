# Process — Documentation

**Discipline:** Documentation · **Room:** Reading Room · **Owning agent:** Scribe · **Skill:** `doc-generate`

> Turn shipped capability into documentation grounded in source and receipts.

## Trigger
A capability, API, or process ships or changes.

## Repeatable steps  *(the agent does the bureaucracy)*
1. Generate a draft from source, schema, and the signed receipts it emits.
2. Plain-language pass; add a runnable example.
3. Cross-link to the framework(s) and the process playbook.
4. Maintainer review.

## Human gate  *(humans hold the meaning)*
Maintainer review approves the docs.

## Evidence — the receipt
Beacon emits a metadata-only **`artifact`** receipt: `kind, actor, action=docs, target, version, contentHash`. Signed Ed25519, appended to the append-only ledger, verifiable with `openssl`. **No payloads, ever.**

## Done = Yes
Docs merged and published; HIBT fact-log updated for any decisions. Then it enters **Stay at Yes** (Sentinel watches); on drift/incident it runs **Recover to Yes**.

## Always
Output ships in the member's locale (English-first) and, where user-facing, meets **WCAG 2.2 AA**.
