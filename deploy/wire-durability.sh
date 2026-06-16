#!/usr/bin/env bash
# deploy/wire-durability.sh — make the governed shared state DURABLE + cluster-wide
# by pointing the core at the running Redis. The Phase-B state (workflows, quotas,
# the kill switch) lives in the shared store; on the in-memory default it is lost on
# restart and not shared across replicas. This flips it to Redis.
#
# Dependency-free: the core ships a native RESP client (src/core/statestore.resp.js),
# so this adds no redis package — the "zero third-party runtime components" / SBOM
# guarantee is preserved. Idempotent and reversible (unset REDIS_URL to revert).
#
#   bash deploy/wire-durability.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="docker compose -f $HERE/docker-compose.yml"
: "${REDIS_URL:=redis://redis:6379}"

echo "[durability] target REDIS_URL=$REDIS_URL"
# Make it explicit in the env the core reads (compose already defaults it; this
# documents the choice and survives a compose override).
if [ -f "$HERE/.env" ] && ! grep -q '^REDIS_URL=' "$HERE/.env"; then echo "REDIS_URL=$REDIS_URL" >> "$HERE/.env"; fi

echo "[durability] rebuilding + recreating core…"
$COMPOSE build core >/dev/null
$COMPOSE up -d --force-recreate core >/dev/null

# Wait for ready, then confirm it took the Redis store (not the in-memory fallback).
for _ in $(seq 1 15); do curl -fsS http://localhost:8787/readyz >/dev/null 2>&1 && break; sleep 2; done
if $COMPOSE logs core 2>/dev/null | grep -q "shared state store: redis"; then
  echo "[durability] ✅ core is on Redis-backed shared state — workflows/quotas/kill-switch are durable + cluster-wide"
  exit 0
fi
echo "[durability] ⚠ core fell back to the in-memory store — Redis at '$REDIS_URL' is unreachable from the core container."
echo "             Check:  $COMPOSE ps redis   and   $COMPOSE logs core | tail"
exit 1
