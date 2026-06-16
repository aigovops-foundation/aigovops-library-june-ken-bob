# Production hardening — steps 1·2·3 (status + the operator's moves)

The three steps that turn the live box from a tested system into something the
Foundation can onboard real members onto. Status as of this pass:

| Step | State | What's left for you |
|------|-------|---------------------|
| **3. Backups** | ✅ **done** | nothing — verify it ran |
| **2. Live broker secrets** | ✅ **wired (placeholders)** | swap placeholders for real keys when a tool hits a real target |
| **1. Keycloak prod + live OIDC** | ✅ **live** | only: create Ken/Bob accounts + add to `steward` |

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

## 1. Keycloak production mode — LIVE

What's done on the box (all verified):
- Keycloak runs in **prod mode**, Postgres-backed (`docker-compose.keycloak-prod.yml`;
  `POSTGRES_USER/PASSWORD=aigov`, a `keycloak` DB).
- The `aigovops` realm is imported; the `aigov-console` client has the box redirect
  (`https://198.199.121.180/auth/oidc/callback`) + web origin and a **freshly rotated
  secret** (on the box `.env`, never in the repo).
- **Caddy** routes the OIDC paths to Keycloak (IP-only transitional config — the
  DNS target stays `provision/4-Caddyfile`):
  ```caddy
  198.199.121.180:443 {
      tls internal
      @kc path /realms/* /resources/* /admin/* /js/keycloak/* /robots.txt
      handle @kc { reverse_proxy localhost:8080 }   # Keycloak
      handle      { reverse_proxy localhost:8787 }   # the core
  }
  ```
- The core trusts Caddy's self-signed CA via `NODE_EXTRA_CA_CERTS=/app/core/keys/
  caddy-root.crt` (so server-side OIDC discovery/token/JWKS work over the internal
  HTTPS). **Remove this once real DNS + Let's Encrypt TLS land.**
- `.env` has `OIDC_ISSUER`, `OIDC_CLIENT_ID=aigov-console`, `OIDC_REDIRECT_URI`,
  `OIDC_CLIENT_SECRET`, `OIDC_STEWARD_GROUP=steward`. `/auth/oidc/login` 302-redirects
  to the Keycloak login page; discovery issuer matches; the steward token still works.

**The only step left is yours** (account creation + access control — never the agent's):
create Ken's and Bob's user accounts and put them in the `steward` group. Easiest via
the admin console `https://198.199.121.180/admin/` (log in `admin` / your
`KEYCLOAK_ADMIN_PASSWORD`) → Users → Add user → set password → Groups → join `steward`.
Or with kcadm:
```bash
KCID=$(docker ps --filter ancestor=quay.io/keycloak/keycloak:24.0 --format '{{.ID}}'|head -1)
KC="docker exec -i $KCID /opt/keycloak/bin/kcadm.sh"
$KC config credentials --server http://127.0.0.1:8080 --realm master --user admin --password "$KEYCLOAK_ADMIN_PASSWORD"
$KC create users -r aigovops -s username=bob -s enabled=true -s email=bob@aigovops.org
$KC set-password -r aigovops --username bob --new-password '<bob picks this>'    # YOUR credential
GID=$($KC get groups -r aigovops | grep -B1 '"name" : "steward"' | grep id | sed 's/.*: "//;s/".*//')
$KC update users/$($KC get users -r aigovops -q username=bob --fields id --format csv|tr -d '"') /groups/$GID -r aigovops -n   # join steward
```
Then members sign in at `/console` via OIDC instead of the steward token. Until
then, the steward token remains the admin escape hatch.
