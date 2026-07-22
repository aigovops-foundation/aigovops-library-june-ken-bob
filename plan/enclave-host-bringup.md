# Enclave Host Bring-Up — from a bare Linux VM to ENCLAVE GREEN

This is the operator's runbook for standing up a **Linux enclave host** running
the full governed core: Docker with gVisor, HashiCorp Vault, Keycloak, Postgres,
and the `opa` binary, with every dial at its hardened setting.

`plan/enclave-runbook.md` explains *what the enclave profile is* and how to
verify a release offline. **This** document is the hands-on bring-up: what to
install, in what order, and precisely which five moves stay human.

The design goal of the kit is one sentence: **when you sit down, everything
reversible is already done.** You perform the credential steps, nothing else.

---

## 0. Why a real Linux host

Every other dial can be exercised on a laptop. gVisor cannot. `runsc` is a
userspace kernel that implements Linux syscalls, and it is Linux-only — on macOS
the sandbox factory falls back to `ProcessSandbox` and *says so*. That fallback
honours the same contract at the application level, but it is bypassable by a
named ESM import (documented in `sandbox.process.js`). Kernel-level enforcement
is the whole reason the enclave profile exists, so the enclave needs a kernel.

### Sizing

|          | Minimum | Comfortable | Why |
|----------|---------|-------------|-----|
| vCPU     | 2       | 4           | Keycloak + Postgres + Vault + the core, plus a sandbox per tool run |
| RAM      | 4 GB    | 8 GB        | Keycloak in prod mode is the heavy tenant (~1 GB) |
| Disk     | 40 GB   | 80 GB SSD   | container images ~6 GB; the rest is ledger + Postgres growth |
| OS       | Ubuntu 22.04 / 24.04 LTS | same | the installer targets apt + the HashiCorp repo |

Nested virtualisation is **not** required — gVisor intercepts syscalls in
userspace rather than running a VM. A standard cloud droplet is enough. What you
cannot use is a shared container host that denies you a real kernel and
`/proc` control, because `runsc install` must register a Docker runtime.

### What each component unlocks

| Component | Dial it turns green | What you actually gain |
|-----------|--------------------|------------------------|
| **Vault** | `SECRETS_PROFILE=enclave` (**T2**) | The broker mints short-lived, per-scope child tokens. An agent never receives a raw secret, and revocation is immediate and by accessor. |
| **Docker + gVisor** | `SANDBOX_BACKEND=gvisor` (**T4**) | Tools run under a guest kernel: read-only rootfs, one writable scratch tmpfs, egress only through the declared proxy, seccomp default-deny on process spawning. This is what makes **mutation tools** safe to run at all. |
| **opa** | `POLICY_ENGINE=opa` (**T7**) | The Yes-Gate rule becomes reviewable rego shipped as a Beacon-signed bundle, so a policy change is an auditable diff instead of a code edit. |
| **Keycloak** | OIDC live (**T8**) | Real identity, and the `steward` group becomes the thing that scopes every oversight view. Per-member onboarding becomes possible. |
| **Postgres** | `DATABASE_URL` set | The ledger gets a durable, multi-writer home with in-transaction chain linking, instead of a single-host NDJSON file. |

---

## 1. Prerequisites

On your machine: SSH access to the host, and this repo. On the host: Ubuntu LTS,
a sudo-capable user, and outbound network access for the install phase (an
air-gapped install needs the packages mirrored first — see §7).

Decide two names before you start, because they appear in the rendered config
and in the Keycloak client:

- **`ENCLAVE_HOST`** — where the console is reached, e.g. `console.internal`
- **`VAULT_ADDR`** — where Vault listens, e.g. `https://vault.internal:8200`

---

## 2. The automated pass

Clone and run the orchestrator. It chains every reversible step and stops
cleanly at each human gate with an `ACTION REQUIRED` block.

```bash
git clone <this repo> /opt/aigovops && cd /opt/aigovops
bash deploy/enclave/enclave-up.sh
```

Phases, in order: `preflight → components → render → vault → keycloak →
postgres → core → verify`. The run is **idempotent and resumable** — a state
file records finished phases, so re-running skips what is done and
`--from vault` picks up mid-way. Every phase is a no-op when already satisfied.

You can also drive the pieces individually:

```bash
cd core && npm run enclave:preflight        # what's missing on this host?
sudo bash deploy/enclave/install-components.sh   # install it (idempotent)
sudo bash deploy/enclave/install-components.sh --check   # report only, change nothing
bash deploy/enclave/render-env.sh           # write deploy/enclave/enclave.env
cd core && npm run enclave:verify           # prove every dial flipped green
```

### 2a. Preflight — what's missing

`npm run enclave:preflight` probes every component and prints two tables: the
binaries present on the host, and the env posture from `enclave.js`. It is
**fail-closed** — a probe that errors, times out, or returns nothing counts as
absent, never as present. It exits non-zero if anything required is missing, so
it composes into CI. `--json` gives the machine-readable form the shell kit uses.

A component missing from the first table also prints *what capability you do not
yet have*, so the gap is never just a missing binary — it is a named lost dial.

### 2b. Component install

`install-components.sh` installs Node 20, Docker, gVisor (`runsc`, plus
registering it as a Docker runtime), Vault from the HashiCorp apt repo, the
`opa` release binary, the Postgres client and server, and pulls the Keycloak
image. Each step is guarded by a presence test, so re-running changes nothing.
The gVisor download is **checksum-verified** (`sha512sum -c`) before install.

It refuses to pretend on a non-Linux host: on macOS it drops to check-mode and
tells you to run it on the enclave host, rather than reporting a success it did
not achieve.

### 2c. Render the config

`render-env.sh` writes `deploy/enclave/enclave.env` from the template, using the
core's own `renderTemplate()` — which is **fail-closed**: an unresolved or empty
`${VAR}` is an error, not a silently-empty config line. That matters because an
empty `VAULT_ADDR` or `OIDC_ISSUER` is precisely the kind of blank that fails
*open*.

The rendered file contains **no secrets**. The four secret lines are left
commented for you to paste on the host. It is written mode `600`, it is
gitignored (`deploy/enclave/*.env`), and re-rendering **refuses to clobber** a
file that already carries pasted secrets unless you pass `--force`.

---

## 3. The human steps

Five moves, roughly 25 minutes, all of them irreversible or credential-creating.
They live in **`deploy/enclave/HUMAN-STEPS.md`** with exact commands and paste
targets. In summary:

1. **Provision the VM** — it spends money.
2. **`vault operator init` + unseal** — mints the root of trust. Happens once;
   the five unseal keys and root token cannot be recovered if lost. You paste an
   **app token** (never the root token) into `enclave.env`.
3. **Keycloak realm + `aigov-console` client** — copy the client secret. Then
   per-member: create the account, set the password, join `steward`.
4. **Postgres role + database** — you choose the password.
5. **`SESSION_SECRET` + `STEWARD_TOKEN`** — `openssl rand -hex 32` each.

Every one of these either creates a credential, creates an account, or changes
access control. That is exactly the set an agent must not perform — not as a
formality, but because it is the governance principle of this project applied to
its own tooling.

> **Secret discipline.** Each value goes to your password manager and into
> `enclave.env` **on the host**. Never into this repo, never into chat, never
> pasted back to an agent. `.gitignore` covers the rendered env, but the
> discipline is yours; the tool only makes the right thing easy.

---

## 4. Verify — proof, not configuration

```bash
cd core && npm run enclave:verify
```

This is the part that matters, and it is deliberately not a config read. Reading
`SANDBOX_BACKEND=gvisor` from a file proves only that someone typed it. Each
check exercises the real thing:

| Check | The actual proof |
|-------|------------------|
| **gVisor enforcing** | Runs a container with `--runtime=runsc` and reads `dmesg`. Inside gVisor the guest kernel *is* gVisor and says so. A runc fallback prints the host kernel instead, so this cannot pass by accident — it is the check that catches a silent fallback. |
| **Vault serving** | `/v1/sys/health` must report `initialized: true, sealed: false`. A sealed Vault fails. |
| **opa evaluating** | Feeds the intent *"publish the report"* to the **shipped rego** and requires the decision to come back `irreversible: true, requiresHumanGate: true` — i.e. rego agreeing with the JS engine on the one rule that has two implementations. |
| **OIDC discovery** | Fetches `/.well-known/openid-configuration` and requires `issuer` to **equal** `OIDC_ISSUER`. A mismatch (a misconfigured or hijacked redirect target) fails. |
| **Postgres ledger** | Round-trips a real row through the same `aigov_ledger` table `PgStore` uses — create, insert, delete — proving write access, not just connectivity. |

Plus the `enclave.js` posture check, so both halves must agree. Everything is
fail-closed: a probe that throws is a failed check, never a passing one.

Success looks like:

```
ENCLAVE GREEN — T2 Vault · T4 gVisor · T7 rego · T8 OIDC · durable ledger
```

Anything red names the exact dial that is not yet enforcing.

---

## 5. Start the core

```bash
cd core && set -a && . ../deploy/enclave/enclave.env && set +a && npm start
```

Or via compose:

```bash
docker compose --env-file deploy/enclave/enclave.env -f deploy/docker-compose.yml up -d
```

Call `assertEnclave()` at boot in a real enclave: the process **refuses to
serve** if any dial is weaker than the profile demands, naming the offending
check.

---

## 6. The one optional dependency

The Postgres ledger path needs `pg`:

```bash
cd core && npm i pg
```

`pg` is deliberately **not** in `core/package.json`. The core ships
dependency-free — `dependencies: {}` — so the SBOM can assert *zero third-party
runtime components* and there is no supply chain to audit. Postgres is opt-in
per `core/src/core/storage.js`, and a test in `enclave.bringup.test.mjs` asserts
the kit never adds a runtime dependency.

Without `pg`, everything else still works; the ledger stays on the file store.

---

## 7. Air-gapped notes

The install phase is the only step needing egress. For a genuinely air-gapped
enclave, mirror the gVisor release binaries, the HashiCorp apt repo, the `opa`
binary, and the Keycloak image to an internal registry first, then point the
installer at them (`KEYCLOAK_IMAGE`, `OPA_VERSION` are already overridable).

After bring-up the enclave needs no egress at all: `ALLOW_CLOUD=false` keeps
models internal, and `SANDBOX_DEFAULT_EGRESS` is empty (deny-all), so tools
reach only the hosts they declare per run, via the proxy.

Verify the release itself offline with `node release/verify.mjs` and the ledger
with the evidence bundle's `verify.sh` — neither needs network, npm, or any
AiGovOps code. See `plan/enclave-runbook.md` §2–3.

---

## 8. How long it takes

| Phase | Time | Who |
|-------|------|-----|
| Provision the VM | ~5 min | human |
| Component install | ~10 min | automated |
| Render config | instant | automated |
| Vault init + unseal + policy | ~6 min | human |
| Keycloak realm + client | ~7 min | human |
| Postgres role + db | ~3 min | human |
| Core secrets | ~2 min | human |
| Start + verify | ~2 min | automated |

**~35 minutes end to end, of which ~23 are genuinely human.** The rest is the
kit. Per-member onboarding after that is about a minute each.

---

## 9. What is proven here, and what is not

Honest scope, because overclaiming here would be the worst kind of error:

- The preflight logic, the template rendering, and every runtime check's
  decision logic are **unit-tested with injected probes**
  (`core/test/enclave.bringup.test.mjs`), including the fail-closed paths — a
  runc fallback, a sealed Vault, rego disagreeing, an issuer mismatch, a
  throwing probe.
- The shell scripts are syntax-checked and their check-modes run clean.
- What can only be exercised on a real Linux enclave host is the **live** side:
  an actual `runsc` container, an actual unsealed Vault, an actual realm. The
  kit is written so that the first time those run for real, they either go green
  or name precisely what did not.

That boundary is the reason `verify` proves rather than reads.
