#!/usr/bin/env bash
# deploy/bootstrap.sh — automated, repeatable bring-up of the AiGovOps backend.
# Renders every secret from 1Password, starts the datastores, then the core, and
# health-checks. Idempotent — safe to re-run.
#
#   bash deploy/bootstrap.sh              # render from 1Password, bring stack up
#   bash deploy/bootstrap.sh --render     # only render deploy/.env, start nothing
#   bash deploy/bootstrap.sh --dev        # use built-in dev defaults, skip 1Password
#
# Operator prerequisites (the irreversible/credentialed steps, NOT done by CI):
#   • Docker + Docker Compose
#   • 1Password: `op` CLI signed in OR OP_SERVICE_ACCOUNT_TOKEN exported, with an
#     "AiGovOps" vault holding the items referenced in .env.1password.tmpl.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMPL="$HERE/.env.1password.tmpl"
ENV_FILE="$HERE/.env"
COMPOSE="docker compose -f $HERE/docker-compose.yml"
MODE="${1:-up}"

render_secrets() {
  if [ "$MODE" = "--dev" ]; then
    echo "[bootstrap] --dev: writing non-secret dev defaults (NOT for production)"
    cat > "$ENV_FILE" <<'DEV'
SECRETS_PROFILE=lab
POLICY_ENGINE=js
ALLOW_CLOUD=false
SESSION_SECRET=dev-session-secret-change-me
DATABASE_URL=postgres://aigov:aigov@postgres:5432/aigov
REDIS_URL=redis://redis:6379
DEV
    return
  fi
  command -v op >/dev/null 2>&1 || { echo "error: 1Password CLI 'op' not found. Install it or run with --dev." >&2; exit 1; }
  echo "[bootstrap] rendering secrets from 1Password -> $ENV_FILE"
  op inject -i "$TMPL" -o "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

render_secrets
if [ "$MODE" = "--render" ]; then echo "[bootstrap] rendered $ENV_FILE — nothing started."; exit 0; fi

command -v docker >/dev/null 2>&1 || { echo "error: docker not found." >&2; exit 1; }

echo "[bootstrap] starting datastores + services…"
$COMPOSE up -d postgres redis vault keycloak opa prometheus grafana

echo "[bootstrap] waiting for Postgres + Redis to be healthy…"
for i in $(seq 1 30); do
  if $COMPOSE ps --format json postgres 2>/dev/null | grep -q '"Health":"healthy"'; then break; fi
  sleep 2
done

echo "[bootstrap] starting the governed core…"
$COMPOSE up -d --build core

echo "[bootstrap] waiting for the core /readyz…"
for i in $(seq 1 30); do
  if curl -fsS http://localhost:8787/readyz >/dev/null 2>&1; then
    echo "[bootstrap] ✅ core is ready: http://localhost:8787/console  (metrics: :9090, grafana: :3000)"
    exit 0
  fi
  sleep 2
done
echo "[bootstrap] ⚠ core did not report ready in time — check: $COMPOSE logs core" >&2
exit 1
