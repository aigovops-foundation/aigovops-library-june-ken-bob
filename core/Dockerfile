# AiGovOps Library — the governed core. One image, runs anywhere.
FROM node:20-alpine
WORKDIR /app
# Dependency-free in v1, so this is just the source. (When deps are added,
# copy package.json + lockfile first and `pnpm i --frozen-lockfile` for caching.)
COPY package.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
ENV PORT=8787
EXPOSE 8787
# Keys + ledger are mounted as volumes (see compose.yml) so they persist and
# the private key never bakes into the image.
CMD ["node", "src/server.js"]
