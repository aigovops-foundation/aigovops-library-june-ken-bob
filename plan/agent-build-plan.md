# Agent-Build Plan — how agents (with skills) build the Library, under the Library's own gate

> "Agents do the bureaucracy; humans hold the meaning — and humans hold the keys."

This is the bridge between the **vision** (`docs/`, `plan/00-overview.md`) and the
**backlog** (`plan/build-tickets.md`). It answers one question: *what is the best way to
have agents build the rest of this, using the skills, with automation that serves the
vision — without ever crossing the irreversibility boundary?*

It is a proposal for Bob and Ken to argue with. Live facts (assignees, dates) belong in
the tracker; this file holds the *what* and the *why-now*.

## Where we actually are (honest baseline, 2026-06)

The safety machinery is **real and tested**, not aspirational:

- **Beacon** ledger — Ed25519 receipts, hash-chained, metadata-only, `verifyLedger()`.
- **Yes-Gate** — propose → human-approve → caps → broker → linked receipts (`gate.js`).
- **SecretsProvider / FileProvider** — mint → scope → expire → log → revoke.
- **Capability caps** — level/spend/rate/blast, pause-at-cap, breach receipts.
- **Sandbox v1** — process isolation, fs/egress guards (laptop-grade; gVisor still to come).

That is **Tickets 0, 1, 3, 5 done** — milestones *first brokered action* and *first
sandboxed useful agent* reached. The tests (24, `node --test`) are the proof.

But three honest gaps block "agents build this with skills":

1. **The core is not reachable as a governed API.** `server.js` exposes only demo-grade
   `ask`/`assess`/`propose`. The gate, broker, caps and sandbox live in tests and
   `pulse.mjs` — **an external agent cannot transact through the safety machinery.** The
   agent runtime, router, and identity are stubs.
2. **Skills are specs, not executables.** The 11 `SKILL.md` files share a clean, parseable
   schema, but only three name a real command (`framework-map`, `beacon-sign-evidence`,
   `op-github-deploy`). The rest are well-structured procedures with no entrypoint, no
   input schema, no runner. Three skills named by processes have no `SKILL.md` at all
   (`cloud-mary-testing`, `aigovops-deploy-workflow`, `github-pages-publish`).
3. **The build itself is not yet governed by the runtime.** The system promises every
   effect is gated and receipted, but building the system is currently governed by prompt
   discipline (`CLAUDE.md`), not by the gate/ledger it ships.

## The strategy: dogfood — the Library builds the Library, under its own Yes-Gate

The highest-leverage, most vision-true move is to make **the act of building** the first
real demonstration of the operating model. An agent that adds Ticket N does so by
*proposing* through the gate, running its tools *sandboxed*, and leaving a *signed receipt* —
exactly what a member's agent will later do. The build ledger becomes the first real ledger.

This needs two enabler layers (specced as tickets A1/A2 in `build-tickets.md`), then the
existing backlog flows through them.

### Phase 0 — Enablers (build first; they unlock everything)

- **A1 · Skill-runner + registry.** One harness that parses any `SKILL.md` (the schema is
  already uniform), resolves its declared core function/command, **enforces the declared
  human gate**, and emits the Beacon receipt the skill specifies. Promote the three runnable
  skills to the reference implementation; give every skill an `inputs`/`outputs` schema and a
  `run` entrypoint. *A prototype against the three runnable skills already exists at
  `core/scripts/run-skill.mjs` — the proof that the contract is executable.*
- **A2 · Governed agent API / MCP.** Expose the real loop — `propose → human-decide →
  broker scoped token → run sandboxed tool → verify` — over HTTP **and as an MCP server**,
  so any agent (including Claude Code) can build *through* the gate, producing receipts.
  This is the single most important thing to build.
- **Two correctness prerequisites:** **T10** (RFC 8785 JCS canonicalizer — today's
  `canonicalize()` is a flagged stand-in, so receipts aren't yet cross-verifiable) and a
  **unified capability vocabulary** (`identity.js` uses `read/propose/auto`; `caps.js` uses
  `read/propose/act/auto` — reconcile to one).

### Phase 1 — "First watchable system" (before widening agent autonomy)

- **T8 (identity/OIDC + roles)**, then **T6 (role-scoped oversight console + kill switch).**
  Rationale: if agents are about to do more building, the watch-and-halt surface must exist
  *first*. Stewards see all + the armed kill switch; members see only their own effects.

### Phase 2 — Parallelizable depth

- **T7 (OPA)** — has a reference oracle (`yesgate.shared.js`) to diff against.
- **T2 (VaultProvider)** — contract tests already exist from T0.
- **T4 (gVisor + egress proxy)** — closes the documented sandbox-v1 bypass.

### Phase 3 — "First enclave-ready release"

- **T9 (enclave hardening, SBOM, signed releases)** — gated by T2 + T4 + T10. Key/release
  steps are **human-click** items per the irreversibility boundary.

## Which agent builds what (the model demonstrates itself)

The named agents (`plan/agents.md`) map onto the build work, so building the Library *is* a
run of the operating model:

| Agent | Role in the build |
|---|---|
| **Maker** | Designs & implements the feature/ticket. |
| **Cloud-Mary** | Runs unit → e2e → scale → chaos; red blocks the merge. |
| **Guardian** | Secret/PII scan + threat recheck before anything is exposed. |
| **Beacon** | Signs the receipt for every build step (the build ledger). |
| **Sentinel** | Watches the running core during/after the change; cap-and-pause. |
| **Herald** | Reports progress from signed receipts only (extends `pulse.html`). |
| **Deploy** | Prepares branch → tests → PR; **Bob/Ken make the irreversible merge.** |

**Reconciling the direct-to-main convention:** this repo ships direct-to-main for *human*
edits, but **agent contributions go through branch + PR + a required Beacon receipt**, so a
human still makes the merge click and the change carries its own evidence.

## Automation to create

- **Skill-runner CLI + registry** (A1) and the **governed MCP/API** (A2) — above.
- **A "governance gate" CI check:** an agent-authored PR must carry a valid Beacon receipt
  *and* green Cloud-Mary tiers before a human can merge.
- **Wire the prose skills to real tools as CI:** accessibility-audit → axe/pa11y;
  security-privacy-review → a secret/PII scanner; so those processes become executable, not
  aspirational.
- **Extend `pulse.html` into a build ledger** showing which tickets agents built, with
  receipts — provenance the founders can read at a glance.

## Guardrails that never bend

- **The irreversibility boundary holds.** Agents *propose*; humans (Bob/Ken) make every
  irreversible move — commit/merge to `main`, DNS/registrar, account/key creation, deletion,
  access-control changes. When an agent reaches such a step it stops, shows exactly what it
  would do, and asks (`CLAUDE.md`).
- **Start in-the-loop; loosen per-capability, never globally.** The capability dial is
  reversible and starts paranoid.
- **Metadata-only receipts.** No payloads, prompts, or PII in the ledger — ever.

## The recommended first move

Recommended sequence:

1. **Unify the capability vocabulary** (`identity.js` ↔ `caps.js`) — small, removes
   ambiguity A2 and the oversight console would otherwise inherit. *(Done 2026-06.)*
2. **T10 — RFC 8785 JCS canonicalizer** — built **directly, not through the loop**: it
   changes the canonicalization every signature depends on, so it must be stable *before*
   we accrue a build ledger we intend to trust (building a signer-affecting change through
   the signing loop would be circular). Lowest-risk ticket: public test vectors,
   `openssl`-verifiable. *(Canonicalizer + vectors done 2026-06; the signed-evidence bundle
   export half of T10 remains.)*
3. **A1 (skill-runner) + a thin A2 (governed MCP/API)** — the unlock that lets an agent
   transact through the gate. *(A1 prototype done; A2 next.)*
4. **Prove the loop** by having an agent build the *next* small slice **through A2**,
   emitting receipts — the real "agents build the Library, under the Library's own Yes-Gate"
   milestone. (Not T10 — see step 2.)

See `plan/build-tickets.md` (tickets **A1**, **A2**) for the specs.
