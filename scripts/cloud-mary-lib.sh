#!/usr/bin/env bash
# cloud-mary-lib.sh — test suite for the AiGovOps Library CORE (API + five desks).
# Tiers: --unit (node tests) --e2e (live routes) --chaos (failure injection).
set -uo pipefail
REPO="${REPO:-$HOME/Downloads/_aigov/aigovops-library}"
LIVE="${LIVE:-https://aigovops-library-core.fly.dev}"
cd "$REPO" 2>/dev/null || { echo "repo not found at $REPO"; exit 1; }
PASS=0; FAIL=0
ok(){ echo "  ok  $1"; PASS=$((PASS+1)); }
bad(){ echo "  XX  $1"; FAIL=$((FAIL+1)); }
code(){ curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@"; }
chk(){ local c; c=$(code "$LIVE$1"); [ "$c" = "$2" ] && ok "$1 -> $c (gated)" || bad "$1 -> $c (want $2)"; }
unit(){ echo "== unit =="; if node --test core/test/ >/tmp/cm-unit.log 2>&1; then ok "node --test (all desks)"; else bad "node --test (see /tmp/cm-unit.log)"; tail -5 /tmp/cm-unit.log; fi; }
e2e(){ echo "== e2e (live: $LIVE) =="
  [ "$(code "$LIVE/status")" = "200" ] && ok "/status 200" || bad "/status"
  curl -s --max-time 15 "$LIVE/api/verify" | grep -q '"valid":true' && ok "/api/verify valid" || bad "/api/verify"
  chk /api/registry 401; chk /api/cost 401; chk /api/members 403; chk /api/audit 403; chk /api/curate 200
  local pub; pub=$(curl -s --max-time 15 "$LIVE/api/audit?public=1")
  echo "$pub" | grep -q '"valid"' && ok "public view open" || bad "public view"
  echo "$pub" | grep -qi 'actor\|bobrapp' && bad "public view leaks actor" || ok "public view redacted"
}
chaos(){ echo "== chaos =="
  local c; c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST -H 'content-type: application/json' --data '{bad json' "$LIVE/api/ask")
  [ "$c" != "500" ] && ok "malformed JSON handled ($c)" || bad "malformed JSON -> 500"
  [ "$(code "$LIVE/api/nope")" = "404" ] && ok "unknown route 404" || bad "unknown route"
  local o; o=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X OPTIONS "$LIVE/api/registry"); [ "$o" = "204" ] && ok "OPTIONS preflight 204" || bad "OPTIONS -> $o"
  local w; w=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST -H 'content-type: application/json' --data '{"op":"upsert","id":"x"}' "$LIVE/api/registry"); { [ "$w" = "401" ] || [ "$w" = "403" ]; } && ok "unauth write refused ($w)" || bad "unauth write -> $w"
}
RUN="$*"; [ -z "${RUN// }" ] && RUN="--unit --e2e --chaos"
for t in $RUN; do case "$t" in --unit) unit;; --e2e) e2e;; --chaos) chaos;; *) echo "unknown tier $t";; esac; done
echo; echo "Cloud-Mary(lib): PASS=$PASS FAIL=$FAIL"; [ "$FAIL" -eq 0 ] || exit 1
