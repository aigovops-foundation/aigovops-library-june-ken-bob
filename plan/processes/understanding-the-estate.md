# Process — understanding and managing the estate

*Rule of record for how a founder or steward sees the whole system at once. Built
2026-07-20. The runnable version lives in the Omni repo: `core/estate_map.py`,
`docs/RUNBOOK-estate-map.md`, `skills/estate-map/`.*

---

## The one thing to know

```
jeeves estate
```

or open **`/estate.html`**. Same picture, same source, steward-only.

---

## What problem this solves

The estate had grown about thirty control-room pages. Each was good at its own subject, and
none of them answered the question a founder actually asks in the morning:

> **What have we got, is it alright, and what needs me?**

Answering it meant opening eight tabs and holding the result in your head — which is another
way of saying nobody did it. Drift went unnoticed until something broke.

Eight tabs is not an answer.

---

## What it shows

| Section | The question it answers |
|---|---|
| **Services** | Are the five processes up? |
| **Data** | Members present · ledger verifying · scheduler fresh · backups fresh · database reachable |
| **Agents** | How many of the roster can actually run |
| **Schedules** | Is anything on a timer, and is any of it erroring |
| **Outside** | The companies we don't own — DNS, email, the vault, Telegram |
| **Needs a human** | The only real to-do list |

Every row also names **who acts** — `automatic` or `needs you`. That column is the most
useful thing on the page and the one dashboards usually omit.

---

## How to read it

| Mark | Meaning |
|---|---|
| ✓ | good |
| ✗ | broken |
| **?** | **could not check — treat as broken** |

The third mark is the entire point, and "everything is running" requires **zero broken AND
zero unknown** — not merely nothing red.

This is not caution for its own sake. On 2026-07-19 the estate discovered its instruments
were the least trustworthy things it owned: a backup job green for weeks while copying
nothing, a test gate measuring a configuration nobody deploys, founder gates reporting "done"
for checks that had never run. **A page that renders a failed check as a tick is worse than
no page**, because it actively buys false calm.

---

## The lesson it taught by failing at its own job

On its **first run against production** the map showed two red rows. Both were its own false
alarms.

- *"scheduler silent for 610h"* — it read the modification time of `schedules.json`, which
  only changes when a schedule is **edited**, not when the tick **runs**. The tick had fired
  ten minutes earlier and succeeded.
- *"0 runnable of 42"* — it filtered agents on a `status` field the rows do not have, so
  every agent looked dead.

A brand-new instrument reproduced, twice and within minutes, the exact failure it had been
built to prevent. Two rules came out of that, and they are now enforced by tests:

1. **Liveness must be asserted by the live thing, not inferred from a side effect of it being
   busy.** The tick now writes a heartbeat on every run, whether or not anything was due —
   because a scheduler with nothing due is still alive, and inferring otherwise punishes a
   quiet day.
2. **A guessed schema reads as catastrophe.** Ask the object what it contains rather than
   assuming its shape.

The general form is worth keeping: *a new instrument earns no trust by default, and the first
place to point it is at itself.*

---

## Where the boundaries are

The map **reports; it never repairs**. There is no gated effect and no action button, and
that is deliberate — a dashboard that can also act is a dashboard that acts by accident.

Repair lives where a human decides:

- `jeeves dr` — the thirteen-step recovery plan (see [`disaster-recovery`](./disaster-recovery.md))
- `jeeves humans-do` — the irreversible moves only a founder can make

---

*Related: Omni `docs/RUNBOOK-estate-map.md` · [`disaster-recovery`](./disaster-recovery.md) ·
`plan/estate-review-2026-07-19.md`.*
