---
name: monitor-and-alert
description: Watch production health, gate failures, and cap breaches; alert and cap-and-pause on breach. Use to stand up or run monitoring. Trigger on "set up monitoring", "watch for failures", "alerting", "is it healthy", "observability".
---

# monitor-and-alert

**Owning agent:** Sentinel

## When to use
Continuous, in production.

## Inputs
- The deployed workflow/service and its caps
- Alert thresholds

## Procedure (repeatable)
1. Collect structured logs + health checks; cookieless, aggregate analytics only.
2. Alert on error rate, gate failure, cap breach.
3. On breach: pause the affected workflow (cap-and-pause); open an incident.
4. Hand the on-call human a one-line, in-language summary.

## Human gate
A human is paged on any breach; never auto-remediate an irreversible.

## Evidence — the receipt
Emit via the `beacon-sign-evidence` skill: a metadata-only **`model`** receipt — `kind, actor=agent:sentinel, action=monitor, signal, severity, contentHash`. **No payloads, ever.**

## Done = Yes
Signal resolved or escalated; an incident enters Recover-to-Yes. Then it enters **Stay at Yes** (monitored); on drift/incident, **Recover to Yes**.

## Notes
Pairs with the public /status dashboard and privacy-preserving analytics.
