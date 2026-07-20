# AiGovOps Library — `v1` (Ken & Bob, June 2026)

> **One governed core that runs anywhere — laptop, container, VPS, or the canonical cloud.**
> The center of truth for the community, convening wherever it's invited, always in your language.
>
> _"Agents do the bureaucracy; humans hold the meaning — and humans hold the keys."_

This is the **starter scaffold** for the architecture blueprint: a small, real,
**dependency-free** Node 20+ core you can run today. It signs metadata-only
[Beacon](#beacon) receipts, turns a problem into [Yes-Gates](#polic--yes-gate),
and speaks more than one language out of the box. It is intentionally minimal —
the skeleton onto which the full system is grown.

---

## Quickstart

```bash
# Option A — Docker (the "same image, three lives" path)
cp .env.example .env
docker compose up
# → http://localhost:8787   (the Front Desk room)

# Option B — bare Node 20+
cp .env.example .env
npm start            # or: pnpm start
```

First boot generates a local Ed25519 dev keypair in `./keys` (gitignored). In
production these come from a KMS / secret store via env — **the private key never
leaves the core and never touches any client.**

```bash
npm test                 # unit tests: sign/verify, tamper-detection, policy
npm run verify           # walk the ledger: every signature + the hash-chain
node scripts/keygen.mjs  # (re)generate a keypair into ./keys
```

---

## What's here, mapped to the blueprint

| Blueprint section | File | What it does in v1 |
|---|---|---|
| **03 · Gateway** | `src/server.js` | One front door: CORS allow-list, rate-limit, locale negotiation, routes. No keys in any client. |
| **03 · Policy / Yes-Gate** | `src/core/policy.js` | Pure functions: a problem → gates carrying **Get → Stay → Recover to Yes**. |
| **03 · Lantern** | `src/core/lantern.js` | Frameworks → controls (9 built-in; the real Lantern compiles the full library). |
| **03 · Beacon** | `src/core/beacon.js` | Ed25519 + canonical JSON + append-only NDJSON ledger. **Metadata only, no payloads.** |
| **05 · Agent runtime** | `src/core/agent.js` | Propose-not-execute: irreversible intents return a proposal for a human gate. |
| **03 · Model router** | `src/core/router.js` | Local/cheap default, cloud opt-in, cached "Yes". (Local stub in v1.) |
| **03 · Identity** | `src/core/identity.js` | The reversible capability dial (read → propose → auto-within-caps). |
| **11 · i18n** | `src/core/i18n.js`, `src/i18n/*` | English-first, never English-only. `en` + `es` shipped; negotiated from `Accept-Language`. |
| **04 · Front Desk room** | `public/index.html` | A real room that calls the same-origin gateway and shows a signed answer. |
| **02 · Deploy** | `Dockerfile`, `compose.yml`, `.env.example` | Same image; only the env differs across local / VPS / canonical. |
| **13 · CI gate** | `.github/workflows/ci.yml` | Tests run on every push — the hook where Cloud-Mary plugs in. |

---

## Endpoints

| Method | Path | Room / purpose |
|---|---|---|
| `GET` | `/status` | Health, ledger count, key id, framework count |
| `GET` | `/` | The **Front Desk** room (static) |
| `POST` | `/api/ask` | Ask anything → answer + signed receipt _(body: `{question}`)_ |
| `POST` | `/api/assess` | **Reading Room**: a problem → risk, gates, path to Yes _(body: `{problem}`)_ |
| `POST` | `/api/propose` | Agent proposal demo (propose-not-execute) _(body: `{intent}`)_ |
| `GET` | `/api/verify` | Verify every signature + the hash-chain |
| `GET` | `/beacon/pubkey` | The public key, so **anyone** can verify our receipts |

Locale follows `Accept-Language` (try `-H 'Accept-Language: es'`).

---

## <a name="beacon"></a>Verify a receipt with nothing but `openssl`

Trust is cryptographic, not promissory. Any receipt is verifiable offline:

```bash
# (the verify-ledger script shows the canonical message + signature handling)
openssl pkeyutl -verify -pubin -inkey keys/public.pem \
  -rawin -in message.bin -sigfile signature.bin
# → Signature Verified Successfully
```

Receipts are **metadata-only**: the fact and shape of an action (kind, actor,
gate, model, locale, a content *hash*) — never the prompt, document, or PII.

---

## Principles, enforced in code, not prose

- **Local-first & private by default.** `ALLOW_CLOUD=false`; nothing leaves the machine unless you opt in.
- **No keys in the client.** The browser talks only to the gateway; credentials stay in the core.
- **Propose-not-execute.** Irreversible effects pause for a human gate (`src/core/agent.js`).
- **The receipt is the unit of truth.** Append-only, signed, chained, exportable.
- **English-first, global-always.** The agent and UI speak the member's language.

---

## ⚠️ The irreversibility boundary (for us, too)

Configs, values, and verification are prepared and checked in advance — but
**the irreversible clicks on live infrastructure (creating this repo, the first
push, DNS, registrar, key enrollment, account creation) are made by Bob and Ken**,
after the risk is flagged. This scaffold ships with **no keys and an empty ledger**
on purpose.

---

## Next on the path (blueprint §13)

1. Swap the simplified canonicalizer for a real **RFC 8785 (JCS)** library.
2. Wire the **OVERT 1.0** bundle format and the full **Lantern** framework library.
3. Replace the local model stub with **Ollama** + cloud opt-in routing.
4. Add **OIDC** identity and the federation adapters (web+voice → Telegram/Discord/email → MCP server).
5. Bring the other rooms (Reading Room, Makerspace, Commons, Human Library, Coffee Shop) onto the gateway.

_Apache-2.0 · no SaaS lock-in · the same container, everywhere._
