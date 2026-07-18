#!/usr/bin/env bash
# deploy/enclave/enclave-up.sh — bring up a Linux enclave host to the last
# irreversible click, then stop and hand Bob the keys.
#
# The project's rule, enforced in the bring-up itself:
#   automate everything reversible; the human makes the irreversible move.
#
#   bash deploy/enclave/enclave-up.sh              # all phases, pausing at each human gate
#   bash deploy/enclave/enclave-up.sh --status     # what's done so far
#   bash deploy/enclave/enclave-up.sh --from vault # resume from a phase
#   bash deploy/enclave/enclave-up.sh --only verify
#   bash deploy/enclave/enclave-up.sh --yes        # non-interactive (CI): never pauses,
#                                                  # stops at the first human gate instead
#
# IDEMPOTENT + RESUMABLE (a state file records finished phases).
# This script creates NO credentials, initialises NO Vault, creates NO realm or
# accounts, touches NO DNS. Each of those is an ACTION REQUIRED block.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
STATE="$HERE/.enclave-up.state"
PHASES=(preflight components render vault keycloak postgres core verify)
YES=0; FROM=""; ONLY=""

for a in "$@"; do case "$a" in
  --yes) YES=1 ;; --from) FROM="__next__" ;; --only) ONLY="__next__" ;;
  --status) [ -f "$STATE" ] && cat "$STATE" || echo "no phases completed yet"; exit 0 ;;
  preflight|components|render|vault|keycloak|postgres|core|verify)
     [ "$FROM" = "__next__" ] && FROM="$a"; [ "$ONLY" = "__next__" ] && ONLY="$a" ;;
esac; done

c_blue=$'\033[1;34m'; c_grn=$'\033[1;32m'; c_yel=$'\033[1;33m'; c_dim=$'\033[2m'; c_off=$'\033[0m'
log()  { echo "${c_blue}▸${c_off} $*"; }
ok()   { echo "${c_grn}✅${c_off} $*"; }
warn() { echo "${c_yel}⚠${c_off}  $*"; }
have() { command -v "$1" >/dev/null 2>&1; }
done_phase() { grep -qx "$1" "$STATE" 2>/dev/null; }
mark_done()  { touch "$STATE"; grep -qx "$1" "$STATE" 2>/dev/null || echo "$1" >> "$STATE"; }

ENV_FILE="${ENCLAVE_ENV_OUT:-$HERE/enclave.env}"

# A human checkpoint: print exactly what only a human may do, then pause.
action_required() {
  echo; echo "${c_yel}┌─ ACTION REQUIRED (yours — the irreversible move) ───────────────${c_off}"
  while IFS= read -r line; do echo "${c_yel}│${c_off} $line"; done <<< "$1"
  echo "${c_yel}└─────────────────────────────────────────────────────────────────${c_off}"
  if [ "$YES" = "1" ] || [ ! -t 0 ]; then warn "non-interactive: not pausing — do the above, then re-run."; return 1; fi
  read -r -p "   Press Enter when done (or type 'skip'): " ans
  [ "$ans" = "skip" ] && { warn "skipped — re-run to continue."; return 1; }
  return 0
}

# Is a secret line present (non-empty) in the rendered env?
env_has() { [ -f "$ENV_FILE" ] && grep -qE "^$1=." "$ENV_FILE" 2>/dev/null; }

# Load the rendered config so the ACTION REQUIRED blocks quote the values THIS
# host is actually configured with, not the template defaults.
load_env() { [ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }; return 0; }

# --- phases -------------------------------------------------------------------

phase_preflight() {
  log "preflight — what does this host already have?"
  ( cd "$ROOT/core" && node scripts/enclave-preflight.mjs ) || warn "components missing (the next phase installs them)"
  ok "preflight reported"
}

phase_components() {
  log "components — install runsc, Vault, opa, Postgres, Keycloak image (reversible)"
  if [ "$(uname -s)" != "Linux" ]; then
    warn "not Linux — skipping install (gVisor is Linux-only). Run this on the enclave host."
    return 0
  fi
  if [ "$(id -u)" != "0" ]; then
    action_required "Component install needs root. Run:
  sudo bash deploy/enclave/install-components.sh" || return 1
  else
    bash "$HERE/install-components.sh"
  fi
  ok "components in place"
}

phase_render() {
  log "render — the enclave config (no secrets)"
  bash "$HERE/render-env.sh"
  ok "rendered $ENV_FILE"
}

phase_vault() {
  load_env
  log "vault — server up; init/unseal is yours"
  # Starting a dev-less server is reversible; INITIALISING it is not (it mints
  # the unseal keys + root token, which must never touch this repo).
  if have vault && curl -sS --max-time 5 "${VAULT_ADDR:-http://127.0.0.1:8200}/v1/sys/health" >/dev/null 2>&1; then
    ok "vault is already answering"
  else
    warn "vault not answering at ${VAULT_ADDR:-http://127.0.0.1:8200}"
  fi
  if env_has VAULT_TOKEN; then ok "VAULT_TOKEN present in $ENV_FILE"; return 0; fi
  action_required "Initialise + unseal Vault, then paste an APP token (never the root token):

  vault operator init -key-shares=5 -key-threshold=3     # ← writes 5 unseal keys + root token
  vault operator unseal   (x3, different keys)
  vault login <root-token>
  vault secrets enable -path=secret kv-v2
  vault policy write aigov - <<'EOF'
  path \"secret/data/aigov/*\" { capabilities = [\"read\",\"create\",\"update\"] }
  path \"auth/token/create\"   { capabilities = [\"update\"] }
  EOF
  vault token create -policy=aigov -period=768h -field=token

  Paste that LAST value into $ENV_FILE as:  VAULT_TOKEN=<token>

  The 5 unseal keys + root token go in your password manager. NEVER in this
  repo, never in chat, never in a file under $ROOT." || return 1
  ok "vault step acknowledged"
}

phase_keycloak() {
  load_env
  log "keycloak — realm + client are yours (they mint a secret)"
  if env_has OIDC_CLIENT_SECRET; then ok "OIDC_CLIENT_SECRET present in $ENV_FILE"; return 0; fi
  action_required "Create the realm + OIDC client and copy its secret:

  1. Start Keycloak (prod mode, Postgres-backed):
       docker compose -f deploy/docker-compose.keycloak-prod.yml up -d
  2. Open the admin console, sign in as admin.
  3. Create realm:  aigovops
  4. Clients → Create:  aigov-console
       Client authentication: ON   (confidential)
       Valid redirect URIs:  ${OIDC_REDIRECT_URI:-https://console.internal/auth/oidc/callback}
  5. Groups → Create:  steward
  6. Clients → aigov-console → Credentials → copy the Client secret

  Paste it into $ENV_FILE as:  OIDC_CLIENT_SECRET=<secret>

  Then create each member's account and join them to 'steward'. Account
  creation and group membership are access-control moves — yours alone." || return 1
  ok "keycloak step acknowledged"
}

phase_postgres() {
  load_env
  log "postgres — durable ledger home"
  if ! env_has DATABASE_URL; then warn "DATABASE_URL not set in $ENV_FILE"; fi
  # Creating the role/db with a password is a credential move.
  action_required "Create the database + role (choose the password yourself):

  sudo -u postgres psql -c \"CREATE ROLE aigov LOGIN PASSWORD '<choose-one>';\"
  sudo -u postgres psql -c \"CREATE DATABASE aigov OWNER aigov;\"

  Then set the full URL in $ENV_FILE:
    DATABASE_URL=postgres://aigov:<password>@<host>:5432/aigov

  The Postgres ledger path needs the one optional dependency:
    cd core && npm i pg          # deliberately NOT in package.json —
                                 # the core stays dependency-free by default" || return 1
  ok "postgres step acknowledged"
}

phase_core() {
  log "core — start the governed core against the enclave env"
  [ -f "$ENV_FILE" ] || { warn "no $ENV_FILE — run the render phase first"; return 1; }
  for k in VAULT_TOKEN OIDC_CLIENT_SECRET SESSION_SECRET STEWARD_TOKEN; do
    env_has "$k" || warn "$k not yet set in $ENV_FILE (the core will fail closed without it)"
  done
  log "start it with:"
  echo "    ${c_dim}cd core && set -a && . $ENV_FILE && set +a && npm start${c_off}"
  echo "    ${c_dim}(or: docker compose --env-file $ENV_FILE -f deploy/docker-compose.yml up -d)${c_off}"
  ok "core start command ready"
}

phase_verify() {
  log "verify — prove every dial actually flipped green"
  load_env
  ( cd "$ROOT/core" && node scripts/enclave-verify.mjs )
  ok "enclave verified GREEN"
}

# --- run ----------------------------------------------------------------------
echo
echo "${c_blue}AiGovOps — enclave host bring-up${c_off}"
echo "${c_dim}automate everything reversible; the human makes the irreversible move${c_off}"
echo

started=0
for p in "${PHASES[@]}"; do
  [ -n "$ONLY" ] && [ "$ONLY" != "$p" ] && continue
  if [ -n "$FROM" ] && [ "$started" = "0" ]; then
    [ "$FROM" = "$p" ] && started=1 || continue
  fi
  if [ -z "$ONLY" ] && done_phase "$p"; then ok "phase '$p' already done ${c_dim}(--only $p to redo)${c_off}"; continue; fi
  echo
  if "phase_$p"; then mark_done "$p"; else
    echo; warn "stopped at phase '$p' — finish the ACTION REQUIRED above, then re-run:"
    echo "    bash deploy/enclave/enclave-up.sh --from $p"
    exit 1
  fi
done

echo
ok "enclave bring-up complete"
echo "${c_dim}human checklist: deploy/enclave/HUMAN-STEPS.md · runbook: plan/enclave-host-bringup.md${c_off}"
