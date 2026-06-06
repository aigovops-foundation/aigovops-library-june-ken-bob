#!/bin/bash
set -e
# make sure we're at the TOP of the combined repo (must see docs/ and plan/)
if [ ! -d docs ] || [ ! -d plan ] || [ ! -d core ]; then
  echo "!! Not at the combined-repo root. Here is where I am:"; pwd; ls; exit 1
fi
echo "==> at repo root: $(pwd)"
echo "   top-level: $(ls -d core docs plan README.md 2>/dev/null | tr '\n' ' ')"
rm -rf .git
git init -q
git add .
git commit -q -m "AiGovOps Library — the whole set (core, docs, plan, skills)"
git branch -M main
git remote add origin https://github.com/aigovops-foundation/aigovops-library-june-ken-bob.git
echo "==> force-pushing the FULL set (replaces the core-only push)…"
git push -f -u origin main
echo "=== DONE → github.com/aigovops-foundation/aigovops-library-june-ken-bob ==="
