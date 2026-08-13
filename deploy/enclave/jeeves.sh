#!/usr/bin/env bash
# deploy/enclave/jeeves.sh — the MANAGED enclave standup, at your service.
#
# Jeeves is enclave-up.sh's 1Password-brokered sibling. It stands up the full
# governed enclave (Docker+gVisor, Keycloak, Postgres, opa, the core) with the
# secrets broker pointed at a 1Password vault instead of a hand-initialised
# HashiCorp Vault. That single swap removes the worst human step — no
# `vault operator init`, no five unseal keys — and collapses the credential work
# to ONE paste: a 1Password service-account token.
#
#   bash deploy/enclave/jeeves.sh              # all phases, pausing at each human gate
#   bash deploy/enclave/jeeves.sh --status     # what's done so far
#   bash deploy/enclave/jeeves.sh --from keycloak
#   bash deploy/enclave/jeeves.sh --only verify
#   bash deploy/enclave/jeeves.sh --yes        # non-interactive (CI): never pauses
#
# The project's rule, enforced in the standup itself:
#   automate everything reversible; the human makes the irreversible move.
# Jeeves creates NO accounts, mints NO service-account token, types NO password,
# clicks NO final "create". Each of those is an ACTION REQUIRED block with the
# exact console URL and copy-paste values. For the browser half, the `jeeves`
# agent (.claude/agents/jeeves.md) can drive Chrome to each page and pause for
# your click — it still never enters the credential.
#
# TRADEOFF, STATED PLAINLY: 1Password is a cloud store, so this posture is NOT
# air-gapped. For a regulated, offline-verify enclave use enclave-up.sh (Vault).
# IDEMPOTENT + RESUMABLE: a state file records finished phases.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
STATE="$HERE/.jeeves.state"
PHASES=(preflight components onepassword render keycloak postgres core verify)
YES=0; FROM=""; ONLY=""

for a in "$@"; do case "$a" in
  --yes) YES=1 ;; --from) FROM="__next__" ;; --only) ONLY="__next__" ;;
  --status) [ -f "$STATE" ] && cat "$STATE" || echo "no phases completed yet"; exit 0 ;;
  preflight|components|onepassword|render|keycloak|postgres|core|verify)
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
OP_VAULT="${OP_VAULT:-AiGovOps}"

# A human checkpoint: print exactly what only a human may do, then pause.
action_required() {
  echo; echo "${c_yel}┌─ ACTION REQUIRED (yours — the irreversible move) ───────────────${c_off}"
  while IFS= read -r line; do echo "${c_yel}│${c_off} $line"; done <<< "$1"
  echo "${c_yel}└─ ${c_dim}tip: the 'jeeves' agent can drive the browser to this exact page${c_off}${c_yel} ─${c_off}"
  if [ "$YES" = "1" ] || [ ! -t 0 ]; then warn "non-interactive: not pausing — do the above, then re-run."; return 1; fi
  read -r -p "   Press Enter when done (or type 'skip'): " ans
  [ "$ans" = "skip" ] && { warn "skipped — re-run to continue."; return 1; }
  return 0
}

env_has() { [ -f "$ENV_FILE" ] && grep -qE "^$1=." "$ENV_FILE" 2>/dev/null; }
op_ready() { have op && [ -n "${OP_SERVICE_ACCOUNT_TOKEN:-}" ] && op whoami >/dev/null 2>&1; }

# --- phases -------------------------------------------------------------------

phase_preflight() {
  log "preflight — what does this host already have?"
  ( cd "$ROOT/core" && node scripts/enclave-preflight.mjs ) || warn "components missing (the next phase installs them)"
  ok "preflight reported"
}

phase_components() {
  log "components — install runsc, opa, Postgres, Keycloak image, op (reversible)"
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
  have op || action_required "Install the 1Password CLI 'op' — https://developer.1password.com/docs/cli/get-started" || return 1
  ok "components in place"
}

phase_onepassword() {
  log "1Password — the broker vault + a service account (this replaces Vault)"
  if ! have op; then action_required "Install the 1Password CLI 'op' first (see components phase)." || return 1; fi
  # Provision the vault + items (self-owned secrets generated; external ones as
  # placeholders). This needs an interactive/automatable op session.
  if op whoami >/dev/null 2>&1; then
    bash "$ROOT/deploy/provision/1-onepassword.sh"
    ok "vault '$OP_VAULT' provisioned (items created / left intact)"
  else
    action_required "Sign in to 1Password so 'op' can create the '$OP_VAULT' vault + items:
  • interactive:  op signin
  • then re-run:  bash deploy/enclave/jeeves.sh --from onepassword
This creates the vault and generates the self-owned secrets (session, steward
token). It never overwrites a secret you've already set." || return 1
  fi
  # The ONE credential paste: a service-account token for non-interactive boot.
  if op_ready; then ok "service account authenticated (op whoami)"; return 0; fi
  action_required "Create a 1Password SERVICE ACCOUNT and export its token — THE single
credential this standup needs (it replaces Vault's init + unseal keys):

  1. Open:  https://my.1password.com  ->  Developer  ->  Service Accounts  ->
            Create Service Account  (name it 'aigov-enclave')
  2. Grant it READ on the '$OP_VAULT' vault.
  3. Copy the token (starts 'ops_') and, ON THE HOST, run:

       export OP_SERVICE_ACCOUNT_TOKEN=ops_...

  4. Persist it for the core by pasting the SAME line into $ENV_FILE
     (uncomment OP_SERVICE_ACCOUNT_TOKEN=). Never commit it." || return 1
  ok "1Password broker ready"
}

phase_render() {
  log "render — the managed enclave config (op:// references, no secrets)"
  ENCLAVE_SECRETS=1password OP_VAULT="$OP_VAULT" bash "$HERE/render-env.sh"
  env_has OP_SERVICE_ACCOUNT_TOKEN || warn "remember to paste OP_SERVICE_ACCOUNT_TOKEN into $ENV_FILE (the one host secret)"
  ok "rendered $ENV_FILE"
}

phase_keycloak() {
  log "keycloak — realm + client; the client secret goes INTO 1Password"
  action_required "Create the realm + OIDC client, then STORE its secret in 1Password
(so the broker serves it — you never paste it into a file):

  1. Start Keycloak:  docker compose -f deploy/docker-compose.keycloak-prod.yml up -d
  2. Admin console -> Create realm:  aigovops
  3. Clients -> Create:  aigov-console
       Client authentication: ON  (confidential)
       Valid redirect URIs:  ${OIDC_REDIRECT_URI:-https://<host>/auth/oidc/callback}
  4. Groups -> Create:  steward
  5. Clients -> aigov-console -> Credentials -> copy the Client secret, then:

       op item edit oidc client-secret='<paste>' --vault '$OP_VAULT'

  Then create each founder's account and join them to 'steward' (access control
  — yours alone)." || return 1
  ok "identity provider ready"
}

phase_postgres() {
  log "postgres — role + db; the URL goes INTO 1Password"
  action_required "Create the database + role (you choose the password), then store the
URL in 1Password so the broker serves it:

  sudo -u postgres psql -c \"CREATE ROLE aigov LOGIN PASSWORD '<choose-one>';\"
  sudo -u postgres psql -c \"CREATE DATABASE aigov OWNER aigov;\"

  op item edit postgres url='postgres://aigov:<password>@127.0.0.1:5432/aigov' --vault '$OP_VAULT'

  Then the one optional dependency for the Postgres ledger path:
  cd core && npm i pg     # deliberately not in package.json — dependency-free by default" || return 1
  ok "durable ledger home ready"
}

phase_core() {
  log "core — start the governed core against the managed enclave env"
  [ -f "$ENV_FILE" ] || { warn "no $ENV_FILE — run the render phase first"; return 1; }
  env_has OP_SERVICE_ACCOUNT_TOKEN || warn "OP_SERVICE_ACCOUNT_TOKEN not yet in $ENV_FILE (the core resolves op:// refs through it — it will fail closed without it)"
  log "start it with:"
  echo "    ${c_dim}cd core && set -a && . $ENV_FILE && set +a && npm start${c_off}"
  echo "    ${c_dim}(or: docker compose --env-file $ENV_FILE -f deploy/docker-compose.yml up -d)${c_off}"
  ok "core start command ready"
}

phase_verify() {
  log "verify — prove every dial actually flipped green (managed posture)"
  ( set -a; [ -f "$ENV_FILE" ] && . "$ENV_FILE"; set +a; cd "$ROOT/core" && node scripts/enclave-verify.mjs )
  ok "enclave verified GREEN"
}

# --- run ----------------------------------------------------------------------
echo
echo "${c_blue}AiGovOps — Jeeves · managed enclave standup${c_off}"
echo "${c_dim}1Password brokers the secrets; the human makes only the irreversible move${c_off}"
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
    echo "    bash deploy/enclave/jeeves.sh --from $p"
    exit 1
  fi
done

echo
ok "Jeeves finished the phases he could. Re-run anytime — he resumes where he stopped."
echo "${c_dim}human checklist: deploy/enclave/HUMAN-STEPS.md · runbook: plan/enclave-host-bringup.md${c_off}"
