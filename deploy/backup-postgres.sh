#!/usr/bin/env bash
# deploy/backup-postgres.sh — Phase A3: nightly durable backup of the signed
# ledger + governed state. The ledger is the whole value proposition, so this is
# not optional for a production backbone. Dependency-light: pg_dump + gzip +
# rotation + an integrity check. Wire it as a cron job (example at the bottom).
#
#   DATABASE_URL=postgres://… BACKUP_DIR=/opt/aigovops/backups bash deploy/backup-postgres.sh
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL (postgres://… — may be an op:// ref your shell resolves first)}"
BACKUP_DIR="${BACKUP_DIR:-/opt/aigovops/backups}"
KEEP="${BACKUP_KEEP:-14}"                       # retain the newest N dumps
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/aigov-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"
echo "[backup] dumping → $OUT"
pg_dump "$DATABASE_URL" | gzip > "$OUT"

# Integrity: a truncated/empty dump is a FAILED backup, not a kept one.
SIZE="$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")"
if [ "${SIZE:-0}" -lt 1000 ]; then echo "[backup] FAILED — dump too small ($SIZE bytes)"; rm -f "$OUT"; exit 1; fi
echo "[backup] ok ($(du -h "$OUT" | cut -f1))"

# Rotate: drop everything older than the newest $KEEP.
ls -1t "$BACKUP_DIR"/aigov-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "[backup] rotated; kept newest $KEEP"

# Restore (test this — an untested backup is a hope, not a backup):
#   gunzip -c "$OUT" | psql "$DATABASE_URL"
#
# Cron (nightly 03:17 UTC), with the URL pulled from 1Password so no secret lands on disk:
#   17 3 * * *  DATABASE_URL="$(op read op://AiGovOps/postgres/url)" BACKUP_DIR=/opt/aigovops/backups \
#               bash /opt/aigovops/deploy/backup-postgres.sh >> /var/log/aigov-backup.log 2>&1
