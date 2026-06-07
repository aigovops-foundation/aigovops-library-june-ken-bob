---
name: status-report
description: Compose status, leadership, and community updates from signed evidence only — facts, not guesses. Use weekly and on milestones. Trigger on "write the status update", "leadership report", "what shipped this week", "3P update", "community update".
---

# status-report

**Owning agent:** Herald

## When to use
Weekly cadence and every milestone.

## Inputs
- The reporting period
- The signed receipts from that period

## Procedure (repeatable)
1. Pull the period’s receipts (ships, tests, incidents, a11y, locales, releases).
2. Compose the report (internal-comms format) from those facts only.
3. Flag risks candidly — honest assessment over false comfort.
4. Leadership review.

## Human gate
Leadership (Bob/Ken) reviews before distribution.

## Evidence — the receipt
Emit via the `beacon-sign-evidence` skill: a metadata-only **`artifact`** receipt — `kind, actor=agent:herald, action=report, period, sources[], contentHash`. **No payloads, ever.**

## Done = Yes
Report signed + distributed; the public page reflects non-secret status. Then it enters **Stay at Yes** (monitored); on drift/incident, **Recover to Yes**.

## Notes
Because it’s built from receipts, the report is itself verifiable.

Implemented by `core/src/core/reports.js` (`statusReport`) — reads ONLY the signed ledger
and summarises receipts by action/kind. Run:
`node core/scripts/run-skill.mjs run status-report --input "<period label>"`. The
leadership review (human gate) and prose narrative remain human steps.
