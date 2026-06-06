# Control & Deployment Plan

The durable source for the Control Plane page (`docs/control-plane.html`). This is
the *plan* — the rendered page mirrors it. Live facts (chosen vendors, versions,
endpoints) belong in `HIBT.md`, dated; this file holds the architecture and the
reasoning.

> "Agents do the bureaucracy; humans hold the meaning — and humans hold the keys."

## 00 · The promise (five commitments, enforced in code)

1. **One artifact, three homes.** The same container runs on a lab laptop, the
   community cloud, and inside a customer firewall. Only a `PROFILE` changes.
2. **No agent acts except through the gate.** No ambient credentials, no shell, no
   network. The only output an agent can produce is a typed proposal. This is what
   makes "gone wild" structurally impossible.
3. **Propose, don't execute.** Anything irreversible pauses for a human. Capability
   is a reversible dial, not a blank cheque.
4. **Broker secrets, never hoard them.** No password lives in the platform or in an
   agent. A vault holds them; the gate issues short-lived, scoped tokens.
5. **The receipt is the unit of truth.** Every effect emits an append-only,
   Ed25519-signed record → total real-time visibility of effects + a break-glass halt.

## 01 · One artifact, three homes

Single image, single codebase, one `PROFILE` env var selecting everything else.

| Concern | Lab (laptop) | Community (cloud) | Enclave (firewall) |
|---|---|---|---|
| PROFILE | `lab` | `community` | `enclave` |
| Models | local (Ollama) | cloud, opt-in/action | local / approved internal |
| Datastore | SQLite + files | HA Postgres + buckets | Postgres in-VPC |
| Secrets | `.env` / keychain | cloud KMS/HSM | Vault in perimeter |
| Egress | none | allow-list | **deny-all except declared** |
| Capability ceiling | wide (yours) | narrow, public-safe | enclave owner sets |
| Cost | $0 forever | break-even (16% cloud) | customer-hosted |

The **enclave** profile (egress deny-all, internal models) is what wins regulated
customers and proves the no-lock-in claim: run it air-gapped, verify our ledgers
offline with `openssl`.

## 02 · The single chokepoint

Don't watch the agents — make the unsafe path impossible. An agent has no shell, no
network, no credentials, no filesystem beyond scratch. Its only way to affect the
world is a typed proposal to the gate, which (1) checks policy, (2) enforces caps,
(3) pauses if irreversible, (4) brokers a scoped token, (5) signs a receipt. Prompt
injection, a haywire model, or a bug can only produce a proposal the gate rejects.

## 03 · Agent safety, bullet-proof by construction

- **Yes-Gate is pure functions** — input → decision, no side effects; same logic
  client-side (preview) and server-side (record); exhaustively unit-testable.
- **Policy as code via Open Policy Agent (OPA)** — embeddable, local or in-cluster,
  reviewable in PRs.
- **Capability dial + hard caps** on spend, rate, blast radius. Agent *pauses at the
  cap*. Narrow by default; trust widens; one toggle narrows.
- **Sandboxed tools, least privilege, declared egress allow-list.** No ambient creds.
- **Kill switch + circuit breakers.** Effects are signed and reversible-by-design, so
  recovery is "Recover to Yes," not a forensic scramble.
- **Build-your-own-agent** inherits the same gates, caps, and signing.

## 04 · Credential & secrets control plane

**Firm rule: no password store, no agent-held credentials.** Keep an *inventory* of
every account; never take *custody* of plaintext.

- **Human credentials** → 1Password / Bitwarden (MFA, shared team vault). Source of
  truth for human logins.
- **Machine/agent secrets** → **HashiCorp Vault** (OSS, self-hostable, same in all
  three homes). On approval, the gate requests a short-lived, scoped token (minutes,
  one purpose), hands it to the sandboxed tool, and it auto-expires.
- **Config in git** → encrypted with **SOPS + age**; never plaintext, still
  version-controlled.
- **Account registry** → owner, scope, last-rotated, which agent may request which
  token. Full visibility, zero plaintext custody.
- **Rotation/revocation first-class** → rotate at the vault; derived tokens age out;
  revoke a capability and the next request fails closed.

## 05 · Real-time oversight — what "100%" means

Complete visibility of every **effect** (not prediction of a model's thoughts),
because every action flows through one gate and emits a signed receipt. Tail the
ledger over SSE → a live oversight console (proposals, decisions, token issuances,
cap state). "Control" = break-glass kill switch + caps that stop before damage.

**Oversight spectrum**, chosen per capability level:
- **In-the-loop** — human approves each action. Default. Required for irreversible.
- **On-the-loop** — human monitors a live feed, can interrupt. Reversible, capped,
  trusted actions.
- **Over-the-loop** — audit after the fact via the ledger. Low-risk, fully reversible.

Start paranoid; loosen deliberately, per capability, never globally. Kill switch
always live. Tradeoff stated plainly: full in-the-loop is safest but saves the least
labor; the dial earns autonomy one action at a time.

## 06 · Build order (from what exists today)

1. **Harden the chokepoint** in the shipped core — agents have no path but the gate;
   Yes-Gate is side-effect-free.
2. **Stand up the secrets broker** (Vault in `lab` first); prove one credential never
   leaves the vault; add the account registry.
3. **Build the oversight console** — live ledger tail (SSE) + break-glass switch.
4. **Adopt OPA** for policy-as-code.
5. **Ship the enclave profile** — egress deny-all, internal models; run-it-yourself,
   verify-offline.

## 07 · Honest boundaries — what we won't do

- No plaintext secret custody.
- No agent-held credentials.
- No autonomous irreversible action — quarantined into human-gated proposals,
  enforced in the runtime, not by prompt discipline.
- The irreversibility boundary holds for the builders too: tooling (incl. AI
  assistants) prepares and verifies; a human makes the irreversible clicks (DNS,
  registrar, key enrollment, account creation, deletion) after the risk is flagged.
- "100%" is about effects, not minds — total visibility/control of what agents *do*,
  stated without overclaiming.
