# Process — Translation

**Discipline:** Translation & i18n · **Room:** all rooms · **Owning agent:** Polyglot · **Skill:** `translate-and-sign`

> English-first, never English-only — every human and agent string in the member’s language.

## Trigger
Any new or changed source string (UI, agent prompt, help, voice).

## Repeatable steps  *(the agent does the bureaucracy)*
1. Machine-translate for instant coverage across active locales.
2. Queue human review per locale; mark MT vs reviewed.
3. Sign reviewed translations as artifacts that supersede MT.
4. Verify RTL + ICU formatting render correctly.

## Human gate  *(humans hold the meaning)*
Human translation review per locale before reviewed status.

## Evidence — the receipt
Beacon emits a metadata-only **`artifact`** receipt: `kind, actor, action=translate, locale, source-hash, reviewed:bool`. Signed Ed25519, appended to the append-only ledger, verifiable with `openssl`. **No payloads, ever.**

## Done = Yes
Locale bundle signed; canonical receipt stays language-independent. Then it enters **Stay at Yes** (Sentinel watches); on drift/incident it runs **Recover to Yes**.

## Always
Output ships in the member's locale (English-first) and, where user-facing, meets **WCAG 2.2 AA**.
