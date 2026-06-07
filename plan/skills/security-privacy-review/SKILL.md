---
name: security-privacy-review
description: Strip secrets, scan for PII, and check the threat model before anything is exposed, shared, or released. Use before any exposure or Commons share. Trigger on "security review", "is this safe to publish", "scan for secrets", "PII check", "privacy review".
---

# security-privacy-review

**Owning agent:** Guardian

## When to use
Before any exposure, share to the Commons, or release.

## Inputs
- The artifact to be exposed/shared/released

## Procedure (repeatable)
1. Secret-scan and PII-scan (mandatory gates).
2. Re-check the written threat model: prompt injection, tool exfiltration, key compromise, malicious shared workflows, federation impersonation.
3. Confirm metadata-only — no payloads in any beacon.
4. Sign the review clean, or block with reasons.

## Human gate
A human approves exposure of anything sensitive.

## Evidence — the receipt
Emit via the `beacon-sign-evidence` skill: a metadata-only **`artifact`** receipt — `kind, actor=agent:guardian, action=sec-review, scans, result, contentHash`. **No payloads, ever.**

## Done = Yes
Review signed clean; artifact may be shared/published. Then it enters **Stay at Yes** (monitored); on drift/incident, **Recover to Yes**.

## Notes
Secrets never touch a client; keys live in the core / KMS only.

Implemented by `core/src/core/scanners.js` (dependency-free secret + PII + high-entropy
scan). Run it through the skill-runner:
`node core/scripts/run-skill.mjs run security-privacy-review --input "<artifact text>"`.
Any finding sets `result=blocked` (fails closed); the receipt records finding **types and
counts only — never the matched value**. The threat-model recheck (step 2) and the human
exposure gate remain human steps; this skill automates the mandatory secret/PII gate.
