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
   **Status — ✅ implemented (2026-06-14):** `core/src/core/secrets.vaultprovider.js` mints
   short-lived **child tokens** scoped by a per-scope policy (`auth/token/create`), revokes
   by accessor, and reuses the exact `secrets.shared.js` fail-closed + receipt semantics —
   so it stays synchronous and the gate/govapi/tools are unchanged. Backend swap is
   config-only via `core/src/core/secrets.factory.js` (`SECRETS_PROFILE` lab→File,
   community/enclave→Vault). The contract is written once in
   `core/test/secrets-contract.shared.mjs` and run against **both** providers in
   `core/test/secrets.contract.test.mjs` (6 checks × 2 = 12), plus
   `core/test/secrets.factory.test.mjs` (5). The Vault tests use an in-process fake
   transport; a live Vault is the same class with `VAULT_ADDR`/`VAULT_TOKEN` and the default
   dependency-free `curl` transport. **Blocker for live verification here:** no Vault server
   on this macOS host — wire `VAULT_ADDR`/`VAULT_TOKEN` in an enclave to exercise the real
   API. Next: **Ticket 9** (enclave) consumes this via `PROFILE=enclave`.

3. **Sandbox boundary v1 (laptop fallback)** · L · [BOX] · dep: none (parallel to SEC).
   Define the Sandbox contract (no ambient network/filesystem, declared egress only) and a
   tool-runner that executes agent tools inside a locked container: seccomp default profile
   + network namespace + read-only rootfs.
   *Done:* a tool cannot open an undeclared socket or read outside its scratch dir;
   attempts fail and emit a receipt.
   **Status — ✅ implemented (2026-06-06):** `core/src/core/sandbox.shared.js` (env-neutral
   contract); `core/src/core/sandbox.process.js` (ProcessSandbox: per-run scratch dir,
   fs path-guarding, net egress allow-list, child_process blocked, credential-stripped env,
   hard timeout; application-level enforcement via module patching in a child process).
   Tests: `core/test/sandbox.test.mjs` (4 checks) pass under CI. Known v1 limitation:
   named ESM imports bypass the application-level patch; kernel-level enforcement (gVisor,
   Ticket 4) has no such bypass. **Combined with T0 + T1 + T5, this reaches the "first
   sandboxed useful agent" milestone.**

4. **gVisor backend + egress proxy** · L · [BOX] · dep: T3.
   Wire `runsc` as the runtime class on Linux community/enclave hosts; route declared egress
   through a controlled proxy enforcing the allow-list.
   *Done:* the same Sandbox contract tests pass under gVisor; undeclared egress is blocked
   at the proxy.
   **Status — ✅ egress proxy implemented + verified; gVisor runtime behind detection
   (2026-06-14):** `core/src/core/egress-proxy.js` is a dependency-free forward proxy
   (CONNECT tunnels + plain-HTTP) that permits ONLY declared `host:port` pairs and blocks
   everything else at the boundary with a signed receipt — fully runnable and verified by
   `core/test/egress-proxy.test.mjs` (4 checks: allowed tunnel carries bytes, disallowed
   CONNECT → 403 + receipt, disallowed HTTP → 403, wildcard). `core/src/core/sandbox.gvisor.js`
   implements the SAME Sandbox contract via `docker run --runtime=runsc` with read-only
   rootfs, `--cap-drop=ALL`, a dedicated egress network, and the guest forced through the
   proxy (`HTTPS_PROXY`); `buildRunArgs()` is pure and its security flags are asserted in
   `core/test/sandbox.gvisor.test.mjs`. `core/src/core/sandbox.factory.js` selects gVisor when
   `runsc` is usable and **falls back to ProcessSandbox** otherwise (`SANDBOX_BACKEND`).
   **Blocker:** gVisor/`runsc` is Linux-only and this host is macOS with no Docker, so the
   kernel-enforced *run* path can't execute here — it fails closed (`gvisor-unavailable`) and
   the factory falls back. Verify the live run on a Linux enclave host (Ticket 9).

5. **Capability dial + hard caps** · M · [GATE] · dep: T1.
   Explicit, reversible capability levels per member/agent; hard caps on spend, request
   rate, and blast radius, evaluated at the gate. The agent **pauses at the cap**; a breach
   emits a receipt.
   *Done:* an agent at its cap halts instead of proceeding; turning the dial down takes
   effect on the next request.
   **Status — ✅ implemented (2026-06-06):** `core/src/core/caps.js` (capability levels
   `read→propose→act→auto`, hard caps on spend/rate/blast, in-memory usage tracking);
   `gate.js` evaluates caps after human approval but before brokering — the agent pauses,
   a breach receipt is emitted, and the dial is immediately effective. Tests:
   `core/test/caps.test.mjs` (6 checks) pass under CI `core-tests`. Combined with T0 + T1,
   this is one ticket from the **"first sandboxed useful agent"** milestone (needs T3:
   sandbox boundary).

6. **Oversight console v1 (one surface, role-scoped)** · L · [SEE][ID] · dep: T1, T5.
   Live SSE tail over the ledger. Stewards see all receipts + dials + the armed global kill
   switch; members see only their own effects and pause only their own work. The global kill
   switch is a steward-only action that emits its own signed receipt.
   *Done:* two roles, one codebase, correct scoping; the kill switch halts running
   workflows.
   **Status — core landed (2026-06):** `core/src/core/oversight.js` (`ledgerView` role-scoped:
   steward→all, member→own; `canKill` steward-only) + `govapi.oversight(identity)`
   (`view`/`kill`/`status`); kill emits a signed receipt and fails new work closed. Read-only
   `oversight_view` MCP tool. Tests: `core/test/oversight.test.mjs`.
   **Status — ✅ live console completed (2026-06-14):** `server.js` serves a role-scoped SSE
   tail (`/api/oversight/stream`, steward→all / member→own) now carrying the `halted` flag,
   plus a **steward-only kill switch** over HTTP (`POST /api/oversight/kill` / `/resume`)
   that arms `gov.oversight(id).kill()` — halting the in-flight loop (propose/decide/runTool
   fail closed) and emitting its own signed receipt. `console.html` subscribes via
   `EventSource`, renders the live ledger, and drives kill/resume with state reflected live.
   Verified in `core/test/server.test.mjs` (unauth kill → 401; steward kill → halted; propose
   refused while halted; resume restores the loop). Two roles, one codebase, correct scoping;
   the kill switch halts running workflows. **T6 done.**

7. **OPA policy engine** · L · [GATE] · dep: T1.
   Move Yes-Gate rules to OPA (rego), evaluated at the gate; policies reviewable in PRs;
   policy bundles are Beacon-signed so a rule change is itself an auditable artifact.
   *Done:* existing gate decisions reproduce under OPA; a policy change ships as a signed
   bundle.
   **Status — ✅ seam implemented + verified; live `opa` behind detection (2026-06-14):**
   `core/src/core/policy-engine.js` defines a `PolicyEngine` interface with `JsPolicyEngine`
   (the rule in dependency-free JS — the SAME verb list `agent.propose()` uses) and
   `OpaPolicyEngine` (shells to `opa eval`; pure `buildOpaArgs`; injectable transport).
   `core/policy/aigov.rego` encodes the identical rule (`data.aigov.gate.decision`).
   `core/src/core/policy-bundle.js` hashes the rego and emits ONE Beacon-signed bundle
   receipt (`kind=policy, action=bundle`) so a policy change is auditable; `verifyBundle()`
   lets an auditor recompute + match. `gate.proposeAndDecide({ policy })` now takes the
   human-gate/required-level decision from the engine when supplied (default behavior
   unchanged). Tests: `policy-engine.test.mjs` (JS reproduces `agent.propose`; OPA marshalling
   matches JS via a fake transport; fails closed without the binary) + `policy-bundle.test.mjs`
   (one verifiable receipt; tamper detected) + a gate test. **Blocker:** no `opa` binary on
   this host, so the real-rego parity test is skipped (1 skipped) — install `opa` in CI/enclave
   to run it. `POLICY_ENGINE=js|opa|auto`.

8. **Identity + roles (OIDC)** · M · [ID] · dep: none (enables T6).
   Library-Card membership, OIDC auth, roles mapping to the capability dial *and* to
   oversight visibility scope.
   *Done:* a member logs in, gets a role, and sees exactly their scoped view; a steward sees
   the full view.
   **Status — static core landed (2026-06):** `identity.js` has `ROLES`
   (steward→auto/see-all, member→propose/see-own), `identify()`, and a `resolveIdentity()`
   OIDC seam; capability levels unified with the caps dial. Tests:
   `core/test/identity.test.mjs`.
   **Status — ✅ OIDC implemented + verified (2026-06-14):** `core/src/core/oidc.js` is a
   provider-agnostic OIDC client (dependency-free): discovery, JWKS, PKCE, and full
   **id_token verification** (signature via JWKS using `node:crypto`; `iss`/`aud`/`exp`/`nbf`/
   `nonce` checks; RS256/384/512 + ES256/384/512). `identity.identityFromClaims()` maps
   verified claims → role → the capability dial (steward=auto/see-all, member=propose/see-own);
   role is asserted only by the id_token's groups/roles or the `STEWARDS` list, never
   client-supplied. `auth.js` adds `completeOidcLogin()` (code exchange → verify → signed
   session); `server.js` serves `/auth/oidc/login` + `/auth/oidc/callback`.
   **IdP decision (made):** default **Keycloak** (self-hostable, fits the enclave
   verify-offline principle); **Auth0/Okta/Entra/Google** work via the same `OIDC_*` vars;
   GitHub OAuth stays as the lightweight hub default. Verified end-to-end in
   `core/test/oidc.test.mjs` (locally-generated keypair signs an id_token; a fake IdP via
   injected fetch drives discovery/JWKS/token; tamper, wrong iss/aud, expiry, and nonce-replay
   all rejected; role mapping correct). **Blocker:** a real IdP tenant is the operator's
   irreversible credential step — set the `OIDC_*` vars to go live. Enables **A2** real roles.

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
    **Status — ✅ implemented (2026-06):** canonicalizer is RFC 8785 (`beacon.js` +
    `core/test/canonicalize.test.mjs` vectors). `core/scripts/export-evidence.mjs`
    (`npm run export:evidence`) writes a self-contained bundle: `public-key.pem`, per-entry
    canonical bytes + raw Ed25519 sig + chain `prev`, `MANIFEST.json`, and **two offline
    verifiers** — `verify.sh` (OpenSSL 3.x) and `verify.mjs` (Node, anywhere). Tests:
    `core/test/export-evidence.test.mjs` (node-crypto + chain + tamper + openssl-if-present).
    Note: macOS LibreSSL lacks Ed25519, so `verify.sh` detects that and points to `verify.mjs`.

---

## Agent-build era — enabler tickets

These two tickets make the system **self-hosting**: they let agents build the rest of the
backlog *through the core's own Yes-Gate*, leaving a signed receipt for every step. See
`plan/agent-build-plan.md` for the full rationale and phasing.

### A1 — Skill-runner + registry · M · dep: none (uses existing core)

One harness that turns the uniform `SKILL.md` contract into something an agent (or a human)
can actually *run*, with the human gate and the receipt enforced by the runtime — not by
prose discipline.

- **Registry:** scan `plan/skills/*/SKILL.md`, parse the frontmatter (`name`,
  `description`) and the fixed body sections (`Owning agent`, `Inputs`, `Procedure`,
  `Human gate`, `Evidence`). Expose `list()` and `get(name)`.
- **Runner:** `run(name, input, { approve })` resolves the skill's declared core
  function/command, executes it, and — per the skill's `Evidence` section — emits exactly
  one metadata-only Beacon receipt (`action=<skill>`, `contentHash` only, never payload).
- **Human gate is enforced, not described:** any skill whose `Human gate` is non-empty
  refuses to run side-effecting steps without explicit `approve` (or an interactive
  confirm). `op-github-deploy` and any irreversible skill **never auto-execute** — the
  runner prints the procedure and stops at the boundary.
- **Schema upgrade:** add an optional `inputs`/`outputs` JSON-schema and a `run:` entry
  (core function or command) to each `SKILL.md` so dispatch is generic, not special-cased.

**Acceptance tests**
- `list()` returns all skills; `get('framework-map')` parses every section.
- `run('framework-map', text)` returns the risk/gates and appends **one** receipt
  (`action=framework-map`); `verifyLedger()` stays valid.
- `run('beacon-sign-evidence', meta)` appends one receipt and chains `prev`.
- `run('op-github-deploy', …)` **without** `approve` performs no git/network action and
  exits at the human gate; the serialized receipt contains no secret.
- a skill with a non-empty `Human gate` cannot side-effect without `approve`.

**Done when** the three runnable skills run through one harness with receipts, and a new
skill becomes runnable by adding a `run:` line — no runner code change.
*Status — landed: `core/scripts/run-skill.mjs` (+ `core/test/run-skill.test.mjs`) runs
skills through the gate+ledger. **7 of 12 skills are now runnable** — framework-map,
beacon-sign-evidence, op-github-deploy, security-privacy-review (`scanners.js`),
accessibility-audit (`a11y.js`, static WCAG subset), status-report and monitor-and-alert
(`reports.js`, ledger-derived). The remaining 5 (design-system-apply, ux-flow-spec,
ua-help-authoring, doc-generate, translate-and-sign) are generative authoring skills the
agent performs through the loop, not tool-wirable.
**Update — ✅ generic dispatch landed (2026-06-14):** every `SKILL.md` now declares a
`run:` line (`handler:<key>` for the 7 wired skills, `core:<module>#<fn>` for generic
dispatch, `prose` for the 5 authoring skills) plus single-line JSON `inputs`/`outputs`
schemas. `run-skill.mjs` dispatches generically: a `core:` skill runs through a synchronous
invoker over pre-loaded core modules with declared-schema input validation (dependency-free
subset validator), and `SKILLS_DIR` is overridable — so **a new skill becomes runnable by
adding a `run:` line with no runner code change**, proven in
`core/test/run-skill-generic.test.mjs` (register a fresh `gate-evaluate` skill in a temp dir;
it lists, runs, emits one receipt, and enforces its schema). The 7 bespoke handlers are
unchanged (back-compat). **Deferred (documented):** full WCAG via axe-core/pa11y is held out
on purpose — it would add npm deps and break the dependency-free guarantee; the static WCAG
subset stays. Wire axe/pa11y only in an opt-in profile.*

### A2 — Governed agent API / MCP · L · dep: A1, T1, T3, T5

Expose the **whole governed loop** — `propose → human-decide → broker scoped token → run
sandboxed tool → verify` — over HTTP **and** as an MCP server, so any external agent
(including Claude Code) can build *through* the gate. Today `server.js` exposes only
demo-grade `ask`/`assess`/`propose`; the gate/broker/caps/sandbox are unreachable remotely.

- **Endpoints / MCP tools:** `propose(proposal)`, `decide(proposalId, approve|deny)` (human),
  `broker(grantReq)` (gate-only), `runTool(toolReq)` (sandboxed), `verify()`,
  `skills.list/run` (wraps A1). Each maps onto existing `gate.js` / `caps.js` /
  `sandbox.process.js` / `secrets.fileprovider.js` — no new safety logic, just exposure.
- **Identity-scoped:** every call carries an identity; caps and oversight visibility apply
  (depends on T8 for real roles; anon stub until then).
- **Irreversibility boundary in the protocol:** any proposal flagged irreversible **pauses**
  for a human `decide` and can never be auto-approved; the kill switch (T6) halts in-flight
  work.

**Acceptance tests**
- an agent can drive an end-to-end loop over the API and the ledger shows the paired
  proposal + brokered-secret + tool-run receipts, chain intact.
- a denied proposal brokers nothing and runs no tool (fails closed).
- an over-cap call pauses with a breach receipt.
- the MCP server lists `skills.*` and a client can run `framework-map` and read the receipt.

**Done when** Claude Code (or any MCP client) can build a backlog ticket through the gate,
and the build leaves a verifiable receipt trail — the self-hosting loop.

*Status — thin slice landed (2026-06):* `core/src/core/govapi.js` exposes the loop
(`propose → decide → runTool → verify` + `skills.list/run`); brokering stays inside
`decide()` (no agent-callable broker, by design). A dependency-free MCP stdio server,
`core/scripts/mcp-server.mjs`, advertises the tools `gov_propose / gov_decide /
gov_run_tool / gov_verify / skills_list / skills_run`. Tests: `core/test/govapi.test.mjs`
(5 — end-to-end, deny fails closed, over-cap breach, skills, kill switch) and
`core/test/mcp-server.test.mjs` (handshake + tools/list + tools/call). HTTP exposure
landed too: `server.js` serves `/api/skills`, `/api/gov/{propose,decide,run}`,
`/api/oversight`, and an interactive **Control Room** at `/console`
(`core/public/console.html`); tested by `core/test/server.test.mjs`. Deploy: root
`Dockerfile` (+ `plan/`), `core/compose.yml`, `fly.toml`, and `DEPLOY.md`.
**Remaining:** real identity/roles (T8 OIDC) instead of the anon stub.

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
