#!/bin/bash
set -e
echo "==> removing the embedded git repo inside core/ …"
rm -rf core/.git
git rm -r --cached core -q 2>/dev/null || true
git add core
git commit -q -m "Fix: include core/ as normal files (was an embedded repo)"
git push -u origin main
echo "=== FIXED → core/ is now browsable. ==="
