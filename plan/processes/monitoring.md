# Process — Monitoring

**Discipline:** Monitoring & observability · **Room:** Status · **Owning agent:** Sentinel · **Skill:** `monitor-and-alert`

> Watch health, gate failures, and cap breaches; pause and escalate to a human.

## Trigger
Continuous, in production.

## Repeatable steps  *(the agent does the bureaucracy)*
1. Collect structured logs + health checks (cookieless, aggregate analytics).
2. Alert on error rate, gate failure, cap breach.
3. On breach: pause the affected workflow (cap-and-pause), open an incident.
4. Hand the human a one-line, in-language summary.

## Human gate  *(humans hold the meaning)*
A human is paged on any breach; no auto-remediation of irreversibles.

## Evidence — the receipt
Beacon emits a metadata-only **`model`** receipt: `kind, actor=agent:sentinel, action=monitor, signal, severity, contentHash`. Signed Ed25519, appended to the append-only ledger, verifiable with `openssl`. **No payloads, ever.**

## Done = Yes
Signal resolved or escalated; incident enters Recover-to-Yes. Then it enters **Stay at Yes** (Sentinel watches); on drift/incident it runs **Recover to Yes**.

## Always
Output ships in the member's locale (English-first) and, where user-facing, meets **WCAG 2.2 AA**.
