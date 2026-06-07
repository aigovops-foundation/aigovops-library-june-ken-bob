#!/usr/bin/env bash
# go-live.sh — run the whole AiGovOps Library go-live sequence in order, EXCEPT Ken's onboarding.
#
# Why you run this, not Claude: every irreversible step here touches YOUR Fly account, YOUR
# secrets, or YOUR GitHub — credentialed actions that stay on your side by design. The script
# pauses and asks before anything irreversible; safe to run and bail at any prompt.
#
# Put this next to the helper scripts (or have them in ./scripts/):
#   sync-repo.sh · open-pr.sh · capture-state.sh · postgres-setup.sh · verify-deploy.sh
set -uo pipefail

APP="aigovops-library-core"
FLY="${FLY:-$HOME/.fly/bin/flyctl}"
HERE="$(cd "$(dirname "$0")" && pwd)"
fs(){ if [ -f "$HERE/$1" ]; then echo "$HERE/$1"; elif [ -f "$HERE/scripts/$1" ]; then echo "$HERE/scripts/$1"; else echo ""; fi; }
ask(){ read -r -p "$1 [y/N] " a; [ "$a" = "y" ] || [ "$a" = "Y" ]; }
step(){ echo; echo "════════ $1 ════════"; }

step "0 · Preflight"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "!! Run this inside the repo."; exit 1; }
command -v "$FLY" >/dev/null 2>&1 || echo "(flyctl not at $FLY — set FLY=/path/to/flyctl before the deploy steps)"
command -v gh   >/dev/null 2>&1 || echo "(gh not found — the PR step will just print a compare URL)"
echo "App: $APP   Repo: $(basename "$(git rev-parse --show-toplevel)")"

step "1 · Sync local <-> origin"
S=$(fs sync-repo.sh);     [ -n "$S" ] && bash "$S" || echo "(sync-repo.sh not found — skipping)"

step "2 · Commit docs/scripts + open PR (optional)"
ask "Open the deploy-docs PR now?" && { P=$(fs open-pr.sh); [ -n "$P" ] && bash "$P" || echo "(open-pr.sh not found)"; }

step "3 · Baseline capture (pre-deploy)"
C=$(fs capture-state.sh); [ -n "$C" ] && bash "$C" || echo "(capture-state.sh not found — skipping)"

step "4 · Fallback deploy   [touches your Fly app]"
echo "Ships the auth build. Reads/widget keep working; writes return 401 until OAuth secrets are set."
if ask "Run: $FLY deploy -a $APP ?"; then "$FLY" deploy -a "$APP"; else echo "Skipped — later: $FLY deploy -a $APP"; fi

step "5 · Verify (post-deploy capture)"
C2=$(fs capture-state.sh); [ -n "$C2" ] && bash "$C2"
echo "Diff the two snapshots:  diff -ru state-<before> state-<after>"
echo "Expect /auth/* to go 404 -> resolving; /status still ok."

step "6 · Postgres (optional)   [creates a DB on your Fly account]"
echo "Tradeoff: adds the 'pg' dependency to a core the README calls dependency-free."
echo "The repo's own Ticket-0 pattern is a FileProvider — skip this if you'd rather stay dependency-free."
if ask "Provision + attach Postgres now (postgres-setup.sh)?"; then
  G=$(fs postgres-setup.sh); [ -n "$G" ] && bash "$G" || echo "(postgres-setup.sh not found)"
  echo "Then add db.mjs (initDb / recordReceipt / recentReceipts) per postgres-wiring.md and redeploy."
fi

step "7 · OAuth (manual — credentials)   STEWARDS = bobrapp for now (Ken added later)"
echo "Create the OAuth app yourself: github.com/settings/developers (callback https://$APP.fly.dev/auth/callback)."
echo "With the Client ID/Secret in hand, run the full secrets line from deploy-day-cheatsheet.md."
ask "Set STEWARDS=bobrapp now (you can append Ken later)?" && { "$FLY" secrets set -a "$APP" STEWARDS=bobrapp && echo "STEWARDS=bobrapp set."; }

echo; echo "════════ done ════════"
echo "Ken's onboarding was intentionally skipped — see onboard-ken.md / onboard-ken.sh when he's ready."
echo "Paste me the deploy + verify output and I'll confirm /auth/me, /status, and the sign-in path."
