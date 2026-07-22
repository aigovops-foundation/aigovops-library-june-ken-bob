#!/usr/bin/env bash
# deploy/enclave/install-components.sh — install everything the enclave host needs
# that is REVERSIBLE. Installs no credentials, initialises no Vault, creates no
# realm, provisions nothing. Those are the human's moves (see HUMAN-STEPS.md).
#
#   sudo bash deploy/enclave/install-components.sh              # install what's missing
#   sudo bash deploy/enclave/install-components.sh --check      # report only, change nothing
#   sudo bash deploy/enclave/install-components.sh --only runsc # one component
#
# IDEMPOTENT: every step is a no-op when the component is already present.
# FAIL-CLOSED: any install failure aborts (set -e) — a half-installed enclave is
# never reported as ready.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

KEYCLOAK_IMAGE="${KEYCLOAK_IMAGE:-quay.io/keycloak/keycloak:24.0}"
OPA_VERSION="${OPA_VERSION:-v0.63.0}"
CHECK=0; ONLY=""

for a in "$@"; do case "$a" in
  --check) CHECK=1 ;;
  --only) ONLY="__next__" ;;
  node|docker|runsc|vault|opa|postgres|keycloak) [ "$ONLY" = "__next__" ] && ONLY="$a" ;;
esac; done

c_blue=$'\033[1;34m'; c_grn=$'\033[1;32m'; c_yel=$'\033[1;33m'; c_dim=$'\033[2m'; c_off=$'\033[0m'
log()  { echo "${c_blue}▸${c_off} $*"; }
ok()   { echo "${c_grn}✅${c_off} $*"; }
warn() { echo "${c_yel}⚠${c_off}  $*"; }
have() { command -v "$1" >/dev/null 2>&1; }
want() { [ -z "$ONLY" ] || [ "$ONLY" = "$1" ]; }

# Refuse to pretend on a non-Linux host: gVisor is Linux-only and a macOS run
# would install nothing while reporting success.
if [ "$(uname -s)" != "Linux" ]; then
  warn "this installer targets Linux (gVisor/runsc is Linux-only)."
  warn "on $(uname -s) it can only report. Run it on the enclave host."
  CHECK=1
fi

require_root() {
  [ "$CHECK" = "1" ] && return 0
  [ "$(id -u)" = "0" ] || { warn "needs root — re-run with sudo"; exit 1; }
}

step() { # step <name> <present-test> <install-fn>
  local name="$1" present="$2" fn="$3"
  want "$name" || return 0
  if eval "$present"; then ok "$name already present"; return 0; fi
  if [ "$CHECK" = "1" ]; then warn "$name MISSING (check mode — not installing)"; return 0; fi
  require_root
  log "installing $name"
  "$fn"
  eval "$present" && ok "$name installed" || { warn "$name still missing after install"; exit 1; }
}

# --- installers ---------------------------------------------------------------
inst_node() {
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
}

inst_docker() {
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
}

# gVisor: the release binaries + registering `runsc` as a Docker runtime. This is
# what turns SANDBOX_BACKEND=gvisor from a request into enforcement (T4).
inst_runsc() {
  local arch url tmp
  arch="$(uname -m)"
  url="https://storage.googleapis.com/gvisor/releases/release/latest/${arch}"
  tmp="$(mktemp -d)"
  ( cd "$tmp"
    curl -fsSLO "${url}/runsc" -O "${url}/runsc.sha512" \
         -O "${url}/containerd-shim-runsc-v1" -O "${url}/containerd-shim-runsc-v1.sha512"
    sha512sum -c runsc.sha512 containerd-shim-runsc-v1.sha512
    install -m 755 -t /usr/local/bin runsc containerd-shim-runsc-v1 )
  rm -rf "$tmp"
  # Register with Docker, preserving any existing daemon.json.
  runsc install
  systemctl restart docker
}

inst_vault() {
  apt-get update -y && apt-get install -y gpg curl
  curl -fsSL https://apt.releases.hashicorp.com/gpg \
    | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" \
    > /etc/apt/sources.list.d/hashicorp.list
  apt-get update -y && apt-get install -y vault
}

inst_opa() {
  local arch=amd64
  [ "$(uname -m)" = "aarch64" ] && arch=arm64
  curl -fsSL -o /usr/local/bin/opa \
    "https://openpolicyagent.org/downloads/${OPA_VERSION}/opa_linux_${arch}_static"
  chmod 755 /usr/local/bin/opa
}

inst_postgres() { apt-get update -y && apt-get install -y postgresql postgresql-client; }

inst_keycloak() { docker pull "$KEYCLOAK_IMAGE"; }

# --- run ----------------------------------------------------------------------
echo
if [ "$CHECK" = "1" ]; then log "enclave component install ${c_dim}(check mode — no changes)${c_off}"; else log "enclave component install"; fi
echo

step node     'have node'    inst_node
step docker   'have docker'  inst_docker
step runsc    'have runsc || docker info --format "{{json .Runtimes}}" 2>/dev/null | grep -q runsc' inst_runsc
step vault    'have vault'   inst_vault
step opa      'have opa'     inst_opa
step postgres 'have psql'    inst_postgres
step keycloak "docker image inspect $KEYCLOAK_IMAGE >/dev/null 2>&1" inst_keycloak

echo
log "verifying with the core preflight"
if have node && [ -d "$ROOT/core" ]; then
  ( cd "$ROOT/core" && node scripts/enclave-preflight.mjs ) || true
else
  warn "node or core/ missing — skipping preflight"
fi

echo
ok "component install pass complete"
echo "${c_dim}next: bash deploy/enclave/render-env.sh   then   deploy/enclave/HUMAN-STEPS.md${c_off}"
