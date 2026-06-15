# Scale Architecture — running AiGovOps as a workflow + management system for 100k

This maps the **top-10 improvements** to what's now in the repo (shipped, tested,
automated, deployable) versus what's the next build, plus the cross-cutting
**1Password secret flow** and the **deploy topology** — and exactly what still
needs Bob's irreversible credential/ops steps.

> Principle held throughout: the *core* stays dependency-free by default; scale
> backends (Postgres, Redis, Vault, …) are opt-in; every credential lives in
> 1Password; the irreversible moves (accounts, provisioning, DNS) are the human's.

## Cross-cutting foundations (shipped this pass)

- **1Password secret storage** — `core/src/core/op.js` (op:// bridge) +
  `secrets.onepassword.js` (`SECRETS_PROFILE=1password`: API keys live in a
  1Password vault, brokered as scoped tokens) + boot-time `op://` resolution for
  every backend credential. Template: `deploy/.env.1password.tmpl`.
- **Deploy stack as code** — `deploy/docker-compose.yml` (core, postgres, redis,
  vault, keycloak, opa, prometheus, grafana) + `deploy/bootstrap.sh` (automated,
  idempotent, secrets from 1Password) + CI validation. Runbook: `deploy/README.md`.
- **Observability** — `/metrics` (Prometheus), `/livez`, `/readyz` + Prometheus/
  Grafana wiring.
- **Shared-state seam** — `statestore.js` (Memory default, Redis opt-in) +
  distributed `ratelimit.js`.

## The 10, by status

| # | Improvement | Status | What's in the repo |
|---|-------------|--------|--------------------|
| 1 | Horizontal scale (externalize state) | 🟡 **foundation shipped** | `statestore.js` + `ratelimit.js` make the rate limiter multi-instance; durable ledger is N2 (Postgres). **Next:** migrate `govapi` pending/grants + `caps` usage + `halted` from per-process Maps to the store (interfaces ready). |
| 2 | Workflow engine (multi-step, SLAs) | ⬜ **next build** | The governed loop (propose→decide→run) is the step primitive. **Next:** a durable workflow/task model on the ledger with states, assignment, SLA timers, escalation, resumability. |
| 3 | Review queue at scale (routing/bulk) | 🟡 **partial** | `/api/gov/pending` queue + the caps dial exist. **Next:** routing rules, assignment, bulk actions, SLA clock, search-backed filtering. |
| 4 | RBAC hierarchy + orgs/teams | 🟡 **partial** | `member-caps.js` is the per-member dial; `identity.js` roles. **Next:** org/team model, delegated admin, reviewer/auditor/regional-steward roles, member lifecycle. |
| 5 | Observability + SLOs | ✅ **shipped** | `/metrics` + `/livez` + `/readyz`; Prometheus + Grafana in the stack. **Next:** alert rules + dashboards JSON + tracing. |
| 6 | Distributed rate-limit + abuse | 🟡 **partial** | `ratelimit.js` is store-backed (cluster-wide). **Next:** per-identity quotas tied to caps, Sybil/abuse checks on signup + proposals. |
| 7 | Notifications + async comms | ⬜ **next build** | Drift/regression signals exist (`attest.mjs`). **Next:** an email/web-push/in-app notifier with digests + preferences. |
| 8 | Search + indexing | ⬜ **next build** | Ledger + members are queryable linearly today. **Next:** Postgres FTS (or OpenSearch) indexes over receipts/members/skills/frameworks. |
| 9 | Ledger scalability (checkpoints) | ⬜ **next build** | `verifyLedger()` is O(n) — fine to ~10⁵, not 10⁷. **Next:** periodic signed Merkle/checkpoint anchors + segmented/partial verification + retention/archival. |
| 10 | KMS + data lifecycle (DSAR, i18n, a11y) | 🟡 **partial** | Beacon keys can come from 1Password (`BEACON_*_PEM` as `op://`); i18n `en`/`es`. **Next:** KMS/HSM + key rotation with multi-key verify, automated GDPR/DPDP DSAR, residency, full WCAG. |

## How a request scales (target topology)

```
            ┌─ Prometheus ─ Grafana            (#5 observability)
            │
client ─ LB ─┬─ core (N replicas, stateless) ──┬─ Postgres   (ledger + state, N2/#1)
            │   • op:// secrets from 1Password   ├─ Redis      (shared state + rate limit, #1/#6)
            │   • /livez /readyz /metrics        ├─ Vault      (broker backend, T2)
            │                                    ├─ Keycloak   (OIDC, T8)
            │                                    └─ OPA        (rego policy, T7)
```
Stateless `core` replicas are the unlock — they require improvement **#1** (move
the in-memory loop state to the shared store). The seam is shipped; the migration
is the first follow-up.

## What needs Bob (irreversible — left for a human)

1. **Stand up the host** (N1): a Linux box / k8s with Docker; `bash deploy/bootstrap.sh`.
2. **1Password**: create the `AiGovOps` vault + a **service-account token**.
3. **Vault**: initialize + unseal a real (non-dev) Vault; token → 1Password.
4. **Keycloak**: create the `aigovops` realm + `aigov-console` client; secret → 1Password.
5. **DNS / TLS** for the public endpoints.

Everything else — the stack, the automation, the secret flow, the metrics, the
scale seams — is code in this repo and runs with one command once those exist.
```
