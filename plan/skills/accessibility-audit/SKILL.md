---
name: accessibility-audit
description: Audit any user-facing surface to WCAG 2.2 AA and drive it to pass. Use on every surface before it ships. Trigger on "check accessibility", "a11y audit", "is this accessible", "WCAG", "screen-reader test".
---

# accessibility-audit

**Owning agent:** Aperture

## When to use
Any user-facing surface or change.

## Inputs
- The surface (page/room/component)

## Procedure (repeatable)
1. Automated audit: contrast, roles, names, focus order, reduced-motion.
2. Manual pass: keyboard-only + a screen reader.
3. Fix issues; re-test; record any exception with a remediation plan.

## Human gate
Accessibility sign-off before ship.

## Evidence — the receipt
Emit via the `beacon-sign-evidence` skill: a metadata-only **`artifact`** receipt — `kind, actor=agent:aperture, action=a11y, standard=WCAG2.2-AA, score, contentHash`. **No payloads, ever.**

## Done = Yes
Surface passes AA; report signed; Sentinel watches for regressions. Then it enters **Stay at Yes** (monitored); on drift/incident, **Recover to Yes**.

## Notes
No surface ships that locks someone out — held to a higher bar.

Automated subset implemented by `core/src/core/a11y.js` (dependency-free, no browser):
missing alt text, `<html lang>`, `<title>`, viewport, single `<h1>`, empty links. Run:
`node core/scripts/run-skill.mjs run accessibility-audit --input "<html>"`. This is the
provable subset only — contrast, focus order, and screen-reader behaviour still need
axe/pa11y plus the manual pass in step 2.
