# Process — Security & privacy

**Discipline:** Safety, security & privacy · **Room:** the gateway · **Owning agent:** Guardian · **Skill:** `security-privacy-review`

> Strip secrets, scan for PII, hold the threat model — block unsafe exposure.

## Trigger
Before any exposure, share to the Commons, or release.

## Repeatable steps  *(the agent does the bureaucracy)*
1. Secret-scan and PII-scan the artifact (mandatory gates).
2. Re-check against the written threat model (injection, exfiltration, key compromise, malicious shared workflows, federation impersonation).
3. Confirm metadata-only — no payloads in any beacon.
4. Sign the review or block with reasons.

## Human gate  *(humans hold the meaning)*
A human approves exposure of anything sensitive.

## Evidence — the receipt
Beacon emits a metadata-only **`artifact`** receipt: `kind, actor=agent:guardian, action=sec-review, scans, result, contentHash`. Signed Ed25519, appended to the append-only ledger, verifiable with `openssl`. **No payloads, ever.**

## Done = Yes
Review signed clean; artifact may be shared/published. Then it enters **Stay at Yes** (Sentinel watches); on drift/incident it runs **Recover to Yes**.

## Always
Output ships in the member's locale (English-first) and, where user-facing, meets **WCAG 2.2 AA**.
