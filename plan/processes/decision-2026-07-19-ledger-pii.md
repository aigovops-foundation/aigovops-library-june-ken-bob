# Decision record — the 31 historic ledger records that contain an email address

*Decided 2026-07-19 by Bob Rapp, co-founder. Recorded because a governance decision that
lives only in a chat log is not a governance decision.*

---

## The facts, counted rather than estimated

| | |
|---|---|
| Total ledger records | 1,802 |
| Records containing an email address | **31** |
| Window | 2026-06-23 → 2026-07-19 03:18 |
| Can the number grow? | **No.** The scrub sits at `ledger.append` — the single point every record passes through. |

The cause: `principal_for_email()` uses the full verified address as the principal, and the
principal was written into receipts directly. Right-to-be-forgotten pseudonymised the member
record while the ledger kept the address permanently — which is precisely the promise our own
standards page had been making and not keeping.

The forward fix shipped the same day: principals are hashed at the chokepoint, free-text
fields are reduced to a length, and a test lane enforces both.

## The three options

**(a) Document the exception.** Leave history intact; publish the count, the window, and the
date the scrub began. Cost: 31 addresses remain in an append-only log we cannot edit.

**(b) Key-rotation boundary.** Rotate the signing key, archive the old chain offline as a
closed volume, start a fresh chain. Strongest privacy answer. Cost: a rotation, and a seam in
the history.

**(c) Redact and re-sign.** Rewrite the affected lines. Cost: it breaks the append-only claim,
and is only honest if you publish that you did it — at which point you have (a) plus a
weakened guarantee.

## The decision: (a)

**An append-only log you edit when it embarrasses you is not an append-only log.**

The estate's entire product is that its history is unfalsifiable. (c) trades tamper-evidence
for tidiness, which is the one move that directly contradicts the thing we sell — and we would
be making it on our own record, about our own mistake, which is exactly when the temptation is
strongest and the precedent worst.

(b) is genuinely the stronger *privacy* answer and was not dismissed lightly. It was declined
because the exposure is bounded and small (31 records, one month, addresses members gave us
knowingly for an account we still hold), while the cost — a seam in the chain — is permanent
and would have to be explained to every future auditor.

(a) is also the only option that is *already true* and verifiable by anyone: the count is
reproducible from the chain itself.

## What was published

`standards.html` states the exact number and window in plain language, and says we chose to
document rather than rewrite. It does not soften it. Members read the real number.

## What would change this decision

If the count were materially larger, if it included data members had not knowingly given us,
or if it included anything in a special category (health, biometrics, financial), (b) becomes
the right answer and this record should be superseded rather than amended.

*Related: `plan/estate-review-2026-07-19.md` (W1-4, where this was found) ·
[`disaster-recovery`](./disaster-recovery.md).*
