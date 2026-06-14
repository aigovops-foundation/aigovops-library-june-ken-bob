#!/usr/bin/env bash
# install.sh — one-line installer for the AiGovOps governed-core MCP connector (#5).
# Adds the connector to Claude Code if the `claude` CLI is present; otherwise
# prints a ready-to-paste mcp.json with the absolute path filled in. Idempotent,
# reversible (`claude mcp remove aigovops-governed-core`), and needs NO account
# or credential.
#
# Usage:
#   bash core/connector/install.sh           # install into Claude Code, else print config
#   bash core/connector/install.sh --print   # only print the config, install nothing
set -euo pipefail

# Resolve the core/ dir from this script's location (connector/ -> ..).
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE="$(cd "$HERE/.." && pwd)"
SERVER="$CORE/scripts/mcp-server.mjs"
NAME="aigovops-governed-core"

if [ ! -f "$SERVER" ]; then echo "error: cannot find $SERVER" >&2; exit 1; fi
if ! command -v node >/dev/null 2>&1; then echo "error: Node.js >= 20 is required (node not found)" >&2; exit 1; fi

print_config() {
  cat <<JSON
{
  "mcpServers": {
    "$NAME": {
      "command": "node",
      "args": ["$SERVER"],
      "env": { "AIGOV_MCP_ROLE": "member", "KEYS_DIR": "$CORE/keys", "LEDGER_DIR": "$CORE/ledger" }
    }
  }
}
JSON
}

if [ "${1:-}" = "--print" ]; then print_config; exit 0; fi

if command -v claude >/dev/null 2>&1; then
  echo "Installing the $NAME MCP connector into Claude Code…"
  claude mcp add "$NAME" -- node "$SERVER"
  echo "Done. Your agent's effectful actions now route through the Yes-Gate."
  echo "Remove with:  claude mcp remove $NAME"
else
  echo "The 'claude' CLI was not found. Add this to your MCP client's config:"
  echo
  print_config
  echo
  echo "Or run the server directly:  cd \"$CORE\" && npm run mcp"
fi
