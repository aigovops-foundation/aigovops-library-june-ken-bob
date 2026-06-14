# Enclave Runbook — run it yourself, verify offline (Ticket 9)

The **enclave profile** is the hardened posture for a regulated org that must run
the governed core inside its own perimeter and prove, offline, that what it runs
is what we shipped. It is the strongest setting of every dial at once:

| Dial | Enclave setting | Ticket |
|------|-----------------|--------|
| Secrets | `SECRETS_PROFILE=enclave` → **Vault in perimeter** (no local secret file) | T2 |
| Sandbox | `SANDBOX_BACKEND=gvisor` → **kernel-level isolation** (no app-level bypass) | T4 |
| Egress | **deny-all** by default; tools reach only declared hosts via the proxy | T4 |
| Models | `ALLOW_CLOUD=false` → **internal models only**; no prompt/content leaves | router |
| Policy | `POLICY_ENGINE=opa` → Yes-Gate rules as **signed rego bundles** | T7 |
| Identity | OIDC against an **in-perimeter IdP** (e.g. Keycloak) | T8 |
| Storage | `DATABASE_URL` → **in-VPC Postgres**; the ledger has a durable home | storage |

## 1. Preflight — fail closed under a weak posture

`core/src/core/enclave.js` exposes `enclavePreflight(env)` and `assertEnclave(env)`.
Call `assertEnclave()` at boot in an enclave: the process **refuses to serve** if
any dial is weaker than the table above, naming the offending check. Copy
`core/profiles/enclave.env.example` to your secret store and fill it in.

## 2. The "verify-offline" package

Two signed artifacts ship with every release, both verifiable with **no network,
no npm, and no AiGovOps code**:

- **SBOM** — `npm run sbom` writes a CycloneDX 1.5 bill of materials. The core is
  dependency-free, so it asserts **zero third-party runtime components** — there is
  no supply chain to audit.
- **Signed release** — `npm run release` writes `release/` containing
  `MANIFEST.json` (every source file + its SHA-256 and the SBOM hash),
  `MANIFEST.sig.json` (the Ed25519 signature), `public-key.pem` (the published
  verification key), `sbom.cdx.json`, and `verify.mjs`.

On the air-gapped host:

```bash
node release/verify.mjs            # checks the Ed25519 signature + every file hash
```

It prints `signature OK — files checked N mismatches 0` when the release is
authentic and unmodified. A single changed byte in any source file is reported as
`MODIFIED <path>`.

## 3. Verify the ledger offline (Ticket 10)

`npm run export:evidence` packages the whole signed ledger into
`evidence-bundle/` with `verify.sh` (OpenSSL 3.x) and `verify.mjs` (Node anywhere)
and the published `public-key.pem`. An auditor checks every Ed25519 receipt
signature and the append-only hash chain with `openssl` alone — see the bundle's
README.

## Status / known limitation

The package, the preflight, the SBOM, and the offline signature verification are
implemented and tested on any host. The one thing that can only be exercised on a
**Linux enclave host** is the gVisor *run* path (`runsc` is Linux-only) — on a dev
laptop the sandbox factory fails closed to the ProcessSandbox fallback (logged).
Stand the enclave up on Linux with Docker + the runsc runtime, Vault, an OIDC IdP
(Keycloak), and in-VPC Postgres to exercise the full air-gapped loop end to end.
