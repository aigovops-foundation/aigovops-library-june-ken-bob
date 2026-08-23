---
name: ai-house-announce
principle: P10
owner: bobrapp
agent: Host
risk: yellow
description: Draft the monthly AI House session announcement in the Foundation's voice, from facts that already exist. Use once a month, about two weeks out. Trigger on "announce AI House", "write the AI House email", "next month's session", "AI House invite".
run: handler:ai-house-announce
inputs: {"type":"object","required":["session"],"properties":{"session":{"type":"string","description":"which session — a date or a label that resolves to one row in the sessions source of record"}}}
outputs: {"type":"object","required":["session","channels","provenance","unresolved"],"properties":{"session":{"type":"object"},"channels":{"type":"object"},"provenance":{"type":"array"},"unresolved":{"type":"array"}}}
---

# ai-house-announce

**Owning agent:** Host · **Human gate:** a founder approves before anything is sent.

## When to use
Once a month, about two weeks before the session. Also for a re-send when a detail changes —
a moved date, a replaced speaker — where the correction, not the invitation, is the point.

## What this skill will not do

**It does not send.** Sending mail as the Foundation is a Red action: it is outward-facing,
irreversible, and it goes out over Bob's or Ken's name. This skill produces a draft and stops.
The `estate-mailer` skill and a human do the rest, in that order.

**It does not invent a fact.** Not a date, not a time, not a speaker's name, not a
registration link. Skills hold procedure, not facts. Every concrete detail is copied from a
source of record or reported as unresolved — see below.

## Inputs
- Which session (a date, or a label that resolves to exactly one row).
- The sessions source of record. Today that is the events entry the `links-for-events` skill
  maintains; if a session is not there, it is not announced.
- The last two announcements, read for continuity of voice — not for facts, which may have
  changed.

## Procedure (repeatable)

1. **Resolve the session to one row.** Zero rows or more than one is a stop, not a guess.
2. **Copy every hard fact from that row** — date, start time *with an explicit timezone*,
   duration, title, host, speaker, registration URL, whether it is members-only.
3. **List what did not resolve.** Any field the source of record does not carry goes in
   `unresolved[]` with the field name. It never gets filled with a plausible value.
4. **Write the body once**, in the Foundation's voice — run it past `editorial-voice` and fix
   what comes back before going further.
5. **Cut the channel variants from that one body.** Email, community post, and a short social
   card, in that order of authority. They say the same thing; they do not each get their own
   claims.
6. **Check the registration URL resolves** and points at this session, not last month's.
7. **Hand the draft to a founder** with `unresolved[]` at the top, not buried at the bottom.

## Acceptance criteria

A draft is ready for a founder when all of these hold. Any one failing means it is not ready.

| # | Criterion | How it is checked |
|---|---|---|
| 1 | Every date, time, name and URL appears in the source of record | field-by-field diff against the resolved row |
| 2 | Times carry an explicit timezone | no bare "7pm" anywhere in any channel |
| 3 | `unresolved[]` is complete and surfaced | every source field that was empty is listed |
| 4 | The registration URL returns 200 and names this session | fetched, and the page title checked |
| 5 | The three channels make no claim the email does not | claim-set of each variant ⊆ claim-set of the email |
| 6 | `editorial-voice` reports no `high` findings | that skill's own output |
| 7 | Nothing is sent | this skill has no send capability, by construction |

## Output schema

```json
{
  "session":   { "date": "…", "startsAt": "…", "timezone": "…", "title": "…",
                 "host": "…", "speaker": "…", "registrationUrl": "…", "membersOnly": true },
  "channels":  { "email": { "subject": "…", "body": "…" },
                 "community": { "title": "…", "body": "…" },
                 "social": { "body": "…" } },
  "provenance": [ { "field": "date", "source": "events:2026-09", "value": "…" } ],
  "unresolved": [ { "field": "speaker", "why": "the source of record has no speaker yet" } ]
}
```

`provenance[]` carries one entry per hard fact. A fact with no provenance entry is a bug in
this skill, not a detail someone forgot.

## Human gate
A founder (Bob or Ken) approves the draft, and a founder sends it. Neither step is delegable:
the announcement carries the Foundation's name to people who did not ask this agent for
anything.

## Evidence — the receipt
Emit via `beacon-sign-evidence`: a metadata-only **`artifact`** receipt —
`kind, actor=agent:host, action=draft, session, channels[], unresolvedCount, contentHash`.
**No body text, no recipient list, no addresses. Ever.**

## Done = Yes
A founder has the draft, `unresolved[]` is empty or explicitly accepted, and the receipt is
signed. The announcement going out is a separate, human act with its own record.
