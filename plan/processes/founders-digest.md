# Process — the founders' digest

*Rule of record for the weekly page Bob and Ken actually read. Ladder row 13 of
[`plan/MASTER-PLAN.md`](../MASTER-PLAN.md). Engine: `scripts/founders-digest.mjs` ·
workflow: `.github/workflows/founders-digest.yml` · tests:
`test/founders-digest.test.mjs`.*

---

## The one thing to know

```
npm run digest
```

Mondays at 14:00 UTC the same command runs in CI and edits **one** issue in place, so there
is a single durable URL rather than a new issue every week that nobody subscribes to.

---

## What it is not

It is **not** another estate-health report. `estate-digest.mjs` already reports every page
hourly, and `estate-exec-digest.mjs` already groups the defects by root cause and explains why
"609 dead buttons" was really 203 counted three times. Reproducing either would give the
estate a second number for the same fact, which is the disease this programme is treating.

The digest takes **one line** of headline from that board and spends the rest of the page on
what nothing else covers.

---

## What it adds

**1 · Did the clock run at all.** If `docs/estate-health.json` has not been written in three
hours, that is the lead item and it reads red. *A silent monitor looks exactly like a healthy
estate* — the failure mode this estate has already lived through, twice: a backup job green
for weeks while copying nothing, and a scheduler that reported fresh because it was reading
the wrong file's timestamp.

**2 · Whether the gates are green.** Five checks keep the estate honest — the estate manifest,
autonomy, skills, the plan register, and supply-chain pinning. The digest runs them and says
so. A gate nobody watches is a gate that quietly stops running.

**3 · What waits on a human.** Assembled from the files, never hand-kept: an unanswered
canonical domain, an unratified manifest, a co-founder with no GitHub handle, unrecorded
principles, unmapped skills, and every plan document still marked `proposal`. Because it is
derived, it cannot go stale the way a list someone maintains does.

**4 · Drift between `estate.yaml` and reality.** A property in the manifest that nothing
watches, a data store nobody classified, a service whose status the repo disagrees about, a
domain with no owner on record.

**5 · The unknown count.** `estate.yaml`, principles, skills. An unknown is not a failure — it
is a thing we could not verify, printed rather than hidden. **The number should fall. If it
stops falling, that is the finding.**

---

## `watched_by` — how a property says it is covered

A property with `crawl.enabled: false` is reported as unwatched **unless** it declares
`crawl.watched_by`. The Library doorstep sets it, because `test-redirect-stub.mjs` checks it
nightly through `library-tests.yml`.

That field exists because the first run of this digest flagged the doorstep as drift when
something *was* watching it. A control that cries wolf about a covered property is a control
people learn to skip — the same lesson the link checker learned when it failed builds on
third-party 403s until the seven real 404s went unnoticed for months. If something watches a
property, say what, and the digest believes you.

---

## Delivery, and the boundary

The issue upsert is **green**: an issue is a message, not an effect.

Email is **credential-gated by design** — `send-digest-email.mjs` does nothing unless
`ESTATE_SMTP_URL` is set, and no secret lives in the repo. CI wires the send; a founder's
credential arms it. That is the prepare-don't-send boundary expressed in code rather than in
a comment.

`--waiting` exits 1 when something needs a founder. That is **information, not a failure**:
the workflow deliberately ignores the exit code, because a digest that fails to deliver
precisely when it has something to say would be the worst possible design.
