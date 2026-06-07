# Overnight build status — 2026-06-07

Autonomous session toward "make the entire app live." Decisions you set: local
Ollama · GitHub OAuth · dual storage · close the open door · design-stub finance ·
push to main autonomously, stop at blockers.

## ✅ Shipped tonight — Phase 1 (the unlock), all tested + pushed

| Piece | What | Commit |
|---|---|---|
| **Auth (GitHub OAuth)** | `auth.js` — OAuth web flow + HMAC sessions; role from `STEWARDS`; **write endpoints now gated** (member: propose/skills/run; **steward: approve**); reads open; fail-closed | `63cc8c4` |
| **Ollama router** | `router.js` `respondAsync()` — real local model when reachable, deterministic stub otherwise (hosted stays heuristic, as chosen) | `f7ee1b2` |
| **Dual storage seam** | `storage.js` — FileStore (default, dep-free) + PgStore (opt-in, `pg`+`DATABASE_URL`) | `efe187a` |

Core tests: **78/78** green (added auth, router, storage suites). Everything is on
`main`; the **hosted Fly app still runs the pre-auth code until you redeploy**.

## 🔴 Do these to make Phase 1 *live* (your clicks — I can't)

1. **Create a GitHub OAuth app** (Settings → Developer settings → OAuth Apps):
   - Homepage `https://aigovops-library-core.fly.dev`, callback
     `https://aigovops-library-core.fly.dev/auth/callback`.
2. **Set Fly secrets + config:**
   ```
   fly secrets set -a aigovops-library-core \
     GITHUB_CLIENT_ID=… GITHUB_CLIENT_SECRET=… \
     SESSION_SECRET=$(openssl rand -hex 32) \
     STEWARDS=<your-gh-login>,<ken-gh-login> \
     OAUTH_REDIRECT_URI=https://aigovops-library-core.fly.dev/auth/callback
   ```
3. **Redeploy:** `fly deploy -a aigovops-library-core`.
   - After this, **hosted writes require GitHub sign-in** (the door is closed). Until
     `STEWARDS` is set, no one can *approve* — which is the safe default.
4. *(Optional)* **Postgres:** `fly postgres create` → `fly secrets set DATABASE_URL=…`
   (and add `pg` to deps) to flip storage to Postgres. *(Beacon→storage wiring is a
   daylight follow-up — see below.)*
5. *(Optional)* **Real model on the host:** Ollama needs GBs RAM — scale the VM or run
   Ollama elsewhere and set `OLLAMA_URL`. Local dev already gets real answers.

Locally right now: `cd core && AUTH_DISABLED=true npm start` keeps the console fully
open for you; real auth kicks in on the host.

## ▶ Phases 2–5 — LANDED (day session, decisions: propose-only · extend console · web widget · finance stub)

- **Phase 2 · Agents ✅** — `agents.js`: named staff route intent → skill, run it
  (read-only → receipt), and **always return a proposal (propose-only)**; reply voiced via
  Ollama. Surfaced at `/api/agent`, MCP `agent_dispatch`, and the console **Front desk**.
- **Phase 3 · Human interaction ✅** — **approval queue** (`/api/gov/pending` + console
  approve/deny, steward-gated) and **live SSE oversight** (`/api/oversight/stream`),
  role-scoped to the signed-in identity.
- **Phase 4 · Reach ✅** — embeddable **web widget** (`/widget.js`, `/widget`) calling the
  public `/api/ask`. (Telegram/email/i18n still open.)
- **Phase 5 · Community/finance ✅ (stub)** — `finance.js`: PLANS + PaymentProvider +
  StubProvider; membership/charge flows test green, **no real money**, metadata-only
  receipts. Real processor (Stripe) is a later, account-gated step.

Core tests: **85/85**. Everything pushed to `main`.

### Still open (carry-overs / need you)
- Wire `beacon` → `storage.js` (careful — touches the signing/chain core).
- Real **Ollama host** for the deployed app (local dev already real); **T2** Vault,
  **T4** gVisor, **T7** OPA, **T9** enclave; custom domain; Telegram/email channels.
- **Make it all live:** the deploy + GitHub OAuth steps in the checklist above.

## Decisions to queue for the next session
- Agent runtime: how autonomous should agents be (propose-only vs act-within-caps)?
- Member UI: extend the Control Room, or a separate "rooms" frontend?
- Channels: which first — Telegram, web widget, email?
- Finance: confirm stub-only for now (you chose design+stub).
