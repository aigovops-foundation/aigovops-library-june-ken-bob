# Process — disaster recovery (the DR agent)

*Rule of record for how the AiGovOps estate comes back. Built 2026-07-19. The runnable
version lives in the Omni repo: `core/dr.py`, `docs/RUNBOOK-dr.md`, `skills/dr-agent/`.*

---

## The one thing to know

```
jeeves dr
```

It reads the live system and tells you which step is broken. It changes nothing, so it is
always safe to ask. That is the entire procedure; everything below explains why it is built
the way it is.

---

## Who this is written for

Someone at 3am who did not build this. Maybe Ken. Maybe Bob after a bad week. Maybe a steward
we have not hired yet.

That reader sets every design constraint. Panic costs most people several grades of reading
ability, so the plan is written in short sentences and plain words — not because our stewards
are children, but because *nobody* reads well while frightened. The words are the interface.

---

## The four things that have to come back

Most recovery plans remember the first and forget the third.

| | What it means | Example of getting it wrong |
|---|---|---|
| **Services** | The programs that run | Site up, database down |
| **Users** | The people, and proof of who they are | Members restored, sign-in broken |
| **Permissions** | Who is allowed to do what | Everyone restored, **nobody is a co-founder** |
| **Relationships** | The outside companies we depend on | Our machine is perfect; the domain points elsewhere |

The third row is the one that hurts. A restore that returns every member but loses who holds
the keys hands the estate to nobody — or to everybody. So it is step 7, it is marked
DO NOT SKIP, and it checks both founders by name for co-founder status, the kill switch, and
role administration.

The fourth row is where automation stops. We do not own Cloudflare, 1Password, Resend or
Stripe. Those are re-pointed by a human, with a password.

---

## The four rules the agent will not break

**1 · A check that cannot look says "I do not know" — never "fine."**
`?` renders distinctly from `✓`, and the legend tells the reader to treat it as broken. This
is not caution for its own sake: the `offsite-backup` job reported success daily for weeks
while copying nothing, and that is the single most dangerous thing a control can do.

**2 · Safe steps repair themselves; irreversible ones cannot, by construction.**
Starting a stopped service has a `fix()`. Re-pointing DNS, restoring over live data, and
anything touching a credential have *no* `fix()` — there is no code path to call, so it
cannot be reached by accident or by argument. The boundary is **strictest on the worst day**,
because that is the day a wrong automatic move does the most damage.

**3 · One connection, not thirteen.**
The first version opened an SSH connection per step. Running it locked us out of production
mid-rehearsal — fail2ban read a dozen fast connections as an attack and banned us for ten
minutes. *The plan for getting back in locked us out of the machine we were recovering*, and
the natural human response (try again) makes it worse each time. Every remote question is now
asked once and cached.

**4 · It names its own gaps.**
Step 11 fails today, in the plain text, on purpose: the ledger signing key is not escrowed.

---

## The known gap, stated plainly

Our history is signed with a secret key that lives only in `/opt/omni/.env`. It is not in
1Password.

So a rebuild from backup would return every record — and no way to prove the records were not
changed. For an organisation whose product is trustworthy records, that is the gap that
matters most.

It is one paste to close: store `OMNI_GATE_KEY` as `omni-gate-key` in the vault. It also lets
backups stop carrying the key inside themselves. It sits on the Humans-Do board as
`escrow-gate-key`, and the monthly drill re-checks it.

---

## Why it is rehearsed monthly, not quarterly

The skill card originally claimed a quarterly rehearsal, and nothing ran it. The fleet-honesty
lane caught that on the first run and was right to: **an agent sits on the roster only if
something runs it.** A recovery plan nobody has ever run is a wish, and a wish written in a
runbook is worse than no runbook, because it buys calm nobody earned.

So `dr-rehearse` is a real monthly workflow. Monthly, not quarterly, because the estate
changes weekly — a quarterly drill could find a broken step three months after it broke.

The rehearsal is **read-only and never repairs**, not even the steps that are safe to repair.
It looks, records, and reports which step *used to work and has stopped*. Repair is
`jeeves dr fix`, typed by a co-founder who has read the output. A scheduled job that quietly
fixes production at 4am is precisely the unattended power this estate exists to refuse.

One more thing the rehearsal must not do: cry wolf. Step 13 — tell the members what happened
— can never be machine-confirmed, so it is marked human-only and excluded from the red/green
verdict. A check that can never go green would keep every drill permanently red and teach
everyone to ignore it.

---

*Related: Omni `docs/RUNBOOK-dr.md` (the same plan, plain words, for when Jeeves is down too)
· `docs/RUNBOOK-resilience.md` (how the backup layers work) · `plan/estate-review-2026-07-19.md`
(where several of these gaps were found).*
