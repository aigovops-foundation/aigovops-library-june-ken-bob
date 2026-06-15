#!/usr/bin/env bash
# deploy/provision/1-onepassword.sh — STEP 1: create the AiGovOps 1Password vault
# and its items, matching the op:// references in deploy/.env.1password.tmpl.
#
# YOU run this once, signed in to 1Password (this script is NOT run by the agent
# or CI — it touches your credentials). Idempotent: re-running skips existing items
# and never overwrites a secret you've already set.
#
#   op signin                      # or: export OP_SERVICE_ACCOUNT_TOKEN=ops_...
#   bash deploy/provision/1-onepassword.sh
#
# Self-owned secrets (session, steward token, broker scope keys) are generated
# here with `openssl rand`. Externally-issued secrets (OIDC client secret from
# Keycloak, Vault token from `vault init`, DB/Redis URLs) are created as
# placeholders — fill them in step 3 / when the datastores exist.
set -euo pipefail
VAULT="${OP_VAULT:-AiGovOps}"
FIELD="${OP_FIELD:-credential}"

command -v op >/dev/null 2>&1 || { echo "error: 1Password CLI 'op' not found." >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "error: openssl not found." >&2; exit 1; }
op whoami >/dev/null 2>&1 || { echo "error: not signed in. Run 'op signin' or set OP_SERVICE_ACCOUNT_TOKEN." >&2; exit 1; }

op vault get "$VAULT" >/dev/null 2>&1 || { op vault create "$VAULT" >/dev/null && echo "created vault: $VAULT"; }

# create item ITEM with FIELD=VALUE, only if absent (never clobber an existing secret)
mkitem() {
  local item="$1" field="$2" value="$3"
  if op item get "$item" --vault "$VAULT" >/dev/null 2>&1; then echo "exists:  $item"; return; fi
  op item create --vault "$VAULT" --category "API Credential" --title "$item" "${field}[password]=${value}" >/dev/null
  echo "created: $item ($field)"
}
rand() { openssl rand -hex 32; }

# --- self-owned secrets (generated) ---
mkitem session   secret        "$(rand)"     # -> op://$VAULT/session/secret
mkitem ops       steward-token "$(rand)"     # -> op://$VAULT/ops/steward-token

# --- externally-issued secrets (placeholders; fill when those systems exist) ---
mkitem oidc      client-secret "CHANGEME-from-keycloak (step 3)"
mkitem vault     token         "CHANGEME-from-vault-init (step 3)"
mkitem postgres  url           "postgres://aigov:CHANGE-STRONG-PW@postgres:5432/aigov"
mkitem redis     url           "redis://redis:6379"

# --- broker scope keys (SECRETS_PROFILE=1password reads op://$VAULT/<scope>/$FIELD) ---
for scope in github-deploy self-host; do
  mkitem "$scope" "$FIELD" "CHANGEME-real-api-key-for-$scope"
done

echo
echo "✅ 1Password vault '$VAULT' is provisioned."
echo "   Next: create a SERVICE ACCOUNT in the 1Password console (Developer ->"
echo "   Service Accounts), grant it read on '$VAULT', and export its token:"
echo "       export OP_SERVICE_ACCOUNT_TOKEN=ops_..."
echo "   Then run step 2 (host) -> bash deploy/bootstrap.sh."
