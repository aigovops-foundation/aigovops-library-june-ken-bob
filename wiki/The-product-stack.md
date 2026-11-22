# The product stack

The engines that make, bind, read and carry signed receipts. All conform to (or are moving onto) OVERT 1.0.

| Repo | Owner | Updated | Licence |
|---|---|---|---|
| [Beacon](#beacon) | `aigovops-foundation` | 2026-10-05 | Apache-2.0 |
| [Umbrella-GovOps](#umbrella-govops) | `aigovops-foundation` | 2026-09-11 | Apache-2.0 |
| [Lantern](#lantern) | `aigovops-foundation` | 2026-08-17 | Apache-2.0 |
| [aigovops — Open Source v4 (trunk)](#aigovops--open-source-v4-trunk) | `aigovops-foundation` | 2026-08-23 | MIT (LICENSE file) |
| [One Receipt](#one-receipt) | `aigovops-foundation` | 2026-09-29 | Apache-2.0 / CC BY 4.0 |
| [REPLAY](#replay) | `aigovops-foundation` | 2026-08-17 | Apache-2.0 |
| [Prompt Studio](#prompt-studio) | `aigovops-foundation` | 2026-08-17 | see repo |

## Beacon

**Repo:** [aigovops-foundation/aigovops-beacon](https://github.com/aigovops-foundation/aigovops-beacon) · **Live:** <https://aigovops-foundation.github.io/aigovops-beacon/> · **Stack:** Python + JS

OVERT 1.0-conformant runtime signer: Ed25519 keys, JCS (RFC 8785) canonical receipts, append-only log, Merkle anchoring and an auditor bundle with VERIFY.md. The Pages home is a self-running browser demo that makes a key and a real bundle client-side. Seven services (server, agent, MCP, MCP-public, lab-service, Studio) plus scoring.

**Place in the practice:** Levels 100/300/400 · pre-pend, operate and audit gates. 'Beacon signs.'

- Profile `aigovops-beacon.v1` registration with Glacis is still pending (estate map).
- Canonical product repo; the monorepo's `products/beacon/` is a pointer to this repository.

## Umbrella-GovOps

**Repo:** [aigovops-foundation/umbrella-govops](https://github.com/aigovops-foundation/umbrella-govops) · **Live:** <https://aigovops-foundation.github.io/umbrella-govops/> · **Stack:** Python

The program layer. It compiles AI laws and standards into versioned controls keyed by Unified Control Identifiers (UCIDs), crosswalks NIST AI RMF, the EU AI Act, ISO/IEC 42001 and OECD, and binds Beacon receipts into an `EvidenceBundle`. Also holds the 41-item Policy-as-Code Vendor & Approach Checklist v3. CLI: `umbrella-conformance check | bundle | verify`.

**Place in the practice:** Levels 200/400 · policy and audit gates.

- Not on PyPI yet, so install from source.
- Its README still links Beacon at `bobrapp/aigovops-beacon` (the old location).

## Lantern

**Repo:** [aigovops-foundation/aigovops-lantern](https://github.com/aigovops-foundation/aigovops-lantern) · **Live:** <https://aigovops-foundation.github.io/aigovops-lantern/> · **Stack:** Python

'Beacon signs. Lantern reads.' Python CLI v0.1.1 with `lantern read`, `diff` and `explain` (UCID lookup against Umbrella's registry) and four role lenses: engineer, compliance, auditor and regulator. 103 tests, mkdocs site.

**Place in the practice:** All levels · audit gate (viewer); v0.3 GitHub Action planned for the policy gate.

- v0.2 web viewer (planned to become the public verify page) and v0.3 Action are open.

## aigovops — Open Source v4 (trunk)

**Repo:** [aigovops-foundation/aigovops](https://github.com/aigovops-foundation/aigovops) · **Live:** <https://aigovops-foundation.github.io/aigovops/> · **Stack:** Node (zero-dep)

The mono-repo trunk: a self-hostable governance stack (`aigovops up --tier 1` gives just the gate; tier 4 adds Caddy, Keycloak, OpenSearch and Prometheus), the Jeeves manager-agent, about 27 `packages/` (gate, cli, beacon, umbrella, lantern, sandbox, secrets, tenancy…) and `products/` pointers to the standalone repositories. 193 tests.

**Place in the practice:** Levels 200/300 · pre-pend and operate gates.

- `get.aigovops.org` installer and `@aigovops/*` npm packages are planned, not live.
- README 'Live site' still points to `bobrapp.github.io/Aigovops-Foundation-Open-Source-V4-10k`.

## One Receipt

**Repo:** [aigovops-foundation/One-ai-Receipt-aigovops-foundation](https://github.com/aigovops-foundation/One-ai-Receipt-aigovops-foundation) · **Stack:** Python (+TS types)

Incubation spec (v0.2-draft) for one signed, content-free receipt per AI transaction that anyone can verify offline. Includes a reference signer/verifier CLI, JSON Schemas, assurance levels OR-0 to OR-5, crosswalks to SCITT, OVERT, C2PA, OpenTelemetry and the EU AI Act, 12 test vectors from corpus cases, 360 traceable requirements, and a coalition/governance plan.

**Place in the practice:** Cross-cutting: `docs/ADOPTION.md` describes how every other Foundation project adopts it.


## REPLAY

**Repo:** [aigovops-foundation/aigovops-Replay](https://github.com/aigovops-foundation/aigovops-Replay) · **Stack:** TypeScript (pnpm) · **Status:** Archived

Hash-chained receipts for prompt/response pairs, with verify, one-click replay with output diff, JS-expression policies, and a dashboard. Express 5 + Postgres/Drizzle + React. Built on Replit.

**Place in the practice:** Audit gate.

- The estate map calls it the 'fourth receipt implementation'.

## Prompt Studio

**Repo:** [aigovops-foundation/aigovops-prompt-studio](https://github.com/aigovops-foundation/aigovops-prompt-studio) · **Stack:** TypeScript · **Status:** Archived

Prompt-engineering platform for governance work: wizard UI, version control, 2FA, immutable audit log. No README; the description comes from the repo and the bundled HTML.

**Place in the practice:** Policy gate (estate map: 'its audit log adopts the receipt; otherwise out of the ladder').

Generated from repo READMEs, estate.yaml and the GitHub API on 2026-10-10.
