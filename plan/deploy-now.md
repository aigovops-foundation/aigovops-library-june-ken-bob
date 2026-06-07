# Deploy the AiGovOps Library core to Fly — runbook

Self-contained steps to make the hosted app live with GitHub sign-in. App:
`aigovops-library-core` (region `iad`, already created; volume `aigov_data`).
Live URL: https://aigovops-library-core.fly.dev

> All code (auth, Ollama router, agents, approval queue, live oversight, widget,
> finance stub) is on `main`, 85/85 tests. The **live app runs the old, open,
> pre-auth build** until this deploy. Deploy is the human's click.

## Step 1 — create a GitHub OAuth app (browser)
GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**:
- Application name: `AiGovOps Library`
- Homepage URL: `https://aigovops-library-core.fly.dev`
- Authorization callback URL: `https://aigovops-library-core.fly.dev/auth/callback`

Register → **Generate a new client secret** → copy the **Client ID** and **Client secret**.

## Step 2 — set secrets + deploy (fill the 4 blanks)
```bash
cd ~/Downloads/_aigov/aigovops-library
~/.fly/bin/flyctl secrets set -a aigovops-library-core \
  GITHUB_CLIENT_ID=<paste-client-id> \
  GITHUB_CLIENT_SECRET=<paste-client-secret> \
  SESSION_SECRET=$(openssl rand -hex 32) \
  STEWARDS=<your-github-login>,<ken-github-login> \
  OAUTH_REDIRECT_URI=https://aigovops-library-core.fly.dev/auth/callback
~/.fly/bin/flyctl deploy -a aigovops-library-core
```
(~3–4 min; Fly remote builder — no local Docker needed.)

## Step 3 — verify
```bash
curl -s https://aigovops-library-core.fly.dev/auth/me   # expect {"authenticated":false,"oauth":true}
curl -s https://aigovops-library-core.fly.dev/status     # healthy
```
Open https://aigovops-library-core.fly.dev/console → **Sign in with GitHub** → Front
desk, Approval queue, live Oversight. Writes gated: members propose, stewards approve.

## Fallback — deploy now, OAuth later
`~/.fly/bin/flyctl deploy -a aigovops-library-core` alone closes the open door now;
writes return 401 until the OAuth secrets above are set (reads + widget still work).

## Notes
- Ollama can't run on the 256 MB VM → hosted answers stay heuristic; local dev is real.
- Postgres: `fly postgres create` → `fly secrets set DATABASE_URL=…` (+ `npm i pg`).
- See also `DEPLOY.md` (local/VPS/Fly overview) and `plan/overnight-status-2026-06-07.md`.
