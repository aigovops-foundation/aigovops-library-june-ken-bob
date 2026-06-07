---
name: aigovops-library
description: "Call this AiGovOps Library governed core — run its skills (framework-map, security-privacy-review, accessibility-audit, status-report, monitor-and-alert, beacon-sign-evidence), drive the Yes-Gate loop (propose → human-decide → broker → sandboxed run → verify), read role-scoped oversight, start the local Control Room, or export an auditable evidence bundle. Trigger on: aigovops, the library, yes-gate, governed core, framework map / what regulations apply, sign a receipt / beacon, run a governed skill, control room, oversight ledger, evidence bundle."
metadata:
  version: 1.0.0
disable-model-invocation: false
---

You can drive **this** AiGovOps Library governed core. (Project-scoped copy — travels
with the repo. Paths are relative to the repo root; the core is in `core/`, dependency-free
Node ≥18, no `npm install` needed.)

What it is: a governed AI core — agents *propose*, humans *approve*, every effect is a
signed (Ed25519) metadata-only receipt in an append-only ledger. See `CLAUDE.md`,
`plan/agent-build-plan.md`, `plan/build-tickets.md`.

## Governance boundary (read first — non-negotiable)
Per `CLAUDE.md`: **prepare and propose; the human makes the irreversible move.** NEVER do
these autonomously — stop and ask: `git commit`/`push` to `main`, any deploy
(`fly deploy`/`fly apps create`), DNS, account/key creation, deletions. You MAY freely:
read, run skills, run the loop, run tests, start the local server, export evidence.

## How to call it (run from the repo)

### 1. Run a governed skill (most common)
```bash
cd core
node scripts/run-skill.mjs list                                  # ✓ = runnable
node scripts/run-skill.mjs run framework-map --input "<use case>"
node scripts/run-skill.mjs run security-privacy-review --input "<text>"   # secret/PII scan, blocks on a finding
node scripts/run-skill.mjs run accessibility-audit --input "<html>"       # static WCAG subset
node scripts/run-skill.mjs run status-report
node scripts/run-skill.mjs run monitor-and-alert
```
Each run emits a metadata-only receipt. `op-github-deploy` is human-gated and refuses to auto-run.

### 2. Drive the full Yes-Gate loop
```bash
cd core && node scripts/loop-demo.mjs    # propose → approve → sandboxed run → verify (prints the linked receipt trail)
```
For the broker/run-tool path: `cp core/secrets.local.example.json core/secrets.local.json` (gitignored).

### 3. Start the running app + interactive Control Room
```bash
cd core && npm start           # → http://localhost:8787   (or: docker compose up)
# open  http://localhost:8787/console
```
API: `GET /status`, `POST /api/assess {problem}`, `GET /api/skills`, `POST /api/skills/run {name,input}`,
`POST /api/gov/{propose,decide,run}`, `GET /api/oversight?role=steward|member`, `GET /api/verify`, `GET /beacon/pubkey`.

### 4. Verify / audit
```bash
cd core && npm run verify          # walk the ledger (signatures + chain)
cd core && npm run export:evidence # → evidence-bundle/ (verify.sh = OpenSSL 3.x, verify.mjs = Node anywhere)
```

### 5. Via MCP (Claude Desktop / any MCP client)
`core/scripts/mcp-server.mjs` exposes tools `skills_list`, `gov_propose`, `gov_decide`,
`gov_run_tool`, `gov_verify`, `oversight_view`. Prefer these in Desktop; prefer the CLI in a terminal.

### Tests
```bash
cd core && node --test
```

## Notes
- `core/keys`, `core/ledger/*.ndjson`, `core/secrets.local.json` are gitignored — never commit or print them.
- Roles: `steward` (sees all + kill switch) vs `member` (sees only own). Identity is an anon stub until OIDC (Ticket 8).
- Hosting is prepared (`fly.toml`, `DEPLOY.md`) but **deploy is the human's click** — give the commands, don't run them.
