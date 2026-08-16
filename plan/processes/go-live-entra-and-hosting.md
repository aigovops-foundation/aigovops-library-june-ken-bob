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

## Track A — email, done the right way (Microsoft Graph app-only)

Not a personal Gmail, not fragile basic-auth SMTP. A **dedicated Entra app** with the `Mail.Send`
**application** permission, locked to one sender mailbox, with its client secret in CI. It sends
from a real Foundation address **and** runs unattended in the hourly job. `scripts/send-mail.mjs`
already speaks it — it just needs the four secrets. ~10 minutes, once.

### 1. Create the mailer app (Entra admin center)
1. **entra.microsoft.com** → **App registrations** → **New registration** → name
   `AiGovOps Estate Mailer` → **Register**. Copy the **Application (client) ID** and the
   **Directory (tenant) ID** (`887c5b91-…`).
2. **API permissions** → **+ Add a permission** → **Microsoft Graph** → **Application permissions**
   → tick **`Mail.Send`** → **Add**. Then **✔ Grant admin consent for AiGovOps** (green check).
3. **Certificates & secrets** → **+ New client secret** → copy the **Value** now (shown once).

### 2. Lock it to ONE mailbox (so the app can only send *as* the sender, not the whole tenant)
Create the sender mailbox (e.g. `estate@aigovops.community`), then in **Exchange Online
PowerShell**:
```
New-ApplicationAccessPolicy -AppId <client-id> -PolicyScopeGroupId estate@aigovops.community `
  -AccessRight RestrictAccess -Description "AiGovOps Estate Mailer — estate@ only"
```
This is the guardrail: an app-only `Mail.Send` is tenant-wide by default; the policy pins it to the
one address.

### 3. Put the secrets in CI (repo → Settings → Secrets and variables → Actions)
| Secret | Value |
|---|---|
| `GRAPH_TENANT_ID` | `887c5b91-e526-4ba4-97ef-bbcdcef45420` |
| `GRAPH_CLIENT_ID` | the mailer app's client ID |
| `GRAPH_CLIENT_SECRET` | the secret **Value** from step 1.3 |
| `GRAPH_SENDER` | `estate@aigovops.community` |

The hourly workflow already reads these; the moment they exist, the digest emails to
`bob.rapp@` and `ken.johnston@aigovops.community` send on their own — no connector, no Gmail.

### Interactive sends (on-demand, from this session)
Separately, if you want *me* to send from the **connector** (Bob.Rapp@aigovops.community) rather
than build the app-only path, admin-consent `Mail.Send`/`Mail.ReadWrite` (delegated) on the
connector app `07c030f6-5743-41b7-ba00-0a6e85f37c17` — but that only covers interactive sends,
not the unattended hourly job. The Graph app-only path above is the one that does both.

### Track A′ — SendGrid SMTP (use this if the tenant has no mailboxes)

Graph app-only can only send **as a licensed Exchange Online mailbox**. If
`aigovops.community` is identity-only (no M365 email), Graph returns `ErrorInvalidUser` and
can't send — use a transactional relay instead. `send-mail.mjs` prefers SMTP whenever
`ESTATE_SMTP_URL` is set, so this just works alongside (or instead of) the Graph secrets.

1. **SendGrid account** (free tier: 100 emails/day).
2. **Verify a sender** — *Settings → Sender Authentication*: either **Single Sender
   Verification** (verify one from-address you control) or **Domain Authentication** (verify
   `aigovops.community` — lets you send as any `@aigovops.community`). The From address MUST be
   verified or SendGrid rejects the send.
3. **API key** — *Settings → API Keys → Create*, **Mail Send** permission. Copy it (starts `SG.`).
4. **Two GitHub Actions secrets** (repo → Settings → Secrets and variables → Actions):
   | Secret | Value |
   |---|---|
   | `ESTATE_SMTP_URL` | `smtps://apikey:SG.your-key@smtp.sendgrid.net:465` (username is the literal `apikey`) |
   | `ESTATE_MAIL_FROM` | the **verified** sender address, e.g. `estate@aigovops.community` |

   (Leave the `GRAPH_*` secrets or delete them — SMTP wins when `ESTATE_SMTP_URL` is set.
   Force a provider with the `MAIL_PROVIDER` repo variable = `smtp` or `graph` if ever needed.)

The mailer sends from `ESTATE_MAIL_FROM` (never the `apikey` username), over implicit TLS on
port 465. `mail-health` reports `ok (smtp)`; trigger a run to confirm `send-mail(graph|smtp): sent`.

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
