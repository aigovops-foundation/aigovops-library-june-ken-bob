# Enclave Standup Checklist — the one page you keep open during the session

A tick-box companion to the two runbooks. Not a replacement:

- **What the enclave profile *is*** and how to verify a release offline →
  `plan/enclave-runbook.md`
- **The hands-on narrative** (why a real kernel, sizing, air-gapped notes) →
  `plan/enclave-host-bringup.md`
- **The five human moves in full**, with exact commands and paste targets →
  `deploy/enclave/HUMAN-STEPS.md`

**This** is the checklist: a linear list you check off, each item marked for who
does it. Nothing here is new procedure — every step points at the script or the
doc that already carries the detail.

Legend: **🤖 automated** (the kit does it, safe to re-run) ·
**🔴 human — irreversible** (yours alone: credentials, accounts, access control,
spend). The 🔴 items are the whole reason a human is in this loop — the
irreversibility boundary applied to our own tooling.

> **Secret discipline, every 🔴 step:** the value goes to your password manager
> and into `deploy/enclave/enclave.env` **on the host**. Never into this repo,
> never into chat, never pasted back to an agent. `.gitignore` covers
> `deploy/enclave/*.env`; the discipline is yours.

The orchestrator that drives all of this and pauses at each 🔴 gate:

```bash
git clone <this repo> /opt/aigovops && cd /opt/aigovops
bash deploy/enclave/enclave-up.sh          # idempotent + resumable
bash deploy/enclave/enclave-up.sh --status # what's done so far
bash deploy/enclave/enclave-up.sh --from vault   # resume mid-way
```

Budget: **~35 min end to end, ~23 of it genuinely human.**

---

## Before you sit down — decide two names

These appear in the rendered config and the Keycloak client, so pin them first:

- [ ] **`ENCLAVE_HOST`** — where the console is reached (e.g. `console.internal`)
- [ ] **`VAULT_ADDR`** — where Vault listens (e.g. `https://vault.internal:8200`)

---

## Phase 0 — Provision the host  · 🔴 ~5 min

- [ ] **🔴 Provision a Linux VM you control.** Ubuntu 22.04/24.04 LTS, ≥2 vCPU /
      4 GB / 40 GB (comfortable: 4 / 8 GB / 80 GB SSD). *Irreversible: it spends
      money.* gVisor is userspace, so **no** nested virtualisation needed — but
      **not** a shared container host (`runsc install` must register a Docker
      runtime and needs a real kernel). Sizing table: `enclave-host-bringup.md` §0.
- [ ] SSH in as a sudo-capable user; clone the repo to `/opt/aigovops`.

---

## Phase 1 — The reversible pass  · 🤖 ~10 min

All idempotent; re-running changes nothing. Driven by `enclave-up.sh` phases
`preflight → components → render`, or run individually:

- [ ] **🤖 Preflight** — `cd core && npm run enclave:preflight`. Prints what's
      missing as *named lost dials*, not just absent binaries. Fail-closed; exits
      non-zero if anything required is absent.
- [ ] **🤖 Install components** — `sudo bash deploy/enclave/install-components.sh`.
      Node 20, Docker, gVisor (`runsc` + registered as a Docker runtime,
      checksum-verified), Vault, `opa`, Postgres, the Keycloak image. `--check`
      reports only.
- [ ] **🤖 Render the config** — `bash deploy/enclave/render-env.sh`. Writes
      `deploy/enclave/enclave.env` (mode 600, gitignored, **no secrets** — the
      four secret lines are left commented for you). Fail-closed: an empty
      `${VAR}` is an error, not a silent blank. Won't clobber pasted secrets
      without `--force`.

---

## Phase 2 — The five human moves  · 🔴 ~18 min

Full commands + paste targets: `deploy/enclave/HUMAN-STEPS.md`. Each unlocks the
next; do them in order. `enclave-up.sh` stops at each with an `ACTION REQUIRED`
block and resumes when the value is present in `enclave.env`.

### 2.1 Vault — initialise + unseal  · 🔴 ~6 min → unlocks **T2**

- [ ] **🔴 `vault operator init -key-shares=5 -key-threshold=3`** — happens once;
      mints the root of trust. **Copy all 5 unseal keys + the root token to your
      password manager now** — they cannot be recovered if lost.
- [ ] **🔴 Unseal** (`vault operator unseal` ×3, different keys) and log in.
- [ ] Enable KV, write the `aigov` policy, mint the **app token**
      (`-policy=aigov -period=768h`).
- [ ] **🔴 Paste the app token** (never the root token) → `enclave.env`:
      `VAULT_TOKEN=…`
- ✅ Green: `SECRETS_PROFILE=enclave` — the broker mints scoped child tokens; an
      agent never receives a raw secret.

### 2.2 Keycloak — realm + OIDC client  · 🔴 ~7 min → unlocks **T8**

- [ ] Start Keycloak prod:
      `docker compose -f deploy/docker-compose.keycloak-prod.yml up -d`.
- [ ] **🔴 Create realm** `aigovops`.
- [ ] **🔴 Create client** `aigov-console` — client auth **ON** (confidential);
      redirect URI `https://<ENCLAVE_HOST>/auth/oidc/callback`; web origin
      `https://<ENCLAVE_HOST>`.
- [ ] **🔴 Create group** `steward`.
- [ ] **🔴 Copy the client secret** → `enclave.env`: `OIDC_CLIENT_SECRET=…`
- ✅ Green: OIDC identity live; the `steward` group scopes every oversight view.

### 2.3 Postgres — role + database  · 🔴 ~3 min → durable ledger

- [ ] **🔴 Create role + db** (`CREATE ROLE aigov LOGIN PASSWORD '…'` /
      `CREATE DATABASE aigov OWNER aigov`) — you choose the password.
- [ ] **🔴 Set** `enclave.env`: `DATABASE_URL=postgres://aigov:<pw>@<host>:5432/aigov`
- [ ] **🤖 Install the one opt-in dep** — `cd core && npm i pg` (deliberately not
      in `package.json`; the core stays dependency-free by default).
- ✅ Green: durable, multi-writer ledger home with in-transaction chain linking.

### 2.4 Core secrets  · 🔴 ~2 min

- [ ] **🔴 `openssl rand -hex 32`** → `SESSION_SECRET` in `enclave.env`.
- [ ] **🔴 `openssl rand -hex 32`** → `STEWARD_TOKEN` in `enclave.env`
      (the break-glass hatch when OIDC is down — treat it like a root password).

---

## Phase 3 — Start + verify  · 🤖 ~2 min

- [ ] **🤖 Start the core:**
      `cd core && set -a && . ../deploy/enclave/enclave.env && set +a && npm start`
      (or `docker compose --env-file deploy/enclave/enclave.env -f
      deploy/docker-compose.yml up -d`). `assertEnclave()` refuses to serve if any
      dial is weaker than the profile — naming the offending check.
- [ ] **🤖 Verify — proof, not config:** `cd core && npm run enclave:verify` (or
      `bash deploy/enclave/enclave-up.sh --only verify`). Each check exercises the
      real thing — a `runsc` guest kernel via `dmesg`, an unsealed Vault, `opa`
      agreeing "publish" is irreversible, a matching OIDC issuer, a real ledger
      row round-tripped through Postgres.
- [ ] **✅ Done when it prints:**
      `ENCLAVE GREEN — T2 Vault · T4 gVisor · T7 rego · T8 OIDC · durable ledger`
      Anything red names the exact dial not yet enforcing.

---

## Phase 4 — Per-member onboarding  · 🔴 ~1 min each (as needed)

- [ ] **🔴 For Bob, Ken, each steward:** Keycloak → Users → Add user → set
      password → Groups → Join `steward`. Group membership is an access-control
      move — yours alone. Members outside `steward` get member scope (their own
      effects only).

---

## What flips green — the payoff

Standing up this one host turns five "built-but-blocked" items live at once. All
the code is shipped and tested with injected probes; the host is what lets the
*live* path run:

| Item | Dial | Verified live by |
|------|------|------------------|
| **T2** VaultProvider | `SECRETS_PROFILE=enclave` | Vault `/v1/sys/health` unsealed |
| **T4** gVisor run path | `SANDBOX_BACKEND=gvisor` | `--runtime=runsc` + `dmesg` guest kernel |
| **T7** real rego | `POLICY_ENGINE=opa` | `opa` agrees "publish" is irreversible |
| **T8** live OIDC | `OIDC_*` | discovery issuer == `OIDC_ISSUER` |
| feature #3 mutation tools | (needs T4) | `git-commit` / real `http-get` under the kernel sandbox |

This is the **"first enclave-ready release"** milestone going from *proven with
fakes* to *proven live* — and the last item on the whole backlog that needs a
human's irreversible move.

---

## Honest scope

The preflight logic, template rendering, and every verify check's decision logic
are unit-tested with injected probes (`core/test/enclave.bringup.test.mjs`),
fail-closed paths included. What can only be exercised on a real Linux host is
the **live** side — an actual `runsc` container, an unsealed Vault, a real realm.
The kit is written so the first live run either goes green or names precisely
what did not. That boundary is why `verify` proves rather than reads.
