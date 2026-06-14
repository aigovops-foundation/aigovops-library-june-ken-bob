---
name: beacon-sign-evidence
description: Produce a metadata-only, Ed25519-signed receipt for any meaningful action and append it to the verifiable ledger. Use after ANY process step that should leave evidence (a design approved, a test run, a translation reviewed, a release shipped). Trigger on "sign this", "emit a receipt", "log to the ledger", "make it verifiable".
run: handler:beacon-sign-evidence
inputs: {"type":"object","required":["meta"],"properties":{"meta":{"type":"object"}}}
outputs: {"type":"object"}
---

# beacon-sign-evidence

**Owning agent:** Beacon

## When to use
Any step in any process that must be auditable. The receipt is the unit of truth.

## Inputs
- kind: prompt | model | artifact
- actor (member/agent id), action (short verb)
- optional gate {id, framework, act, decision}, model {provider,name}
- a content HASH the caller computed locally — never the payload

## Procedure (repeatable)
1. Call the core: `beacon.emit({ kind, actor, action, gate, model, locale, contentHash })` (see `core/src/core/beacon.js`).
2. Confirm it appended one NDJSON line to `core/ledger/beacons.ndjson` and chained `prev`.
3. Return the `{kid, sig, ts}` to the caller for display ("view receipt").

## Human gate
None to emit — but NEVER pass a payload. Only the fact/shape of the action + a hash. Guardian gates any sensitive exposure separately.

## Evidence — the receipt
Emit via the `beacon-sign-evidence` skill: a metadata-only **`(varies)`** receipt — `the signed record itself`. **No payloads, ever.**

## Done = Yes
`npm run verify` (in core/) reports the new entry, valid signature, intact chain. Verifiable offline with `openssl`. Then it enters **Stay at Yes** (monitored); on drift/incident, **Recover to Yes**.

## Notes
Metadata-only is a hard rule: no prompts, documents, or PII in the ledger. Swap the simplified canonicalizer for RFC 8785 (JCS) before production.
