# Process — Accessibility

**Discipline:** Accessibility · **Room:** all rooms · **Owning agent:** Aperture · **Skill:** `accessibility-audit`

> No one is locked out — every surface meets WCAG 2.2 AA.

## Trigger
Any user-facing surface or change.

## Repeatable steps  *(the agent does the bureaucracy)*
1. Automated audit (contrast, roles, names, focus order, motion).
2. Manual pass with keyboard + a screen reader.
3. Fix issues; re-test; record exceptions with a plan.

## Human gate  *(humans hold the meaning)*
Accessibility sign-off before ship.

## Evidence — the receipt
Beacon emits a metadata-only **`artifact`** receipt: `kind, actor=agent:aperture, action=a11y, standard=WCAG2.2-AA, score, contentHash`. Signed Ed25519, appended to the append-only ledger, verifiable with `openssl`. **No payloads, ever.**

## Done = Yes
Surface passes AA; report signed; regressions watched by Sentinel. Then it enters **Stay at Yes** (Sentinel watches); on drift/incident it runs **Recover to Yes**.

## Always
Output ships in the member's locale (English-first) and, where user-facing, meets **WCAG 2.2 AA**.
