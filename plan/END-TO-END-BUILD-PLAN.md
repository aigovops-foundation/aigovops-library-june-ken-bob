# AiGovOps — the end-to-end build plan

> One authoritative map from *where we are* to *the Foundation's production backbone*.
> Consolidates `build-tickets.md`, `scale-architecture.md`, `agent-build-plan.md`,
> `control-and-deployment.md`, and `hermes-messenger.md` into a single sequenced plan.
> Snapshot date: **2026-06-15**.
>
> The governing rule, applied to our own build: **prepare and propose; the human makes
> the irreversible move.** Every credential/host/DNS step below is Bob's or Ken's.

Legend — status: ✅ done · 🟡 partial (foundation shipped, features next) · ⬜ not started.
Effort: **S** ≲1 day · **M** a few days · **L** a week+. Risk is the blast radius if it goes wrong.

---

## 0. Where we are (the honest ledger)

The **entire safety substrate is built, tested, and deployed.** A dependency-free Node
core enforces the Yes-Gate, brokers secrets, sandboxes tools, signs a metadata-only
Ed25519 ledger, scopes every view by identity, and now delivers across channels (Hermes).
It runs live on a DigitalOcean droplet behind Caddy TLS, brokering secrets from 1Password.

| Area | State |
|------|-------|
| Core safety tickets 0–10 | ✅ 10/10 |
| Enablers A1 (skill-runner) · A2 (governed MCP/API) | ✅ |
| Six agent integrations (model, connector, tools, evidence, OPA, IdP) | ✅ |
| Durable ledger · self-host change path · attestation/drift · agentic console | ✅ (N2–N6) |
| Observability (`/metrics` `/livez` `/readyz` + Prom/Grafana) | ✅ (#5) |
| Deploy IaC + 1Password-rendered automation | ✅ |
| Hermes messenger (dashboard/email/sms/voice/telegram + two-way bridge) | ✅ (2026-06-15) |
| Live host | ✅ `198.199.121.180`, all 8 services up, `SECRETS_PROFILE=1password` |

**What is NOT yet done** is the difference between *a proven system* and *a production
backbone the Foundation runs everything on*: production-grade datastores, true horizontal
scale, the scale features (queue/RBAC/workflow/search), and the enclave go-live. That is
the work below.

---

## 1. The target ("done" means this)

The governed core is the **production backbone for all AiGovOps services**, running in any
of **three homes** from one image, selected by `PROFILE`:

- **lab** (laptop) — SQLite/files, local models, no egress.
- **community** (cloud) — HA Postgres, cloud KMS, egress allow-list. ← *the Foundation runs here.*
- **enclave** (firewall) — Postgres in-VPC, Vault in perimeter, egress deny-all, gVisor. ← *what wins regulated customers.*

"Production backbone" is reached when: state is durable + backed up, the core scales
horizontally, identity/secrets run in real (non-dev) services, and the scale features
carry real member load — all observable, all leaving signed receipts.

---

## 2. Phase A — Production hardening (make it the backbone)

The Tier-0 gap. None of this is glamorous; all of it is the line between a demo and a
backbone. **Do this first.**

| # | Item | Status | Effort | Risk | What's there → what's next |
|---|------|--------|--------|------|----------------------------|
| A1 | **Vault out of dev-mode** | 🟡 | M | **High** | `VaultProvider` + seam shipped; the live box runs Vault in dev (in-memory, auto-unseal, root token). → file/raft storage, real unseal keys in 1Password, no root-token runtime. |
| A2 | **Keycloak out of dev-mode** | 🟡 | M | Med | OIDC wired + verified; box runs Keycloak dev. → persistent DB (can share Postgres), real admin creds, TLS, the `aigovops` realm + `aigov-console` client as durable config. |
| A3 | **Postgres durability + backups** | 🟡 | S | **High** | Durable-ledger code (N2) ships; **`deploy/backup-postgres.sh` (pg_dump + rotation + integrity check) + runbook now added**. → operator wires managed Postgres (`DATABASE_URL`) + the cron. |
| A4 | **Global kill switch across replicas** | ✅ | M | Med | **Done + tested.** `govapi` keeps a local `halted` cache written through to the shared store (`gov:halted`); the server polls `syncHalt()` so a kill on ANY replica halts all within `GOV_HALT_SYNC_MS`. Unblocks A5. |
| A4b | **Stateless brokering (pending/grants + secrets-provider grants)** | ✅ | L | Med | **Done + tested cross-instance.** Pending proposals, govapi grant metadata, and the `FileProvider` grant store all moved to the shared store (same opaque-token/expiry/revoke semantics); the gate/govapi/broker chain became async. propose-A → decide-B → runTool-C works. Caps stay per-process (conservative). Sticky sessions now optional, not required. |
| A5 | **Run N core replicas behind Caddy (sticky)** | 🟡 | S | Low | **Config + runbook added** (`deploy/scale-and-backup.md`: `--scale core=N` + Caddy `lb_policy cookie` + `/readyz` health). The live multi-replica swap is the operator's step. |

**Exit:** state durable + backed up; identity/secrets in real services; the kill switch is
global; the core scales out with session affinity. (Fully stateless brokering = A4b.)

---

## 3. Phase B — Scale features (carry real member load)

The six partials + three unstarted scale improvements. Sequence by when member load
demands them; none blocks Phase A.

| # | Improvement | Status | Effort | Next step |
|---|-------------|--------|--------|-----------|
| #3 | Review queue at scale | ✅ | M | **Shipped** — pending proposals carry createdAt + SLA `dueAt` (by required level) + assignee; `/api/gov/pending?assignee=&overdue=1` (sorted soonest-due) + `/api/gov/assign`.. **Bulk assign/deny shipped** (`/api/gov/bulk`). |
| #4 | RBAC hierarchy + orgs/teams | ✅ | M | **Shipped** — `orgs.js` (orgs + teams + delegated roles: org-steward/reviewer/auditor/regional-steward) + `/api/orgs*` (steward-managed). |
| #6 | Distributed rate-limit + abuse | ✅ | M | **Per-identity quota shipped** (`quota.js`, store-backed/cluster-wide, tiered steward>member>anon; wired into the gateway). Remaining (→ A4b-adjacent): Sybil/abuse checks on signup. |
| #7 | Notifications + async comms | ✅→🟡 | — | **Hermes** (multi-channel + receipts) + **per-member channel preferences** (`notify.prefs.js`, `/api/notify/prefs`). Remaining: digest batching. |
| #8 | Search + indexing | ✅ | M | **Shipped** — `search.js` (dependency-free TF·IDF inverted index over frameworks/skills/members/receipts) + role-scoped `/api/search`. Postgres FTS is the documented scale backend when the corpus outgrows memory. |
| #9 | Ledger scalability (checkpoints) | ✅ | M | **Shipped** — `checkpoints.js` (signed anchors + segmented `verifyFromCheckpoint` = O(n−checkpoint)) + `/api/checkpoint`, `/api/verify?fast=1`, `npm run checkpoint`, non-destructive archive insight. |
| #10 | KMS + data lifecycle | 🟡 | L | **Key rotation + multi-key verify shipped** (`beacon.rotateKeys()`/keyring; old receipts still verify; `/api/keys/rotate`, `npm run rotate-keys`). **Signed DSAR shipped** (`dsar.js`, `/api/dsar` self-service + steward). Data-residency tag shipped (`DATA_RESIDENCY`, in /status + DSAR). **Next:** KMS/HSM custody, full WCAG. |
| #2 | Workflow engine (multi-step, SLAs) | ✅ | L | **Shipped** — `workflow.js`: durable, store-backed (resumable + replica-agnostic), states, per-step assignment, SLA + escalation, metadata-only receipts; `/api/workflows/*`. |

**Phase B is now ✅ except #10.** Shipped: #2 (workflow engine), #3 (queue routing/SLA),
#4 (orgs/teams RBAC), #6 (per-identity quotas), #7 (Hermes), #8 (search), #9
(checkpoints). **Remaining:** #10 (KMS/HSM + DSAR + full WCAG, L) — compliance-driven,
do when a regulated customer requires it.

**On A4b (stateless brokering) — DONE.** Originally deferred (it converts the
synchronous broker chain to async — wide blast radius for the modest gain of
dropping sticky sessions), but built on request and landed cleanly: the broker's
grant store + govapi pending/grants moved to the shared store with the *same*
security semantics (opaque token, expiry, revoke-by-flag, one receipt per op), the
gate/govapi/broker chain is now `async`, and a cross-instance test proves
propose-A → decide-B → runTool-C. The conversion preserved the contract (the
provider contract test already awaited every method); ~20 files touched, all tests
green. Caps stay per-process (a conservative safety net). Sticky sessions are now an
optimization, not a correctness requirement.

---

## 4. Phase C — Enclave go-live (win the regulated customer)

The "three homes" claim is only proven when the enclave profile runs air-gapped on Linux.
Several tickets are code-complete but **gold-blocked** on a Linux host (gVisor `runsc` is
Linux-only; this and the live Vault/opa/IdP can only be exercised there).

| Item | Status | Blocked on (human/host) |
|------|--------|--------------------------|
| Stand up the Linux enclave host (N1) | ⬜ | Bob: a Linux box / k8s + `bash deploy/bootstrap.sh` |
| gVisor sandbox live (T4) | ✅ code | Linux `runsc` |
| Live Vault API (T2) | ✅ code | real Vault on the host (A1 above) |
| `opa` real-rego parity (T7) | ✅ seam | `opa` binary in CI/enclave |
| Real IdP tenant (T8) | ✅ code | Keycloak realm (A2 above) |
| Enclave package / SBOM / signed release (T9) | ✅ | air-gapped Linux run to exercise end-to-end |

**Exit:** the full governed loop runs air-gapped, ledger verifiable offline with `openssl`.

---

## 5. Phase D — Govern itself (the credibility flywheel)

Automation so the build is held to its own gate.

- **Governance-gate CI** — ✅ **shipped** (`scripts/governance-gate.mjs`, `npm run gate`):
  verifies the ledger signatures + prev-hash chain + checkpoint anchor and exits
  non-zero on any tampering (a forged signature fails the build — tested).
- **Prose skills → real tools as CI** — ✅ **shipped** (`scripts/scan.mjs`, `npm run scan`, wired into `ci.yml`): `accessibility-audit` (a11y.js) audits every shipped HTML page and `security-privacy-review` (scanners.js) scans configs/docs for secrets — both as blocking build gates, dependency-free, tested. (Deeper axe/pa11y + browser-based checks are a future deepening.)
- **Build-ledger pulse** — ⬜ extend `pulse.html` into a public ledger of tickets agents built, with receipts (a docs artifact — deliberately deferred).

---

## 6. Hermes follow-through (config, not build)

Hermes is **built and live** (dashboard channel active now). To light up the rest — pure
config + the broker, no code:

1. Put each channel credential in `op://AiGovOps/notify-*`; add to `NOTIFY_CHANNELS`.
2. Two-way: set `NOTIFY_TELEGRAM_FOUNDERS=<tg_id>:bob,<tg_id>:ken` + bot token + webhook secret; point the bot webhook at `/api/bridge/telegram`.
3. Verify each channel from `/messaging` → "Send test notification."

Open decisions remain in `hermes-messenger.md § "Still the human's call"` (which channels,
auto-send-vs-gate per kind, audiences, founder id-binding).

---

## 7. The human-owned irreversible steps (consolidated "what needs Bob/Ken")

These never become autonomous — they are the project's governance principle applied to
itself. None is code; each is one credentialed move.

1. **1Password** — create/confirm the `AiGovOps` vault + a service-account token (done for the runtime; an **admin** session is needed to *write* app-secret items).
2. **Vault** — initialize + unseal a real (non-dev) Vault; store unseal key + token in 1Password (Phase A1).
3. **Keycloak** — create the `aigovops` realm + `aigov-console` client; secret → 1Password (Phase A2).
4. **Postgres** — provision the managed DB; set `DATABASE_URL` (Phase A3).
5. **Linux enclave host** — stand up N1 for the enclave go-live (Phase C).
6. **DNS / TLS** — point `console.*` / `id.*` at the host when moving off the bare IP.
7. **Channel accounts** — Telegram BotFather token, Twilio, email sender (Hermes go-live).
8. **Decommissioning** — the old droplet `577944153` + Mongo `dbaas-db-3968507` (permanent deletion — yours alone).

---

## 8. Recommended single thread

If you want one ordered path rather than parallel tracks:

**A3 (Postgres + backups) → A4 (externalize state) → A1/A2 (Vault + Keycloak prod) →
A5 (replicas) → #3+#4 (queue + orgs) → Hermes channel go-live → Phase C (enclave) →
#2/#8/#9 (workflow/search/checkpoints) → Phase D (govern itself).**

Rationale: durability and real datastores first (they protect the one irreplaceable asset,
the signed ledger), then scale-out, then the features that need scale, then the enclave
proof, then the self-governance flywheel.

---

## 9. Definition of done — "production backbone"

- ☐ Ledger in managed Postgres, backed up nightly, restore-tested.
- ☐ Vault + Keycloak in production mode (no dev defaults, no root-token runtime).
- ☐ Core runs ≥2 replicas behind Caddy with shared state; kill switch + grants consistent across them.
- ☐ Per-member RBAC + review queue carrying real members.
- ☐ Hermes channels live for the founders (two-way verified).
- ☐ Observability with alert rules; SLOs defined.
- ☐ One enclave run proven air-gapped on Linux, ledger verified offline.
- ☐ Every step above left a signed receipt.

> Agents do the bureaucracy; humans hold the meaning — and humans hold the keys.
