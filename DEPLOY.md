# Deploying the governed core (run it anywhere, watch it any moment)

The public hub (`docs/`) is a static site on GitHub Pages — always live. This doc
is about the **running core**: the API + the interactive **Control Room** console,
local or hosted.

> **Irreversibility boundary (CLAUDE.md).** Everything here is *prepared*. The
> first deploy — creating the Fly app, authenticating, setting secrets, putting a
> public URL on the internet — is **Bob's/Ken's click**. Commands are given; the
> human runs the irreversible ones.

## A · Run locally (no hosting)

```bash
cd core
cp .env.example .env                         # optional: tweak PORT/CORS
cp secrets.local.example.json secrets.local.json   # enables the broker (full loop)
npm start                                    # → http://localhost:8787
```
Open **http://localhost:8787/console** — the Control Room: run skills, drive the
Yes-Gate loop (propose → decide → run → verify), and watch the signed ledger.

Or with Docker (from `core/`, build context is the repo root so `plan/` ships too):
```bash
cd core && docker compose up --build         # → http://localhost:8787/console
```
The `ledger/` and `keys/` folders are mounted as volumes, so receipts and the
Ed25519 key persist across restarts. Both are gitignored.

## B · Run on a VPS ($5 box)

```bash
git clone <repo> && cd aigovops-library
# build the repo-root image (includes core/ + plan/)
docker build -t aigovops-core .
docker run -d --restart unless-stopped -p 80:8787 \
  -e ALLOWED_ORIGINS="https://your-domain" \
  -v /srv/aigov/keys:/app/core/keys \
  -v /srv/aigov/ledger:/app/core/ledger \
  --name aigov aigovops-core
```
Put it behind Caddy/nginx for TLS, or use Cloudflare in front (as the main site
already is). Persist `/srv/aigov/*` (key + ledger) with backups.

## C · Host on Fly.io (recommended)

`fly.toml` and the root `Dockerfile` are ready. It scales to zero when idle ($0),
persists keys+ledger on a volume, and serves the console at `https://<app>.fly.dev/console`.

**One-time human steps (the irreversible click):**
```bash
# 0) flyctl installed + logged in (you have ~/.fly):  fly auth login
# 1) edit fly.toml: set a unique `app` name and your `primary_region`
fly launch --no-deploy --copy-config            # registers the app from fly.toml
fly volumes create aigov_data --size 1 --region <your-region>   # persistent keys+ledger
fly deploy                                       # builds the root Dockerfile, ships it
fly open /console                                # see it running
```

**Keys in production (choose one):**
- *Simplest:* let the core generate its Ed25519 keypair on first boot — it lands on
  the `/data` volume (`KEYS_DIR=/data/keys`) and persists. Publish the public key:
  `curl https://<app>.fly.dev/beacon/pubkey`.
- *KMS/secret-store:* set the key via Fly secrets (never in the image/repo):
  ```bash
  fly secrets set BEACON_PRIVATE_KEY_PEM="$(cat private.pem)" BEACON_PUBLIC_KEY_PEM="$(cat public.pem)"
  ```

**Broker secrets (optional, for the full tool-run loop):** the FileProvider reads a
gitignored store. In prod, mount/inject it or move to VaultProvider (Ticket 2). Until
then, `decide(approve)` for an unknown scope fails closed (visible in the console).

## Verify it from anywhere
- `GET /status` — health + ledger validity + key id.
- `GET /beacon/pubkey` — the published verification key.
- `npm run export:evidence` (in `core/`) → an offline-verifiable bundle (`verify.sh`
  for OpenSSL 3.x, `verify.mjs` for Node anywhere).

## What's still a human decision
- **Domain/DNS** for a custom URL (registrar change — irreversible-boundary).
- **OIDC provider** (Ticket 8) for real member/steward login instead of the anon stub.
- **The live SSE oversight console UI** (Ticket 6) — this Control Room is the v1;
  a streaming steward dashboard is the next product step.
