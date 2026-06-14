# Govern any agent — the AiGovOps MCP connector (#2)

Point any MCP client at the governed core and your agent's **effectful** actions
route through the Yes-Gate, leaving a signed receipt for each one:

```
propose → human decide → brokered scoped token → sandboxed run → verify
```

The core is **dependency-free** — no `npm install`, just Node ≥ 20.

## Tools the connector exposes

| Tool | What it does |
|------|--------------|
| `gov_propose` | submit an intent; returns a pendingId + whether it needs a human gate |
| `gov_decide` | a human approves/denies; approve brokers a scoped, expiring token |
| `gov_run_tool` | run code in the sandbox — **requires** a valid brokered token (fails closed) |
| `gov_verify` | verify the whole ledger (signatures + hash chain) |
| `gov_status` | confirm you're actually governed: principal role, ledger state, model tier |
| `skills_list` / `skills_run` | the governed skills registry |
| `oversight_view` | role-scoped ledger view for this server's principal |
| `agent_dispatch` / `agent_list` | the named library agents (propose-only) |

## Install

### Claude Code
```bash
claude mcp add aigovops-governed-core -- node /ABS/PATH/core/scripts/mcp-server.mjs
```

### Claude Desktop / Cursor / generic MCP client
Copy `mcp.json` into your client's MCP config, replacing `<ABS_PATH>` with the
absolute path to this repo. Or run it directly:
```bash
cd core && npm run mcp        # speaks MCP (JSON-RPC 2.0) on stdio
```

## Identity & trust

The stdio server is a **single trusted principal**, resolved server-side from its
launch env — never from a tool argument a caller could forge:

- default: a **member** (`AIGOV_MCP_ROLE` unset) — sees only its own effects;
- **steward**: set `AIGOV_MCP_ROLE=steward` (or match `STEWARD_TOKEN` via
  `AIGOV_MCP_STEWARD`) — sees all receipts, can approve.

For a **networked, multi-tenant** deployment, use the HTTP governed API instead
(`core/src/server.js`: `/api/gov/*`, bearer token or OIDC session), where each
caller's identity is resolved per-request. That path carries real OIDC roles
(see Ticket 8); the stdio connector is the zero-setup local option.

## What stays true no matter what

- An agent **never receives a raw secret** — only a short-lived scoped token.
- Anything irreversible **pauses for a human**; deny brokers nothing.
- Every action is a **signed, metadata-only** receipt — no prompts, no payloads.
- A steward can arm the **global kill switch** and halt the loop.
