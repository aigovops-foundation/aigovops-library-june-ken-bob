# Process — UA — user assistance

**Discipline:** User assistance / help · **Room:** Front Desk · **Owning agent:** Scribe · **Skill:** `ua-help-authoring`

> In-context help, tooltips, and the agent’s gentle “shall I?” so no one is lost.

## Trigger
A feature or gate users will touch is shipping.

## Repeatable steps  *(the agent does the bureaucracy)*
1. Identify the moments of confusion in the UX flow.
2. Author plain-language help, tooltips, and gate summaries.
3. Localize source strings (English-first) and queue translation.
4. Editorial review for tone and clarity.

## Human gate  *(humans hold the meaning)*
Editorial review approves the help content.

## Evidence — the receipt
Beacon emits a metadata-only **`artifact`** receipt: `kind, actor, action=ua-help, feature, locales, contentHash`. Signed Ed25519, appended to the append-only ledger, verifiable with `openssl`. **No payloads, ever.**

## Done = Yes
Help bundle shipped; referenced from the feature; localized + accessible. Then it enters **Stay at Yes** (Sentinel watches); on drift/incident it runs **Recover to Yes**.

## Always
Output ships in the member's locale (English-first) and, where user-facing, meets **WCAG 2.2 AA**.
