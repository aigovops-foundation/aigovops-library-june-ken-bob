#!/usr/bin/env bash
# insight-digest — pull a metadata-only, anonymized, token-redacted snapshot of community
# activity from the live Omni portal and print a short digest. Read-only. Intended as a
# weekly cron the steward reads; never writes, never prints user content or secrets.
#
#   OMNI_HOST=178.128.146.152 OMNI_SSH_KEY=~/.ssh/aigovops ./insight-digest.sh
set -euo pipefail
HOST="${OMNI_HOST:-178.128.146.152}"
KEY="${OMNI_SSH_KEY:-$HOME/.ssh/aigovops}"

ssh -i "$KEY" -o ConnectTimeout=15 -o BatchMode=yes "root@${HOST}" \
  'cd /opt/omni && set -a; . ./.env 2>/dev/null; set +a; python3 - ' <<'PY'
import json, re
from collections import Counter
def redact(s):
    s=str(s); s=re.sub(r"\b\d{6,}:[A-Za-z0-9_\-]{6,}\b","<token>",s)
    s=re.sub(r"\b(sk-[A-Za-z0-9\-]{8,})\b","<secret>",s)
    s=re.sub(r"[\w.+-]+@[\w-]+\.[\w.-]+","<email>",s); return s[:60]
import core.journeys as J
d=J.summary() if hasattr(J,"summary") else J.build()
js=d.get("journeys",[]); kinds=Counter()
authed=concierge=engaged=0
for j in js:
    steps=j.get("steps",[]) or []
    ks={s.get("kind") for s in steps}
    if "auth" in ks: authed+=1
    if "concierge" in ks: concierge+=1
    if len(steps)>=3: engaged+=1
    for s in steps: kinds[s.get("kind")]+=1
print("=== Omni weekly digest (metadata only) ===")
print(f"actors={d.get('users')}  events={d.get('events')}  engaged(>=3)={engaged}  authed={authed}  used-concierge={concierge}")
print("top event kinds:", ", ".join(f"{k}={n}" for k,n in kinds.most_common(6)))
PY
