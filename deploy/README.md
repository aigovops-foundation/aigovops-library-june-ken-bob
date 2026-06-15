# Deploy — the AiGovOps backend stack (automated, repeatable)

One command brings up the full backend the 100k-user topology needs, with **every
secret sourced from 1Password** and nothing sensitive in the repo.

## The stack

| Service | Image | Role |
|---------|-------|------|
| `core` | this repo's `Dockerfile` | the governed core (HTTP + MCP + console) |
| `postgres` | `postgres:16` | durable ledger + app state (#1, N2) |
| `redis` | `redis:7` | shared state + distributed rate limit (#1/#6) |
| `vault` | `hashicorp/vault` | secret broker backend (enclave profile, T2) |
| `keycloak` | `keycloak:24` | OIDC identity provider (T8) |
| `opa` | `openpolicyagent/opa` | runtime rego policy engine (T7/#5) |
| `prometheus` | `prom/prometheus` | scrapes `core:/metrics` (#5) |
| `grafana` | `grafana` | dashboards over Prometheus (#5) |

## Quick start (local, dev defaults — no 1Password)

```bash
bash deploy/bootstrap.sh --dev
# core → http://localhost:8787/console   prometheus → :9090   grafana → :3000
```

## Production bring-up (secrets from 1Password)

**Operator prerequisites — these are the irreversible / credentialed steps, done
by a human, never by CI:**

1. **1Password**: create an `AiGovOps` vault with one item per secret referenced
   in [`.env.1password.tmpl`](.env.1password.tmpl) (session secret, Postgres URL,
   Redis URL, OIDC client secret, Vault token, etc.).
2. **Auth `op` for automation**: create a **1Password service account** and export
   its token — `export OP_SERVICE_ACCOUNT_TOKEN=...` — so `op inject` runs with no
   prompt. (Interactive `op signin` also works for hands-on runs.)
3. **Provision the host**: a Linux box (or k8s) with Docker + Compose.
4. **OIDC**: in Keycloak, create the `aigovops` realm + `aigov-console` client;
   put the client secret in 1Password. (This is the live-IdP step from T8.)
5. **Vault**: initialize + unseal a real (non-dev) Vault; store its token in 1Password.

Then:

```bash
export OP_SERVICE_ACCOUNT_TOKEN=ops_...     # service-account, no-paste
bash deploy/bootstrap.sh                     # renders deploy/.env from 1Password, brings the stack up
```

`bootstrap.sh` renders secrets with `op inject`, starts the datastores, waits for
health, builds + starts the core, and polls `/readyz`. It is idempotent.

To run the core with secrets injected **and never written to disk**:

```bash
op run --env-file=deploy/.env.1password.tmpl -- docker compose -f deploy/docker-compose.yml up -d
```

## How secrets flow (every credential lives in 1Password)

- `.env.1password.tmpl` holds only `op://AiGovOps/<item>/<field>` pointers.
- `op inject` / `op run` resolves them at deploy time.
- The core ALSO resolves any `op://` env value at boot (`core/src/core/op.js`), and
  the `1password` secrets profile (`SECRETS_PROFILE=1password`) brokers stored API
  keys as short-lived scoped tokens — an agent never sees a raw key.
- `deploy/.env` (rendered) is gitignored and `chmod 600`.

## Verify it's healthy

```bash
curl localhost:8787/livez        # liveness
curl localhost:8787/readyz       # readiness (keys + ledger)
curl localhost:8787/metrics      # Prometheus metrics
```

## CI

`.github/workflows/deploy.yml` validates the compose + bootstrap on every push
(repeatability). The `deploy` job is **manual-dispatch only** and a no-op until a
`production` GitHub Environment is configured with `OP_SERVICE_ACCOUNT_TOKEN` and
host access — i.e. it never deploys without the operator's explicit credentials.

## What still needs Bob (the irreversible moves)

The whole stack is automated and repeatable, but four steps need your credentials
and cannot be done autonomously: **creating the 1Password vault + service account**,
**initializing/unsealing Vault**, **creating the Keycloak realm + client secret**,
and **provisioning the production host/DNS**. Everything else is one command.

Each of those four is now **turnkey** — a single prepared command + the credential
entry only you can make. See **[`deploy/provision/README.md`](provision/README.md)**:

| Step | Run | You provide |
|------|-----|-------------|
| 1 · 1Password | `bash deploy/provision/1-onepassword.sh` | sign-in + create a service account |
| 2 · Host | paste `deploy/provision/2-cloud-init.yaml` as VM user-data | the VM + the OP token |
| 3 · Vault + IdP | `bash deploy/provision/3-vault.sh` · `3-keycloak.sh` | Vault unseal-key custody, KC admin pw |
| 4 · DNS + TLS | run `caddy` with `deploy/provision/4-Caddyfile` | the DNS A records |
