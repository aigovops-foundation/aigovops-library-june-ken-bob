# HUMAN STEPS — the only things the agent must not do

Everything else in this kit is automated. These five steps are irreversible,
create credentials, or change access control, so they are yours alone. Each one
says exactly what to run, what value to copy, and where to paste it.

**Budget: ~25 minutes.** Do them in order — each unlocks the next.

> **The rule for every secret below:** it goes in your password manager and into
> `deploy/enclave/enclave.env` **on the host**. It never enters this repo, never
> goes in chat, never gets pasted back to an agent. `.gitignore` covers
> `deploy/enclave/*.env`, but the discipline is yours, not the tool's.

---

## 0. Provision the VM  *(~5 min — irreversible: it spends money)*

A Linux host you control. gVisor needs a real kernel, so **not** a shared
container host.

| | Minimum | Comfortable |
|---|---|---|
| vCPU | 2 | 4 |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB SSD | 80 GB SSD |
| OS | Ubuntu 22.04 / 24.04 LTS | same |

Nested virtualisation is **not** required — gVisor is a userspace kernel.

Then, as root on the host:

```bash
git clone <this repo> /opt/aigovops && cd /opt/aigovops
sudo bash deploy/enclave/install-components.sh     # fully automated, idempotent
bash deploy/enclave/render-env.sh                  # writes enclave.env (no secrets)
```

---

## 1. Vault: initialise + unseal  *(~6 min — irreversible: mints the root of trust)*

`vault operator init` can only happen once. It prints five unseal keys and a
root token that **cannot be recovered** if lost.

```bash
export VAULT_ADDR=https://vault.internal:8200
vault operator init -key-shares=5 -key-threshold=3
```

➜ **Copy all 5 unseal keys + the root token into your password manager now.**

```bash
vault operator unseal      # run 3 times, a different key each time
vault login <root-token>
vault secrets enable -path=secret kv-v2

vault policy write aigov - <<'EOF'
path "secret/data/aigov/*" { capabilities = ["read","create","update"] }
path "auth/token/create"   { capabilities = ["update"] }
EOF

vault token create -policy=aigov -period=768h -field=token
```

➜ **Paste that last value** into `deploy/enclave/enclave.env`:

```
VAULT_TOKEN=<the app token>
```

Use the **app token**, never the root token — the core brokers child tokens from
it, and a scoped parent is the whole point.

*Unlocks **T2**: `SECRETS_PROFILE=enclave`. An agent never receives a raw secret.*

---

## 2. Keycloak: realm + OIDC client  *(~7 min — creates a credential)*

```bash
docker compose -f deploy/docker-compose.keycloak-prod.yml up -d
```

Then in the admin console:

1. **Create realm** → `aigovops`
2. **Clients → Create** → `aigov-console`
   - Client authentication: **ON** (confidential)
   - Valid redirect URIs: `https://<your-host>/auth/oidc/callback`
   - Web origins: `https://<your-host>`
3. **Groups → Create** → `steward`
4. **Clients → aigov-console → Credentials** → copy the **Client secret**

➜ **Paste it** into `deploy/enclave/enclave.env`:

```
OIDC_CLIENT_SECRET=<client secret>
```

*Unlocks **T8**: OIDC identity.*

### 2b. Per-member onboarding *(repeat per person — access control)*

**Users → Add user** → set username + email → **Create** → **Credentials** → set
password → **Groups → Join** → `steward`.

Only members in the `steward` group get steward scope. Adding someone to
`steward` grants them every effect view and the approve/moderate power — that is
an access-control decision, which is why no agent may make it.

---

## 3. Postgres: role + database  *(~3 min — creates a credential)*

```bash
sudo -u postgres psql -c "CREATE ROLE aigov LOGIN PASSWORD '<choose one>';"
sudo -u postgres psql -c "CREATE DATABASE aigov OWNER aigov;"
```

➜ **Set the full URL** in `deploy/enclave/enclave.env`:

```
DATABASE_URL=postgres://aigov:<password>@127.0.0.1:5432/aigov
```

Then install the one optional dependency for the Postgres ledger path:

```bash
cd core && npm i pg
```

> `pg` is deliberately **not** in `core/package.json`. The core stays
> dependency-free by default; Postgres is opt-in, per `core/src/core/storage.js`.

*Unlocks: a durable, in-perimeter ledger home.*

---

## 4. The core's own secrets  *(~2 min)*

```bash
openssl rand -hex 32      # → SESSION_SECRET
openssl rand -hex 32      # → STEWARD_TOKEN
```

➜ Paste both into `deploy/enclave/enclave.env`. `STEWARD_TOKEN` is the
break-glass escape hatch for when OIDC is down — treat it like a root password.

---

## 5. Start + verify  *(~2 min — fully automated from here)*

```bash
cd core && set -a && . ../deploy/enclave/enclave.env && set +a && npm start
```

In another shell:

```bash
bash deploy/enclave/enclave-up.sh --only verify
```

You are done when it prints:

```
ENCLAVE GREEN — T2 Vault · T4 gVisor · T7 rego · T8 OIDC · durable ledger
```

Anything red names the exact dial that is not yet enforcing. The verifier proves
each one at runtime — a runsc guest kernel, an unsealed Vault, `opa` agreeing
that "publish" is irreversible, a matching OIDC issuer, and a real ledger row
round-tripped through Postgres. It never takes configuration's word for it.

---

## What the agent already did for you

Installed and version-checked every component · registered the `runsc` Docker
runtime · rendered the full config with fail-closed templating · wired the
preflight and the runtime verifier · left every secret line commented and empty.

## What the agent deliberately did not do

Provision a VM · `vault operator init` · create a realm, client, or any user
account · choose or type any password · grant `steward` to anyone · touch DNS ·
write a secret to any file in this repo.
