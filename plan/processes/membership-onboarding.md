# Member onboarding — scaffold + governance (auto-accept is OFF)

The ask: *auto-add members (≤1/min), auto-welcome them read-only, send a welcome + daily
update + a Friday ask to Bob/Ken, cc Bob and Ken on every mail, and monitor what members do —
letting them read but not create without Ken or Bob.*

Most of that is **already the governed model**. The rest crosses the irreversibility boundary
and is **prepared here, not switched on**. This doc is the record of what's built, what stays
off, and the exact human steps to go live.

## What is already true (no new machinery)

- **"Read but not create without Ken or Bob"** is the Yes-Gate. A member's role is **read +
  propose**; every effect is a proposal a human decides. Members never create autonomously.
- **"Monitor what they do"** is the signed ledger — metadata-only. Stewards see all effects;
  members see only their own. (`identity.js`, `oversight.js`.)

## What this scaffold adds (reversible, inert until armed)

- **`member-onboarding.config.json`** — `auto_accept: false`, `default_capability: "read"`,
  `rate_limit_per_minute: 1`, `cc_founders_on_every_email: true`. Prepared, not self-activating.
- **`scripts/send-digest-email.mjs`** — dependency-free emailer that **sends nothing** unless
  `ESTATE_SMTP_URL` is set. Every mail cc's the founders (`founders.json`).
- **Templates** — `plan/templates/member-welcome.md`, `member-daily-update.md`,
  `member-friday-ask.md` (the Friday ask goes TO Bob/Ken; members get welcome + daily).

## The irreversibility boundary — what stays OFF until a human arms it

Per the one rule that overrides everything, an agent never does these autonomously. Each is a
human's move:

1. **Auto-accept members / grant access** — flipping `auto_accept: true` admits registrants to
   read-only. This is an access-control change; it needs the **live IdP** (Keycloak/OIDC or the
   GitHub-OAuth hub default) and Bob/Ken's explicit go. Until then: registrations queue for a
   human yes.
2. **Send email as the Foundation** — arming `ESTATE_SMTP_URL` (an SMTP/app-password secret) is
   Bob's credential step. No key, no mail.
3. **Promote a member above read-only** — only ever on an explicit Bob/Ken approval (the Friday
   ask surfaces candidates; it never self-approves).

## Go-live checklist (the human steps)

- [ ] Stand up / point at the IdP for the membership wall (the enclave/OIDC work, N1).
- [ ] Create an email sender identity; set `ESTATE_SMTP_URL` as a repo secret (e.g.
      `smtps://user:app-password@smtp.gmail.com:465`).
- [ ] Add Ken to `founders.json` (`handles` + `emails`).
- [ ] Decide the guardrails you want on open registration (domain allow/deny, a hold on the
      first N, captcha at the wall) and set them.
- [ ] Flip `auto_accept: true` **only when** the above are in place — a steward move, reviewed,
      never by an agent on its own.

Until every box is checked, this stays a scaffold: it prepares and proposes; you make the
irreversible move.
