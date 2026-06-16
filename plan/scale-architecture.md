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
| 1 | Horizontal scale (externalize state) | 🟡 **durable + cluster-wide shared state shipped** | Shared state runs on Redis via a **dependency-free native RESP client** (`statestore.resp.js` — no `redis` npm package, SBOM intact). Workflows, quotas, and the global kill switch are now **durable across restarts + cluster-wide** (verified live: a workflow survived a core restart). Rate limiter multi-instance; ledger durable (N2). **Next (A4b):** the secrets-provider grant store + `govapi` grants so *brokering* is fully stateless across replicas (until then: sticky sessions). |
| 2 | Workflow engine (multi-step, SLAs) | ✅ **shipped** | `workflow.js` — durable, store-backed (resumable + replica-agnostic) multi-step model: states, per-step assignment, SLA + escalation, metadata-only receipts; `/api/workflows/*` + a management UI at `/workflows`. |
| 3 | Review queue at scale (routing/bulk) | ✅ **shipped** | pending proposals carry SLA `dueAt` + assignee; `/api/gov/pending?assignee=&overdue=1` (soonest-due) + `/api/gov/assign`. **Bulk assign/deny shipped** (`/api/gov/bulk`). |
| 4 | RBAC hierarchy + orgs/teams | ✅ **shipped** | `orgs.js` — orgs/teams + delegated roles (org-steward/reviewer/auditor/regional-steward); `/api/orgs*`. **Next:** member lifecycle automation. |
| 5 | Observability + SLOs | ✅ **shipped** | `/metrics` + `/livez` + `/readyz`; Prometheus + Grafana in the stack. **Next:** alert rules + dashboards JSON + tracing. |
| 6 | Distributed rate-limit + abuse | ✅ **shipped** | `ratelimit.js` (IP) + `quota.js` (per-identity, store-backed/cluster-wide, tiered steward>member>anon) wired into the gateway. **Next:** Sybil/abuse checks on signup. |
| 7 | Notifications + async comms | ✅ **shipped (Hermes)** | `notify.*` multi-channel messenger (dashboard/email/sms/voice/telegram) + two-way bridge + metadata-only receipts. **Next:** digests + per-member channel preferences. |
| 8 | Search + indexing | ✅ **shipped** | `search.js` (dependency-free TF·IDF inverted index over frameworks/skills/members/receipts) + role-scoped `/api/search`. **Scale backend:** Postgres FTS / OpenSearch when the corpus outgrows memory. |
| 9 | Ledger scalability (checkpoints) | ✅ **shipped** | `checkpoints.js` — signed anchors over the chain head + segmented `verifyFromCheckpoint()` (O(n−checkpoint)); `/api/checkpoint`, `/api/verify?fast=1`, `npm run checkpoint`. **Next:** automated archival of anchored segments. |
| 10 | KMS + data lifecycle (DSAR, i18n, a11y) | 🟡 **partial** | **Key rotation + multi-key verify** (`beacon.rotateKeys()`/keyring — old receipts still verify) + **signed DSAR** (`dsar.js`, `/api/dsar`) shipped; i18n `en`/`es`; keys from 1Password. residency tag shipped. **Next:** KMS/HSM custody, full WCAG. |

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
the in-memory loop state to the shared store). The seam is shipped.

**Cross-replica state (current boundary).** The one piece of state that *must* be
global for safety — the **kill switch** — is: a steward halting on any replica
writes `gov:halted` to the shared store and every replica picks it up within
`GOV_HALT_SYNC_MS` (default 2 s), failing closed. Everything else (pending
proposals, brokered grants, caps usage) — and crucially the **secrets-provider
grant store** — is still per-process, so a member's whole propose→decide→runTool
loop must land on one replica. That is enforced by **sticky sessions** (Caddy
`lb_policy cookie`; see `deploy/scale-and-backup.md`). Making brokering fully
stateless across replicas is follow-up **A4b** — deliberately not claimed yet.

## What needs Bob (irreversible — left for a human)

1. **Stand up the host** (N1): a Linux box / k8s with Docker; `bash deploy/bootstrap.sh`.
2. **1Password**: create the `AiGovOps` vault + a **service-account token**.
3. **Vault**: initialize + unseal a real (non-dev) Vault; token → 1Password.
4. **Keycloak**: create the `aigovops` realm + `aigov-console` client; secret → 1Password.
5. **DNS / TLS** for the public endpoints.

Everything else — the stack, the automation, the secret flow, the metrics, the
scale seams — is code in this repo and runs with one command once those exist.
```
