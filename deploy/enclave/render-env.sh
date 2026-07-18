#!/usr/bin/env bash
# deploy/enclave/render-env.sh — render the enclave config from the template.
#
#   bash deploy/enclave/render-env.sh                      # render with defaults
#   ENCLAVE_HOST=id.internal bash deploy/enclave/render-env.sh
#   bash deploy/enclave/render-env.sh --print              # stdout, write nothing
#
# Writes deploy/enclave/enclave.env (gitignored). Contains NO secrets — it leaves
# the four secret lines commented for the human to paste on the host.
# IDEMPOTENT: re-rendering overwrites only the generated file, and refuses to
# clobber one that already carries pasted secrets unless --force.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
TMPL="$HERE/templates/enclave.env.tmpl"
OUT="${ENCLAVE_ENV_OUT:-$HERE/enclave.env}"
PRINT=0; FORCE=0
for a in "$@"; do case "$a" in --print) PRINT=1 ;; --force) FORCE=1 ;; esac; done

c_grn=$'\033[1;32m'; c_yel=$'\033[1;33m'; c_dim=$'\033[2m'; c_off=$'\033[0m'
ok()   { echo "${c_grn}✅${c_off} $*"; }
warn() { echo "${c_yel}⚠${c_off}  $*"; }

# --- the variables ------------------------------------------------------------
# Every one is public config with a safe in-perimeter default. Override any by
# exporting it before running.
export ENCLAVE_HOST="${ENCLAVE_HOST:-console.internal}"
export VAULT_ADDR="${VAULT_ADDR:-https://vault.internal:8200}"
export VAULT_KV_MOUNT="${VAULT_KV_MOUNT:-secret}"
export SANDBOX_IMAGE="${SANDBOX_IMAGE:-node:20-alpine}"
export SANDBOX_EGRESS_NET="${SANDBOX_EGRESS_NET:-aigov-egress}"
export POLICY_DIR="${POLICY_DIR:-/app/core/policy}"
export OIDC_ISSUER="${OIDC_ISSUER:-https://id.internal/realms/aigovops}"
export OIDC_CLIENT_ID="${OIDC_CLIENT_ID:-aigov-console}"
export OIDC_REDIRECT_URI="${OIDC_REDIRECT_URI:-https://${ENCLAVE_HOST}/auth/oidc/callback}"
export OIDC_STEWARD_GROUP="${OIDC_STEWARD_GROUP:-steward}"
export DATABASE_URL="${DATABASE_URL:-postgres://aigov@db.internal:5432/aigov}"
export PORT="${PORT:-8787}"
export LEDGER_DIR="${LEDGER_DIR:-/app/core/ledger}"
export KEYS_DIR="${KEYS_DIR:-/app/core/keys}"

[ -f "$TMPL" ] || { warn "template missing: $TMPL"; exit 1; }

# Render with the core's fail-closed renderer: an unresolved ${VAR} is an ERROR,
# never a silently-empty config value (an empty VAULT_ADDR would fail open).
render() {
  node --input-type=module -e '
    import fs from "node:fs";
    const { renderTemplate } = await import(process.argv[1]);
    const tmpl = fs.readFileSync(process.argv[2], "utf8");
    process.stdout.write(renderTemplate(tmpl, process.env));
  ' "$ROOT/core/src/core/enclave.bringup.js" "$TMPL"
}

if [ "$PRINT" = "1" ]; then render; exit 0; fi

if [ -f "$OUT" ] && [ "$FORCE" != "1" ]; then
  if grep -qE '^(VAULT_TOKEN|OIDC_CLIENT_SECRET|SESSION_SECRET|STEWARD_TOKEN)=.' "$OUT" 2>/dev/null; then
    warn "$OUT already has pasted secrets — refusing to overwrite (use --force if you mean it)"
    exit 0
  fi
fi

render > "$OUT.tmp"
mv "$OUT.tmp" "$OUT"
chmod 600 "$OUT"
ok "rendered $OUT ${c_dim}(mode 600, no secrets)${c_off}"
echo
echo "${c_dim}The four secret lines are left commented. Paste them on the host per"
echo "deploy/enclave/HUMAN-STEPS.md — they must never enter this repo.${c_off}"
