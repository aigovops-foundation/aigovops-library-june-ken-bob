#!/usr/bin/env bash
# deploy/dead-simple.sh — the deterministic backbone the `dead-simple` agent drives.
# Chains every AUTOMATABLE deployment step and stops cleanly at each IRREVERSIBLE
# human checkpoint (accounts, credentials, provisioning, DNS) with a precise
# ACTION REQUIRED block. Idempotent + resumable (a state file records finished
# phases). The project's rule, enforced in the deployer itself:
#   automate everything reversible; the human makes the irreversible move.
#
#   bash deploy/dead-simple.sh                 # run all phases, pausing at checkpoints
#   bash deploy/dead-simple.sh --from vault    # resume from a phase
#   bash deploy/dead-simple.sh --only stack    # run a single phase
#   bash deploy/dead-simple.sh --yes           # auto-confirm reversible actions (CI/non-interactive)
#   bash deploy/dead-simple.sh --status        # show what's done
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
STATE="$HERE/.dead-simple.state"
PHASES=(preflight onepassword host stack durability vault keycloak dns verify)
YES=0; FROM=""; ONLY=""

for a in "$@"; do case "$a" in
  --yes) YES=1 ;; --from) FROM="__next__" ;; --only) ONLY="__next__" ;;
  --status) [ -f "$STATE" ] && cat "$STATE" || echo "no phases completed yet"; exit 0 ;;
  preflight|onepassword|host|stack|durability|vault|keycloak|dns|verify)
     [ "$FROM" = "__next__" ] && FROM="$a"; [ "$ONLY" = "__next__" ] && ONLY="$a" ;;
esac; done

c_blue=$'\033[1;34m'; c_grn=$'\033[1;32m'; c_yel=$'\033[1;33m'; c_dim=$'\033[2m'; c_off=$'\033[0m'
log()  { echo "${c_blue}▸${c_off} $*"; }
ok()   { echo "${c_grn}✅${c_off} $*"; }
warn() { echo "${c_yel}⚠${c_off}  $*"; }
done_phase()  { grep -qx "$1" "$STATE" 2>/dev/null; }
mark_done()   { touch "$STATE"; grep -qx "$1" "$STATE" 2>/dev/null || echo "$1" >> "$STATE"; }

# A human checkpoint: print what only a human can do, then pause (unless --yes/non-tty).
action_required() {
  echo; echo "${c_yel}┌─ ACTION REQUIRED (yours — the irreversible move) ───────────────${c_off}"
  while IFS= read -r line; do echo "${c_yel}│${c_off} $line"; done <<< "$1"
  echo "${c_yel}└─────────────────────────────────────────────────────────────────${c_off}"
  if [ "$YES" = "1" ] || [ ! -t 0 ]; then warn "non-interactive: not pausing — do the above, then re-run."; return 1; fi
  read -r -p "   Press Enter when done (or type 'skip'): " ans
  [ "$ans" = "skip" ] && { warn "skipped — re-run to continue."; return 1; }
  return 0
}

have() { command -v "$1" >/dev/null 2>&1; }

# --- phases -------------------------------------------------------------------
phase_preflight() {
  log "preflight — checking tooling"
  local miss=0
  for t in git curl; do have "$t" || { warn "missing: $t"; miss=1; }; done
  for t in op docker jq vault openssl; do have "$t" || warn "optional not found: $t (needed for some phases)"; done
  [ "$miss" = "1" ] && { warn "install the missing required tools, then re-run."; return 1; }
  ok "preflight passed"
}

phase_onepassword() {
  log "1Password — vault + items"
  if ! have op; then action_required "Install the 1Password CLI 'op' (https://developer.1password.com/docs/cli)." || return 1; fi
  if ! op whoami >/dev/null 2>&1; then
    action_required "Sign in to 1Password so 'op' can create the vault:
  • interactive:  op signin
  • automation:   export OP_SERVICE_ACCOUNT_TOKEN=ops_...  (create it in the 1Password
                  console → Developer → Service Accounts, grant read on 'AiGovOps')" || return 1
  fi
  bash "$HERE/provision/1-onepassword.sh"
  action_required "Create a 1Password SERVICE ACCOUNT (console → Developer → Service Accounts),
grant it read on the 'AiGovOps' vault, and export its token for the next phases:
  export OP_SERVICE_ACCOUNT_TOKEN=ops_..." || return 1
  ok "1Password provisioned"
}

phase_host() {
  log "host — Docker present?"
  if have docker && docker info >/dev/null 2>&1; then ok "Docker is available on this host"; return 0; fi
  action_required "Create a Linux VM and run the AiGovOps stack there. Paste this as the VM's
user-data (cloud-init), which installs Docker + op + clones the repo:
  deploy/provision/2-cloud-init.yaml
Then SSH in, 'export OP_SERVICE_ACCOUNT_TOKEN=...', and re-run this from /opt/aigovops." || return 1
}

phase_stack() {
  log "stack — rendering secrets from 1Password + bringing services up"
  bash "$HERE/bootstrap.sh" ${YES:+}
  log "waiting for /readyz…"
  for _ in $(seq 1 30); do curl -fsS http://localhost:8787/readyz >/dev/null 2>&1 && { ok "core is ready"; return 0; }; sleep 2; done
  warn "core did not report ready — check: docker compose -f $HERE/docker-compose.yml logs core"; return 1
}

# DURABILITY — make the governed state survive restarts + go multi-replica by
# pointing the core at the running Redis. Dependency-free: the core ships a native
# RESP client (no `npm i redis`). Reversible + idempotent — drives wire-durability.sh.
phase_durability() {
  log "durability — Redis-backed shared state (workflows, quotas, kill switch survive restart + scale out)"
  bash "$HERE/wire-durability.sh" || { warn "durability not active — see the message above (core is on the in-memory store; state is lost on restart)."; return 1; }
  ok "shared state is durable + cluster-wide"
}

phase_vault() {
  log "vault — init/unseal + broker scopes"
  : "${VAULT_ADDR:=http://127.0.0.1:8200}"; export VAULT_ADDR
  bash "$HERE/provision/3-vault.sh"
  action_required "Store Vault's unseal key + root token in 1Password, then DELETE the
vault-init.json file. Set the broker scope items to your REAL API keys:
  op item edit github-deploy credential=<real key>" || return 1
  ok "vault wired"
}

phase_keycloak() {
  log "keycloak — import the aigovops realm + client"
  : "${KC_URL:=http://127.0.0.1:8080}"; export KC_URL
  if [ -z "${KC_ADMIN_PW:-}" ]; then
    action_required "Set the Keycloak admin password from your stack so the realm can be imported:
  export KC_ADMIN_PW=<the KEYCLOAK_ADMIN_PASSWORD you set in deploy/.env>" || return 1
  fi
  bash "$HERE/provision/3-keycloak.sh"
  action_required "In Keycloak: rotate the aigov-console client secret and save it to 1Password
(op item edit oidc client-secret=...), and add your founders to the 'steward' group." || return 1
  ok "identity provider ready"
}

phase_dns() {
  log "dns + tls"
  action_required "At your DNS registrar, point these at the host's public IP:
  console.aigovops.org  A  <host-ip>
  id.aigovops.org       A  <host-ip>
Then start the TLS reverse proxy on the host:
  docker run -d --name caddy --network host \\
    -v $HERE/provision/4-Caddyfile:/etc/caddy/Caddyfile -v caddy_data:/data caddy:2" || return 1
  ok "DNS + TLS configured"
}

phase_verify() {
  log "verify — end-to-end health"
  curl -fsS http://localhost:8787/livez >/dev/null 2>&1 && ok "/livez" || warn "/livez unreachable"
  curl -fsS http://localhost:8787/readyz >/dev/null 2>&1 && ok "/readyz" || warn "/readyz not ready"
  curl -fsS http://localhost:8787/metrics 2>/dev/null | grep -q aigov_ && ok "/metrics exposes aigov_*" || warn "/metrics missing"
  if [ -n "${OIDC_ISSUER:-}" ]; then curl -fsS "$OIDC_ISSUER/.well-known/openid-configuration" >/dev/null 2>&1 && ok "OIDC discovery reachable" || warn "OIDC discovery unreachable"; fi
  ( cd "$ROOT/core" && npm run --silent verify >/dev/null 2>&1 && ok "ledger verified (signatures + chain)" || warn "ledger verify reported issues" )
  ok "verify complete — console: http://localhost:8787/console"
}

# --- driver -------------------------------------------------------------------
run_phase() { local p="$1"; if done_phase "$p" && [ -z "$ONLY" ]; then echo "${c_dim}• $p (done)${c_off}"; return 0; fi
  if "phase_$p"; then mark_done "$p"; else warn "phase '$p' paused/incomplete — resolve the action above and re-run (or --from $p)."; exit 2; fi; }

echo "${c_blue}=== dead-simple · AiGovOps go-live ===${c_off}"
started=0
for p in "${PHASES[@]}"; do
  [ -n "$ONLY" ] && [ "$ONLY" != "$p" ] && continue
  [ -n "$FROM" ] && [ "$started" = "0" ] && [ "$FROM" != "$p" ] && { echo "${c_dim}• $p (skipped, before --from)${c_off}"; continue; }
  started=1
  run_phase "$p"
done
echo; ok "dead-simple finished the phases it could. Re-run anytime — it resumes where it stopped."
