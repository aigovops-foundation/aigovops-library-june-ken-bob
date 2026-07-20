# AiGovOps Library — The Plan (end-to-end)

> *"Agents do the bureaucracy; humans hold the meaning — and humans hold the keys."*

This is the private source of truth for **how the library is built and run**. The
public, secret-free face of it is the GitHub Pages site in [`/docs`](../docs/index.html).

## The arc everything serves
One spine runs through every discipline:

- **Get to Yes** — discover the gates, do the work, sign the first receipt.
- **Stay at Yes** — monitor, re-attest, keep evidence fresh.
- **Recover to Yes** — on drift or incident, remediate, re-sign, learn.
- **Always, in your language** — human and agent speak the member's tongue; the receipt stays canonical.

## The three layers
1. **Agents** — the library staff (see [`agents.md`](./agents.md)). Each is a *role* with a narrow, reversible capability and a named human it answers to.
2. **Skills** — reusable, version-controlled procedures (see [`skills.md`](./skills.md)). An agent is *who*; a skill is the repeatable *how*.
3. **Processes** — twelve repeatable playbooks (see [`processes/`](./processes/index.md)), one per discipline, all the same shape: **trigger → agent does the work → human gate → signed receipt → report.**

## Why every process emits a receipt
Beacon signs a **metadata-only** record for each meaningful step (Ed25519 + canonical
JSON + append-only NDJSON, verifiable with `openssl`). That makes the project's own
operation auditable — design decisions, test runs, translations, a11y audits,
incidents, releases — without ever storing payloads or PII. The receipt is the log;
the log is the proof; the proof is exportable.

## How it connects to the rest of the work
- The **architecture blueprint** is the *what to build*.
- The **end-to-end demo** is the *why*.
- The **experience & design book** is the *feel*.
- The **v1 core scaffold** is the *running skeleton*.
- **This plan** is the *how we operate* — the agents, skills, and repeatable processes that produce all of the above, governed and warm.

## The boundary (for us, too)
Claude prepares configs, values, and verification. **Bob and Ken make the irreversible
clicks** — repo creation, first push, Pages toggle, DNS, registrar, key enrollment —
after the risk is flagged. Honest assessment over false comfort, always.
