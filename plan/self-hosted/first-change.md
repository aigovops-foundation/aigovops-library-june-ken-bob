# First self-hosted change

This file is the AiGovOps Library's **first change authored through its own
governed loop** (#3, the self-hosting milestone — laptop-safe worktree interim).

## How it was made

It was **proposed by an agent** through the Yes-Gate, not hand-written into the
tree:

```
propose → human approve → brokered 'self-host' token
        → authored in an ISOLATED git worktree → signed mutation receipt → verify
```

Reproduce it: `cd core && npm run self-host:demo` (drives
`core/scripts/self-host-demo.mjs` against `core/src/core/worktree.js`).

## Provenance

- **Mutation receipt id:** `90a6f0166a265d8c13bf651d543871cb256c3d01fafca07265c400af351a4f9c`
- The receipt is `kind: mutation`, `action: file-change-proposed`, and its
  `detail.parent` links back to the human-approval (proposal) receipt — a
  verifiable chain from "a human said yes" to "this exact change was authored".
- The receipt lives in the operator's signed Beacon ledger
  (`core/ledger/`, gitignored); verify it with `cd core && npm run verify`.

## Why this matters

The agent built the change **sealed and receipted, in an isolated worktree it
could not escape**, and **never committed** — a human landed it. That is the
project's whole thesis applied to its own source: *agents do the bureaucracy;
humans hold the meaning — and humans hold the keys.*

gVisor (Ticket 4) hardens the same contract at the kernel on a Linux enclave;
the worktree path makes it work today, on a laptop, fail-closed.
