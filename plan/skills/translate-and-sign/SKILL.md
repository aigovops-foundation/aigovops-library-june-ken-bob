---
name: translate-and-sign
description: Localize any string (UI, agent prompt, help, voice) — machine translation for instant coverage, human review per locale, then sign the reviewed bundle. English-first, never English-only. Trigger on "translate this", "add a locale", "localize", "i18n", "make it speak Spanish/Arabic/…".
---

# translate-and-sign

**Owning agent:** Polyglot

## When to use
Any new or changed source string.

## Inputs
- Source strings (English = source of truth)
- Active target locales

## Procedure (repeatable)
1. Machine-translate for instant coverage; mark entries MT.
2. Queue human review per locale; mark reviewed entries.
3. Sign reviewed translations as artifacts that supersede MT.
4. Verify RTL + ICU number/date/currency formatting render correctly.

## Human gate
Human translation review per locale before "reviewed" status.

## Evidence — the receipt
Emit via the `beacon-sign-evidence` skill: a metadata-only **`artifact`** receipt — `kind, actor, action=translate, locale, source-hash, reviewed:bool`. **No payloads, ever.**

## Done = Yes
Locale bundle signed; the canonical receipt stays language-independent. Then it enters **Stay at Yes** (monitored); on drift/incident, **Recover to Yes**.

## Notes
v1 ships en + es in `core/src/i18n`; negotiation is by Accept-Language.
