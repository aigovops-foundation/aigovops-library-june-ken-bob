#!/usr/bin/env bash
# sync-repo.sh — bring a git repo in line with its remote, safely.
#   ./sync-repo.sh                 # current dir
#   ./sync-repo.sh ~/path/to/repo  # a specific repo
#
# Safe by design: fetches, reports ahead/behind, and ONLY fast-forwards a clean
# tree. Never merges, rebases, force-anything, or pushes — pushing/deploy stay
# the human's explicit call (AiGovOps irreversibility boundary).
set -euo pipefail

DIR="${1:-$PWD}"
cd "$DIR"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "✗ not a git repo: $DIR"; exit 1; }

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "→ repo: $(git rev-parse --show-toplevel)  branch: $BRANCH"

if [ -n "$(git status --porcelain)" ]; then
  echo "⚠ uncommitted changes present — not syncing. Commit or stash first:"
  git status --short
  exit 1
fi

echo "→ fetching origin…"
git fetch --quiet origin

UP="origin/$BRANCH"
git rev-parse --verify "$UP" >/dev/null 2>&1 || { echo "✗ no upstream $UP"; exit 1; }

read -r BEHIND AHEAD < <(git rev-list --left-right --count "$UP...HEAD")
echo "→ behind $BEHIND · ahead $AHEAD  (vs $UP)"

if [ "$BEHIND" -gt 0 ] && [ "$AHEAD" -eq 0 ]; then
  echo "→ fast-forwarding…"; git merge --ff-only "$UP"; echo "✓ up to date with $UP"
elif [ "$BEHIND" -gt 0 ] && [ "$AHEAD" -gt 0 ]; then
  echo "⚠ diverged ($BEHIND behind, $AHEAD ahead) — resolve manually (rebase/merge). Not touching it."
  exit 1
elif [ "$AHEAD" -gt 0 ]; then
  echo "↑ $AHEAD local commit(s) not on $UP. Review, then push yourself:  git push origin $BRANCH"
else
  echo "✓ already in sync with $UP"
fi
