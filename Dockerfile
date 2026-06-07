# AiGovOps Library — the governed core, hostable anywhere (one image).
# Build context is the REPO ROOT so the image includes both core/ AND plan/
# (the skill-runner reads plan/skills/*/SKILL.md at runtime). Repo layout is
# preserved under /app so the core's relative paths resolve unchanged.
FROM node:20-alpine
WORKDIR /app

# Dependency-free in v1 — just the source. (When deps arrive, copy
# core/package.json + lockfile first and install for layer caching.)
COPY core/package.json ./core/package.json
COPY core/src ./core/src
COPY core/public ./core/public
COPY core/scripts ./core/scripts
COPY plan ./plan

WORKDIR /app/core
ENV PORT=8787
EXPOSE 8787

# Keys + ledger persist on a mounted volume (see compose.yml / fly.toml); the
# private key is never baked into the image. In prod, supply keys via a KMS /
# secret store (BEACON_PRIVATE_KEY_PEM) and a volume for the ledger.
CMD ["node", "src/server.js"]
