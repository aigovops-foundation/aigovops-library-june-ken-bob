#!/usr/bin/env bash
# deploy/backup-state.sh — back up the durable state THIS deployment actually keeps:
#   • the FILE ledger   (signed beacons.ndjson + checkpoints.ndjson — the whole value)
#   • the Beacon keys   (so the ledger stays verifiable)
#   • Redis             (workflows, quotas, brokered-grant state)
# The signed ledger is the irreplaceable asset, so this is not optional. One gzipped
# tarball per run, rotated. (When the ledger moves to managed Postgres, use
# backup-postgres.sh instead/as well.)
#
#   BACKUP_DIR=/opt/aigovops/backups bash deploy/backup-state.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="docker compose -f $HERE/docker-compose.yml"
BACKUP_DIR="${BACKUP_DIR:-/opt/aigovops/backups}"
KEEP="${BACKUP_KEEP:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/aigov-state-$STAMP.tgz"
mkdir -p "$BACKUP_DIR"

# Discover the actual volume names (compose prefixes them with the project name).
vol() { docker volume ls --format '{{.Name}}' | grep -E "_${1}\$" | head -1; }
LEDGER_VOL="$(vol core_ledger)"; KEYS_VOL="$(vol core_keys)"; REDIS_VOL="$(vol redis_data)"
[ -n "$LEDGER_VOL" ] || { echo "[backup] FAILED — core_ledger volume not found"; exit 1; }

# Flush Redis to its AOF/RDB first so the snapshot is current.
$COMPOSE exec -T redis redis-cli SAVE >/dev/null 2>&1 || echo "[backup] warn: redis SAVE skipped"

# Tar the volumes read-only via a throwaway container (no host mounts needed).
docker run --rm \
  -v "${LEDGER_VOL}":/v/ledger:ro \
  -v "${KEYS_VOL:-$LEDGER_VOL}":/v/keys:ro \
  -v "${REDIS_VOL:-$LEDGER_VOL}":/v/redis:ro \
  -v "$BACKUP_DIR":/out busybox \
  tar czf "/out/$(basename "$OUT")" -C /v ledger keys redis

SIZE="$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")"
[ "${SIZE:-0}" -gt 500 ] || { echo "[backup] FAILED — archive too small"; rm -f "$OUT"; exit 1; }
echo "[backup] ok → $OUT ($(du -h "$OUT" | cut -f1))  [ledger=$LEDGER_VOL]"

# Rotate: keep the newest $KEEP.
ls -1t "$BACKUP_DIR"/aigov-state-*.tgz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "[backup] rotated; kept newest $KEEP"

# Restore (test it):
#   tar xzf <archive> -C /tmp/restore   # then copy ledger/ keys/ back onto the volumes
#
# Cron (nightly 03:30 UTC):
#   30 3 * * *  BACKUP_DIR=/opt/aigovops/backups bash /opt/aigovops/deploy/backup-state.sh >> /var/log/aigov-backup.log 2>&1
