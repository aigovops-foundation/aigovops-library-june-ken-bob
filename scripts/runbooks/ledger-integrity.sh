#!/usr/bin/env bash
# ledger-integrity — assert a running core's signed ledger still verifies.
# Read-only: hits /status and checks ledger.valid. Exits non-zero if invalid or
# unreachable, so it can run as a cron / external watchdog with a real signal.
#
#   AIGOV_STATUS_URL=http://localhost:8787/status ./ledger-integrity.sh
#   # or via SSH tunnel to droplet B's core, etc.
set -euo pipefail
URL="${AIGOV_STATUS_URL:-http://localhost:8787/status}"

json="$(curl -fsS -m 10 "$URL")" || { echo "ledger-integrity: UNREACHABLE $URL"; exit 2; }
python3 - "$json" <<'PY'
import sys, json
try:
    d = json.loads(sys.argv[1])
except Exception as e:
    print("ledger-integrity: bad response:", e); sys.exit(2)
led = d.get("ledger", {})
valid = led.get("valid"); n = led.get("entries")
print(f"ledger-integrity: entries={n} valid={valid} kid={d.get('kid')}")
sys.exit(0 if valid is True else 1)
PY
