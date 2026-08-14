# Go-live — Entra admin-consent (email) + hosting (IdP/membership)

The two human moves that flip everything from *armed* to *live*: (A) admin-consent the Graph
mail permissions so the estate can **send email**, and (B) stand up the durable host so the
**IdP → membership** actually admits people. Both are yours — this is the irreversibility
boundary. Everything below is prepared; you make the moves.

Known identifiers (from the live tenant — these are IDs, not secrets):

| | |
|---|---|
| Tenant | `aigovops.community` · `887c5b91-e526-4ba4-97ef-bbcdcef45420` |
| Connector app (client) | `07c030f6-5743-41b7-ba00-0a6e85f37c17` |
| Admin | `Bob.Rapp@aigovops.community` |
| Missing Graph scopes | **`Mail.Send`**, **`Mail.ReadWrite`** (delegated) — `Mail.Read` already works |

---

## Track A — Entra admin-consent (unblocks the hourly email + the member drip)

The connector authenticates fine (it can read mail), but sending/drafting is denied because
`Mail.Send` / `Mail.ReadWrite` aren't consented on the app. The OBO path requests `.default`, so
it uses whatever **static** permissions the app registration carries — which means the two scopes
must be **added to the app AND admin-consented**. ~3 minutes.

### If `07c030f6…` is your own App registration (most likely)
1. **portal.azure.com** → **Microsoft Entra ID** → **App registrations** → **All applications** →
   paste `07c030f6-5743-41b7-ba00-0a6e85f37c17`.
2. **API permissions** → **+ Add a permission** → **Microsoft Graph** → **Delegated permissions**
   → tick **`Mail.Send`** and **`Mail.ReadWrite`** → **Add permissions**.
3. Click **✔ Grant admin consent for AiGovOps** → confirm. Every row should show a green
   "Granted for AiGovOps".

### If it's an Enterprise Application (a vendor's multi-tenant app)
Use the one-click admin-consent URL (sign in as a Global Admin, review, **Accept** — grants
tenant-wide):
```
https://login.microsoftonline.com/887c5b91-e526-4ba4-97ef-bbcdcef45420/adminconsent?client_id=07c030f6-5743-41b7-ba00-0a6e85f37c17
```
Caveat: consent only grants what the app **requests**. If the vendor app doesn't request
`Mail.Send`/`Mail.ReadWrite`, they must be added to its manifest first (Enterprise applications →
the app → Permissions), or the send scope won't appear.

### Verify
Once consented, ask me to retry the send — the welcome + the estate-health digest go out to
`bob.rapp@` and `ken.johnston@aigovops.community` immediately, and the **hourly digest email**
starts working. (Alternative if you'd rather not consent Graph: set the `ESTATE_SMTP_URL` repo
secret — e.g. `smtps://user:app-password@smtp.gmail.com:465` — and the CI job sends without the
connector at all.)

---

## Track B — Hosting (stand up the IdP so membership goes live)

The IdP is Keycloak on a durable Linux host. Standing it up is what makes the armed
`auto_accept` (with the hold-first-25 ramp) actually admit members. Jeeves drives it; you make
the irreversible clicks. Budget ~30–40 min. Full runbook: `plan/enclave-host-bringup.md`.

1. **Provision a Linux VM** *(irreversible — it spends money).* Ubuntu 22.04/24.04 LTS; **2–4
   vCPU, 4–8 GB RAM, 40–80 GB SSD.** gVisor is userspace, so no nested virt needed; a real
   kernel (not a shared-container host) is required.
2. **DNS** *(irreversible — registrar).* Point your host names at the VM's IP — an ID host
   (e.g. `id.aigovops.community` → Keycloak) and a console host (e.g.
   `console.aigovops.community` → the core). These become `OIDC_ISSUER` and `OIDC_REDIRECT_URI`.
3. **TLS.** Terminate HTTPS for both names (Caddy/Traefik/Let's Encrypt in front, or Keycloak's
   own certs). OIDC requires valid TLS.
4. On the host, as a sudo user:
   ```
   git clone <this repo> /opt/aigovops && cd /opt/aigovops
   sudo bash deploy/enclave/install-components.sh          # runsc, opa, Postgres, Keycloak image, op
   ENCLAVE_HOST=console.aigovops.community \
     OIDC_ISSUER=https://id.aigovops.community/realms/aigovops \
     ENCLAVE_SECRETS=1password bash deploy/enclave/render-env.sh --force
   ```
5. **1Password service-account token** *(credential — yours).* my.1password.com → Developer →
   Service Accounts → Create `aigov-enclave`, grant **READ** on the `AiGovOps` vault, copy the
   `ops_…` token, then on the host `export OP_SERVICE_ACCOUNT_TOKEN=ops_…` and paste the same
   line into `deploy/enclave/enclave.env` (git-ignored, root-only).
6. **Stand up the IdP + the rest** — run Jeeves and follow each gate (it drives your browser to
   Keycloak, you click Create):
   ```
   bash deploy/enclave/jeeves.sh --from keycloak
   ```
   It walks: realm `aigovops` · client `aigov-console` (confidential; redirect =
   `OIDC_REDIRECT_URI`) · `groups` mapper · group `steward` · store the client secret in
   1Password (`op item edit oidc client-secret='…' --vault AiGovOps`) · then Postgres + the core.
   Shortcut for the realm: `bash deploy/provision/3-keycloak.sh` imports it in one shot.
7. **Add Bob and Ken as users → join `steward`** (access control — yours alone).
8. **Verify:** `bash deploy/enclave/jeeves.sh --only verify` → should print
   **`ENCLAVE GREEN — T2 (1Password) · T4 gVisor · T7 rego · T8 OIDC · durable ledger`**.

---

## What is live once each track lands

| You do | And this goes live |
|--------|--------------------|
| Track A (consent **or** SMTP secret) | Hourly estate-health email to you + Ken; the member drip can send |
| Track B (IdP up + verify green) | Membership admits people — first **25 held** for your approval, then auto-accept opens (≤1/min, read-only); create still gated by the Yes-Gate |
| Add Ken's GitHub handle to `founders.json` | Ken is @-mentioned on the pinned estate-health issue too |

**Posture tradeoff, once:** the 1Password (managed) posture is **not air-gapped** — the enclave
must reach 1Password's cloud. For a regulated, offline-verify enclave, take the Vault path
(`deploy/enclave/enclave-up.sh`) instead. And before you flip the IdP on, remember the guardrail
is a *hold-the-first-25* ramp, not a closed door for everyone — tune `guardrails` in
`member-onboarding.config.json` if you want domain allow/deny or a captcha too.
