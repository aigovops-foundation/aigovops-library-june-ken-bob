# `ops/receipts/` — one receipt per scheduled run

`runs.ndjson` is an append-only, hash-chained record of every completed scheduled workflow run
in this repository. One JSON object per line:

```json
{ "record": { "profile": "aigovops-run.v1", "kind": "run", "prev": "<hash>", "ts": "…",
              "actor": "workflow:…", "action": "scheduled", "workflow": "…", "runId": "…",
              "runAttempt": 1, "event": "schedule", "conclusion": "success",
              "sha": "…", "startedAt": "…", "endedAt": "…" },
  "hash": "<sha256 of the record in RFC 8785 canonical form>",
  "state": "unsigned" }
```

## Metadata only, enforced rather than remembered

`scripts/run-receipt.mjs` refuses any field outside a fixed allowlist, refuses any value that is
an object, and refuses a string over 200 characters. The Actions API returns commit messages,
branch names and actor logins; none of them reach this file. A receipt proves a run happened and
how it ended. It carries nothing about what the run saw.

## Unsigned is not signed

Most of these will say `"state": "unsigned"`, and that is the honest state, not a defect.

The core's `beacon.emit()` signs with Ed25519 — but its `loadOrCreateKeys()` *generates* a
keypair when it finds none, and a CI runner starts from a fresh checkout with no key. Every
scheduled run would mint a throwaway key, sign with it, and discard it; two fresh key
directories produced kids `648a8270d9247a2c` and `9765996ed1c5c190`. Those receipts would read
`signed` and nobody could verify one. A signature from a key that lived forty seconds is the
appearance of evidence, which is worse than none because it stops anyone looking.

So this hook never creates a key. An unsigned receipt is still hash-chained, and it is worth
being exact about how much that buys:

- Edit a past record → its own hash stops matching. Caught.
- Edit it and recompute that hash → the next entry's `prev` stops matching. Caught.
- Rewrite the file end to end and re-chain it → **verifies.** Not caught.

There is a test asserting that third case rather than an assumption hoping otherwise. The chain
proves nobody edited the file **in place**; only a signature proves **who wrote it**.

`node scripts/run-receipt.mjs` prints the signed/unsigned split on every run, and `--strict`
fails on any unsigned entry.

To sign: a founder mints an Ed25519 keypair and sets `BEACON_PRIVATE_KEY_PEM` and
`BEACON_PUBLIC_KEY_PEM` as repository secrets. Minting and enrolling a key is a Red act — an
agent prepares and proposes it, never does it. Receipts written after that point sign; the ones
before stay unsigned and honest about it.

## Who writes it

`.github/workflows/estate-interaction-crawl.yml`, hourly, and nothing else. Seven workflows run
on a schedule and six hold `contents: read`; giving each one write access so it could keep a log
would trade away the thing the record exists to protect. One writer, one declared path in
`policies/autonomy.yaml`.

The trade: a receipt lands up to an hour after the run it describes, and if the collector never
runs, nothing is recorded. What you gain is that a run cannot report on itself — a job that dies
cannot suppress its own receipt, and that is the run most worth having.
