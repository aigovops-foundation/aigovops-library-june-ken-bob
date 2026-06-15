#!/usr/bin/env bash
# deploy/provision/3-keycloak.sh — STEP 3b: create the OIDC realm + client.
# Imports deploy/provision/3-keycloak-realm.json into a running Keycloak using
# kcadm, then prints the steward/member groups + where to set the client secret.
# YOU run this; the agent never creates the IdP or holds its admin password.
#
#   export KC_URL=http://127.0.0.1:8080 KC_ADMIN=admin KC_ADMIN_PW=...    # from your stack
#   bash deploy/provision/3-keycloak.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${KC_URL:=http://127.0.0.1:8080}"
: "${KC_ADMIN:=admin}"
: "${KC_ADMIN_PW:?set KC_ADMIN_PW (the Keycloak admin password from your stack)}"
REALM_JSON="$HERE/3-keycloak-realm.json"

# Prefer kcadm inside the keycloak container if the host CLI isn't present.
KCADM="kcadm.sh"
command -v "$KCADM" >/dev/null 2>&1 || KCADM="docker exec -i $(docker ps --filter ancestor=quay.io/keycloak/keycloak:24.0 --format '{{.ID}}' | head -1) /opt/keycloak/bin/kcadm.sh"

echo "[keycloak] logging in to $KC_URL …"
$KCADM config credentials --server "$KC_URL" --realm master --user "$KC_ADMIN" --password "$KC_ADMIN_PW"

if $KCADM get realms/aigovops >/dev/null 2>&1; then
  echo "[keycloak] realm 'aigovops' already exists — skipping import."
else
  echo "[keycloak] creating realm from $REALM_JSON …"
  $KCADM create realms -f "$REALM_JSON"
  echo "[keycloak] ✅ realm 'aigovops' + client 'aigov-console' created."
fi

echo
echo "Next:"
echo "  1) Rotate the client secret and store it in 1Password:"
echo "       $KCADM update clients/<id> -r aigovops -s 'secret=\$(openssl rand -hex 24)'"
echo "       op item edit oidc client-secret=<the-new-secret>"
echo "  2) Add your founders to the 'steward' group; everyone else lands in 'member'."
echo "  3) Set OIDC_ISSUER=$KC_URL/realms/aigovops (or your public id.* host)."
