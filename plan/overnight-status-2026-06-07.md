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

## ▶ Phases 2–5 — plan (what's buildable vs needs you)

I stopped after Phase 1 on purpose: 2–5 carry product/design choices, and I won't push
speculative half-built subsystems to `main` unreviewed. Prioritized next:

- **Phase 2 · Real agents** — an agent runtime that routes intent → named agent → skill
  through the gate, voiced via Ollama. *Buildable; one design call: how chatty/agentic.*
- **Phase 3 · Human interaction** — member UI ("rooms"), the **approval-queue** inbox
  (the human gate UX), and the **T6 live SSE oversight** dashboard. *Buildable; needs a
  little UI direction.*
- **Phase 4 · Reach** — channel adapters (Telegram/Discord/email/MCP) + i18n beyond en/es.
- **Phase 5 · Community/finance** — membership + finance **interface + stub** (no real
  money), Commons (publish signed workflows), Host. *Real payments need an account later.*
- **Carry-overs:** wire `beacon` → `storage.js` (careful, touches signing); T2 Vault,
  T4 gVisor, T7 OPA, T9 enclave; custom domain.

## Decisions to queue for the next session
- Agent runtime: how autonomous should agents be (propose-only vs act-within-caps)?
- Member UI: extend the Control Room, or a separate "rooms" frontend?
- Channels: which first — Telegram, web widget, email?
- Finance: confirm stub-only for now (you chose design+stub).
