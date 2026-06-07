# Build Tickets — Control Plane

The engineering backlog that turns the **Rev 2026.06 decisions** into running code,
ordered. **Ticket 0** is fully specified (the first slice); **items 1–10** are the next
big rocks, each with its slice, why-now, dependency, and done-criterion.

Sizes: **S** (≤1 day) · **M** (a few days) · **L** (1–2 weeks). These are a starting point
for you and Ken to argue with — live facts (assignees, dates) belong in the tracker; this
file holds the *what* and the *why-now*.

> Principle: define the safety contract once at the interface; enforce it with the
> strongest backend each environment allows; scope every view by identity.

---

## Ticket 0 — `SecretsProvider` interface + FileProvider · M · no deps

The smallest slice that proves the whole brokering pattern end-to-end
(**mint → scope → expire → log → revoke**) without standing up Vault. Everything else
plugs into it.

### The interface (env-neutral, lives in `core`, like `yesgate.shared.js`)

```
SecretsProvider {
  issue(scope, ttlSeconds, requestedBy) -> Grant
  renew(grantId, ttlSeconds)            -> Grant
  revoke(grantId)                       -> { revoked: true }
  describe(ref)                         -> Record    // registry view — NO secret material
}

Grant  = { grantId, scope, token, issuedAt, expiresAt, ref }
Record = { ref, owner, scope, lastRotated, activeGrants }
```

- `token` is an opaque, short-lived credential the gate hands to a sandboxed tool. It is
  **never** the underlying master secret.
- The **gate is the only caller**. Tools receive a `token`, present it back to use a secret
  against a target, and never see master material.

### FileProvider behavior (the `lab` adapter)

- Backing store: `secrets.local.json` or OS keychain — **gitignored, never committed**.
- `issue`: look up the static secret for `scope`, mint a derived ephemeral `token` (random
  opaque id) with `expiresAt = now + ttl`, record the grant, return the `Grant`.
- TTL is enforced: using a token past `expiresAt` **fails closed**.
- `revoke`: invalidate a grant immediately (next use fails closed).
- Every `issue` / `renew` / `revoke` emits **exactly one signed Beacon receipt** —
  metadata only: `{ op, scope, ttl, expiresAt, ref, requestedBy, decision }`. No secret.

### Acceptance tests (all must pass)

- `token !== masterSecret` for the scope.
- a token used after `expiresAt` fails closed.
- `revoke(grantId)` makes the token fail closed immediately.
- each op emits exactly one ledger receipt, and the serialized receipt contains **no**
  secret string (assert the master value is absent).
- `describe()` returns owner/scope/rotation metadata and **no** secret material.
- the backing secret file is in `.gitignore` and absent from `git ls-files`.

### Done when

FileProvider passes the contract tests, the gate can `issue`/`revoke` through the
interface, and every op appears in the live ledger with zero secret leakage.

### Status — ✅ implemented (2026-06-06)

- Contract: `core/src/core/secrets.shared.js` (env-neutral, like `yesgate.shared.js`).
- Lab adapter: `core/src/core/secrets.fileprovider.js` (mint → scope → expire → log →
  revoke; backing store `secrets.local.json`, gitignored; example at
  `core/secrets.local.example.json`).
- Receipts: each op emits one metadata-only Beacon receipt via a new optional `detail`
  block in `beacon.js` (no secret material; ledger path made test-isolatable).
- Tests: `core/test/secrets.test.mjs` — all 6 acceptance checks pass under `node --test`
  (CI `core-tests`). Next: **Ticket 1** wires the gate to this provider.

---

## The next 10 big items

Contract tags: **[SEC]** secrets · **[BOX]** sandbox · **[GATE]** policy/caps ·
**[SEE]** oversight · **[ID]** identity · **[CORE]** evidence.

1. **Gate ↔ SecretsProvider wiring** · M · [SEC][GATE] · dep: T0.
   The gate requests a grant only on an *approved* proposal; the deny path issues nothing
   and fails closed; the secret receipt links to the proposal receipt.
   *Done:* an approved tool call gets a scoped token + paired receipts; a denied one gets
   neither.
   **Status — ✅ implemented (2026-06-06):** `core/src/core/gate.js` (`decide` /
   `proposeAndDecide`) records the human decision as a signed proposal receipt and, only on
   approval, brokers a scoped grant whose secret receipt carries `parent =
   receiptId(proposal)` (new `beacon.receiptId`). Deny issues nothing; an unknown scope
   fails closed. Tests: `core/test/gate.test.mjs` (5 checks) pass under CI `core-tests`.
   **This reaches the "first brokered action" milestone (T0 + T1).** Next: **Ticket 5**
   (capability dial + caps) or **Ticket 2** (VaultProvider).

2. **VaultProvider adapter** · L · [SEC] · dep: T0.
   The same interface against HashiCorp Vault (dynamic-secrets engine for true ephemeral
   creds; auto-unseal via cloud KMS). FileProvider↔VaultProvider is **config-only**
   (`PROFILE`).
   *Done:* the *identical* contract tests pass against both; swapping providers needs no
   code change.

3. **Sandbox boundary v1 (laptop fallback)** · L · [BOX] · dep: none (parallel to SEC).
   Define the Sandbox contract (no ambient network/filesystem, declared egress only) and a
   tool-runner that executes agent tools inside a locked container: seccomp default profile
   + network namespace + read-only rootfs.
   *Done:* a tool cannot open an undeclared socket or read outside its scratch dir;
   attempts fail and emit a receipt.

4. **gVisor backend + egress proxy** · L · [BOX] · dep: T3.
   Wire `runsc` as the runtime class on Linux community/enclave hosts; route declared egress
   through a controlled proxy enforcing the allow-list.
   *Done:* the same Sandbox contract tests pass under gVisor; undeclared egress is blocked
   at the proxy.

5. **Capability dial + hard caps** · M · [GATE] · dep: T1.
   Explicit, reversible capability levels per member/agent; hard caps on spend, request
   rate, and blast radius, evaluated at the gate. The agent **pauses at the cap**; a breach
   emits a receipt.
   *Done:* an agent at its cap halts instead of proceeding; turning the dial down takes
   effect on the next request.

6. **Oversight console v1 (one surface, role-scoped)** · L · [SEE][ID] · dep: T1, T5.
   Live SSE tail over the ledger. Stewards see all receipts + dials + the armed global kill
   switch; members see only their own effects and pause only their own work. The global kill
   switch is a steward-only action that emits its own signed receipt.
   *Done:* two roles, one codebase, correct scoping; the kill switch halts running
   workflows.

7. **OPA policy engine** · L · [GATE] · dep: T1.
   Move Yes-Gate rules to OPA (rego), evaluated at the gate; policies reviewable in PRs;
   policy bundles are Beacon-signed so a rule change is itself an auditable artifact.
   *Done:* existing gate decisions reproduce under OPA; a policy change ships as a signed
   bundle.

8. **Identity + roles (OIDC)** · M · [ID] · dep: none (enables T6).
   Library-Card membership, OIDC auth, roles mapping to the capability dial *and* to
   oversight visibility scope.
   *Done:* a member logs in, gets a role, and sees exactly their scoped view; a steward sees
   the full view.

9. **Enclave profile hardening** · L · [BOX][SEC][CORE] · dep: T2, T4.
   Egress deny-all, internal-models-only, in-VPC Postgres, Vault in perimeter. Ship the
   "run-it-yourself, verify-offline" package: SBOM, signed releases, published verification
   keys, setup docs.
   *Done:* a fresh enclave install runs air-gapped and verifies our ledgers offline with
   `openssl`.

10. **RFC 8785 JCS canonicalizer + signed evidence export** · M · [CORE] · dep: none.
    Swap the simplified canonicalizer in Beacon for full RFC 8785 (JCS); add verifiable
    bundle export so an auditor can take the whole history and check it offline.
    *Done:* canonicalization matches the RFC test vectors; an exported bundle verifies with
    `openssl` and a published public key.

---

## Milestones

- **First brokered action** — T0 + T1: an agent does one real, scoped, expiring,
  fully-receipted thing.
- **First sandboxed useful agent** — + T3 + T5: a tool runs isolated, under caps, with a
  brokered credential, leaving a signed receipt. *This is where agents start saving real
  work.*
- **First watchable system** — + T6 + T8: you and Ken watch live and can halt.
- **First enclave-ready release** — + T2 + T4 + T9 + T10: a regulated org runs it themselves
  and verifies us offline.
