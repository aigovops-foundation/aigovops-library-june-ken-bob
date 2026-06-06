# Process — Test

**Discipline:** Quality / testing · **Room:** Makerspace · **Owning agent:** Cloud-Mary · **Skill:** `cloud-mary-testing`

> Prove nothing broke before anything ships — unit, e2e, scale, chaos.

## Trigger
Any change, before it can merge.

## Repeatable steps  *(the agent does the bureaucracy)*
1. Run the tiers (unit → e2e → scale → chaos) on a clean tree.
2. Block on red; capture the run summary.
3. Attach results to the PR; re-run on rebase.

## Human gate  *(humans hold the meaning)*
Green before merge (enforced in CI).

## Evidence — the receipt
Beacon emits a metadata-only **`model`** receipt: `kind, actor=agent:cloud-mary, action=test, tiers, pass/fail, contentHash`. Signed Ed25519, appended to the append-only ledger, verifiable with `openssl`. **No payloads, ever.**

## Done = Yes
All tiers green; release process may proceed. Then it enters **Stay at Yes** (Sentinel watches); on drift/incident it runs **Recover to Yes**.

## Always
Output ships in the member's locale (English-first) and, where user-facing, meets **WCAG 2.2 AA**.
