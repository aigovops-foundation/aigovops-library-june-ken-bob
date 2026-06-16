# Phase A — running the backbone (durability + scale-out)

The runbook for the Phase A items whose *code* has landed but whose *activation* is
an operator step. Pairs with `plan/END-TO-END-BUILD-PLAN.md § 2`.

## A3 · Durability + backups (the ledger is the value)

1. Provision a managed Postgres (or the in-stack `postgres` service) and set
   `DATABASE_URL` (an `op://AiGovOps/postgres/url` ref is fine — resolved at boot).
   The core's durable-ledger path (N2) activates automatically when it's set; the
   dependency-free default needs `npm i pg` in the image.
2. Schedule the backup: `deploy/backup-postgres.sh` (pg_dump + gzip + rotation +
   integrity check). Cron example is in the script header.
3. **Test a restore** before trusting it: `gunzip -c <dump> | psql "$DATABASE_URL"`.

## A4 · Global kill switch (DONE — code) + what it implies

The kill switch is now **cluster-wide**: a steward halting on any replica writes
`gov:halted` to the shared store, and every replica's poller (`GOV_HALT_SYNC_MS`,
default 2 s) picks it up and fails closed. The originating replica is instant.
Wire `REDIS_URL` (the stack's `redis` is already up) and `npm i redis` to make the
store shared; without it the store is per-process (single-node, unchanged).

**Honest boundary:** the kill switch is the *only* state that is global today.
Pending proposals, brokered grants, and caps usage remain **per-process** — and so
does the secrets-provider grant store, which is why a member's whole
propose→decide→runTool loop must land on one replica. That is what A5's sticky
sessions guarantee. Fully stateless cross-replica brokering (externalizing the
secrets-provider grant store + caps usage) is the documented follow-up **A4b** in
`plan/scale-architecture.md` — deliberately not claimed here.

## A5 · Run N core replicas behind Caddy (sticky)

Once A4's store is shared, scale out — with **session affinity** so each member's
loop stays on one replica (per the boundary above):

```bash
# core must stop binding a fixed host port so N replicas can run; Caddy reaches
# them inside the compose network instead. Then:
docker compose up -d --scale core=3 core
```

Caddy (run it inside the compose network for multi-replica) with sticky upstreams:

```caddy
198.199.121.180:443 {
    tls internal
    reverse_proxy core:8787 {
        lb_policy       cookie aigov_lb   # sticky: a member's loop stays on one replica
        health_uri      /readyz           # only route to replicas reporting ready
        health_interval 5s
    }
}
```

`docker compose`'s DNS resolves `core` to all replica IPs; `lb_policy cookie` pins a
client. A killed steward action still halts every replica via A4.

## A1 / A2 · Vault + Keycloak out of dev-mode (operator-owned)

These carry irreversible credential custody and stay the human's move:

- **Vault:** switch from dev to file/raft storage, initialize + unseal a real Vault,
  store the unseal key + root token in 1Password, drop the root-token runtime.
- **Keycloak:** run in prod mode with a persistent DB (can share Postgres), real
  admin credentials, TLS, and the `aigovops` realm + `aigov-console` client as
  durable config.

Everything up to the credential entry is code/config in this repo; the unseal and
the credential are yours.
