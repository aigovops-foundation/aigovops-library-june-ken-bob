#!/usr/bin/env bash
# deploy/provision/3-vault.sh — STEP 3a: initialize + unseal a real Vault and wire
# the broker scopes. Run ON THE HOST after the stack's vault container is up (or
# against any Vault you point VAULT_ADDR at). YOU keep the unseal keys + root token
# (irreversible custody — the agent must never hold these).
#
#   export VAULT_ADDR=http://127.0.0.1:8200
#   bash deploy/provision/3-vault.sh
#
# Matches the VaultProvider contract: KV v2 at 'secret/', one entry per scope, and
# a policy `aigov-<scope>` (the policy the broker's child tokens carry).
set -euo pipefail
: "${VAULT_ADDR:=http://127.0.0.1:8200}"
export VAULT_ADDR
command -v vault >/dev/null 2>&1 || { echo "error: 'vault' CLI not found (or run inside the vault container)." >&2; exit 1; }

INIT_FILE="${VAULT_INIT_FILE:-vault-init.json}"
if vault status -format=json 2>/dev/null | grep -q '"initialized": *false'; then
  echo "[vault] initializing (1 unseal key for simplicity — use 5/3 in production)…"
  vault operator init -key-shares=1 -key-threshold=1 -format=json > "$INIT_FILE"
  chmod 600 "$INIT_FILE"
  echo "[vault] ⚠ unseal key + root token saved to $INIT_FILE — STORE THESE SAFELY (1Password) AND DELETE the file."
fi

UNSEAL_KEY="$(jq -r '.unseal_keys_b64[0]' "$INIT_FILE" 2>/dev/null || true)"
ROOT_TOKEN="$(jq -r '.root_token' "$INIT_FILE" 2>/dev/null || true)"
[ -n "$UNSEAL_KEY" ] && vault operator unseal "$UNSEAL_KEY" >/dev/null || true
export VAULT_TOKEN="${VAULT_TOKEN:-$ROOT_TOKEN}"

vault secrets list -format=json | grep -q '"secret/"' || vault secrets enable -path=secret kv-v2

for scope in github-deploy self-host; do
  vault kv put "secret/$scope" credential="REPLACE-with-real-key-for-$scope" >/dev/null
  printf 'path "secret/data/%s" { capabilities = ["read"] }\n' "$scope" | vault policy write "aigov-$scope" - >/dev/null
  echo "[vault] scope ready: $scope (policy aigov-$scope)"
done

echo
echo "✅ Vault ready. Put the ROOT/role TOKEN into 1Password:"
echo "    op item edit vault token=\"$(echo "$ROOT_TOKEN" | sed 's/./*/g')\"   # (use the real value)"
echo "   Then DELETE $INIT_FILE once the unseal key + token are safely stored."
