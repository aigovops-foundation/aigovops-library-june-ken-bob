# Production hardening — steps 1·2·3 (status + the operator's moves)

The three steps that turn the live box from a tested system into something the
Foundation can onboard real members onto. Status as of this pass:

| Step | State | What's left for you |
|------|-------|---------------------|
| **3. Backups** | ✅ **done** | nothing — verify it ran |
| **2. Live broker secrets** | ✅ **wired (placeholders)** | swap placeholders for real keys when a tool hits a real target |
| **1. Keycloak prod + live OIDC** | 🟡 **config ready** | the credential steps below |

---

## 3. Backups (done)

`deploy/backup-state.sh` tarballs the file ledger (`beacons.ndjson` +
`checkpoints.ndjson`), the Beacon keys, and Redis (workflows/quotas/grants) to
`/opt/aigovops/backups`, rotated (keep 14). A **nightly cron at 03:30 UTC** is
installed. Verify + restore:

```bash
crontab -l | grep backup-state          # the schedule
ls -lt /opt/aigovops/backups             # the tarballs
# restore: tar xzf <archive> -C /tmp/r   then copy ledger/ keys/ back onto the volumes
```

## 2. Live broker secrets (wired)

The gov-loop broker (`FileProvider`) now reads `SECRETS_FILE=/app/core/keys/
secrets.local.json` on the persistent `core_keys` volume, so the full
**propose → approve → runTool** loop works live (verified). The masters are
**placeholders**; replace them with real keys when a brokered tool actually acts
against a real target (a token is never the master, and the demo sandbox doesn't
use it, so placeholders are safe until then):

```bash
docker compose exec core sh -c 'cat /app/core/keys/secrets.local.json'   # see scopes
# edit in place to set real masters per scope, then:
docker compose restart core
```
> The grant state lives in Redis (A4b), so it survives restarts and is cluster-wide.
> For a 1Password-brokered gov-loop (instead of the file), wire the OnePasswordProvider
> for A4b (store-backed grants) first — a follow-up; the file path is A4b-ready today.

## 1. Keycloak production mode (config ready — your credential step)

Config overlay: `deploy/docker-compose.keycloak-prod.yml` (Postgres-backed,
behind Caddy TLS). The realm/client already exist (`provision/3-keycloak-realm.json`,
`provision/3-keycloak.sh`). Your moves (the irreversible credential entry):

```bash
cd /opt/aigovops/deploy
# 1) set in .env:  KEYCLOAK_ADMIN_PASSWORD=<strong>  POSTGRES_USER/PASSWORD  KC_HOSTNAME=198.199.121.180
# 2) one-time: create the keycloak DB
docker compose exec postgres createdb -U "$POSTGRES_USER" keycloak
# 3) bring Keycloak up in prod mode
docker compose -f docker-compose.yml -f docker-compose.keycloak-prod.yml up -d keycloak
# 4) import the realm + rotate the aigov-console client secret → 1Password
KC_URL=http://127.0.0.1:8080 KC_ADMIN_PW="$KEYCLOAK_ADMIN_PASSWORD" bash provision/3-keycloak.sh
# 5) point the core at it — set in .env, then recreate core:
#    OIDC_ISSUER=https://198.199.121.180/realms/aigovops   (via Caddy)
#    OIDC_CLIENT_ID=aigov-console
#    OIDC_CLIENT_SECRET=op://AiGovOps/oidc/client-secret
#    OIDC_REDIRECT_URI=https://198.199.121.180/auth/oidc/callback
docker compose up -d --force-recreate core
# 6) add Ken + Bob to the 'steward' group in the Keycloak admin console
```
Then members sign in at `/console` via OIDC instead of the steward token. Until
then, the steward token remains the admin escape hatch.
