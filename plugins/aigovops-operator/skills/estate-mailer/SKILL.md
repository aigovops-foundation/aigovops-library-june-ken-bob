---
name: estate-mailer
principle: unknown
owner: bobrapp
agent: Deploy
risk: red
department: operator
description: Stand up and verify the estate's email sender the right way — a Microsoft Graph app-only mailer (Foundation address, unattended in CI), or SMTP. Use to turn on the hourly digest + member drip, or to check why email isn't sending. Trigger on "set up email", "estate mailer", "turn on the digest email", "email isn't sending", "mail health", "Graph app-only", "go live email".
run: prose
inputs: {"type":"object","properties":{"sender":{"type":"string"}}}
outputs: {"type":"object"}
---

# estate-mailer

**Owning agent:** Jeeves

## When to use
To make the estate actually email — the hourly health digest and the member drip — from a
real Foundation address, unattended. Or to diagnose a silent mailer.

## The right way (Microsoft 365 org)
A dedicated **Graph app-only** app: `Mail.Send` **application** permission, admin-consented,
locked to one sender mailbox, client secret in CI. Not a personal inbox, not basic-auth SMTP.
`scripts/send-mail.mjs` already speaks it; it just needs four secrets.

## Procedure (repeatable)
1. **Create the mailer** — one of:
   - **Fully automated:** `bash deploy/setup-estate-mailer.sh [sender@domain]` — creates the
     Entra app, adds `Mail.Send` + admin consent, mints the secret, and sets the four
     `GRAPH_*` GitHub secrets via the operator's `az` + `gh`. The secret never leaves their
     machine. (Runbook: `plan/processes/go-live-entra-and-hosting.md`, Track A.)
   - **Browser-driven:** hand the operator's browser agent (Comet / Claude-for-Chrome) the
     Part 1/Part 2 prompt from the go-live runbook — it drives their logged-in Entra + GitHub.
   The Entra app, admin consent, and secret are the human's credentialed move — an agent
   prepares and hands off; it never mints or reads the secret.
2. **Verify (non-destructive):** `node scripts/mail-health.mjs` — fetches a client-credentials
   token to prove the app + secret + consent work, **without sending**. `--write
   docs/estate-health.json` records `mail` health on the board.
3. **Confirm a real send:** trigger `estate-interaction-crawl.yml` once; the mail step prints
   `send-mail(graph): sent …`. The digest lands from the Foundation address.

## Human gate
Creating the app / granting consent / minting the secret is the operator's move (it mints
credentials and grants tenant access — the irreversibility boundary). The agent scaffolds and
verifies; it never sends as the founders without their armed credentials.

## Evidence — the receipt
Every send is brain-logged metadata-only (`send-mail.mjs`: template + recipient/body hash +
ts, never the body/PII). `mail-health` writes a metadata-only `mail` record to the board. For
a signed artifact, emit via `beacon-sign-evidence` an `artifact` receipt —
`actor=agent:jeeves, action=mail-health, provider, status`.

## Done = Yes
`mail-health` is `ok (graph)` on the board and a triggered run prints `sent`. Then it enters
**Stay at Yes** (the hourly job re-checks mail health each run); on a red mail status,
**Recover to Yes** — re-run setup or rotate the secret.

## Notes
Harden by locking the app to one mailbox: `New-ApplicationAccessPolicy -AppId <id>
-PolicyScopeGroupId <sender> -AccessRight RestrictAccess`. SMTP (`ESTATE_SMTP_URL`) is the
fallback provider if Graph isn't used.
