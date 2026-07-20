# AiGovOps Library

**One combined repo for the whole set** — the vision, the feel, the build, the way it runs, and the running core of the AiGovOps Library.

> *"Agents do the bureaucracy; humans hold the meaning — and humans hold the keys."*

A shareable hub page (GitHub Pages) presents the non-secret story; the source of truth lives alongside it, private.

## The five pieces

| Piece | Where | What it is |
|---|---|---|
| **Hub** | [`docs/index.html`](docs/index.html) | The shareable landing page that connects everything. |
| **Demo** — *why* | [`docs/demo.html`](docs/demo.html) | The end-to-end community story on the Get/Stay/Recover-to-Yes spine. |
| **Design Book** — *feel* | [`docs/design-book.html`](docs/design-book.html) | Room illustrations, the world-libraries moodboard, the in-room interfaces. |
| **Blueprint** — *build* | [`docs/blueprint.html`](docs/blueprint.html) | The deployable architecture: backend, frontend, safety, security, privacy, logging, i18n, delight. |
| **Plan** — *operate* | [`docs/plan.html`](docs/plan.html) + [`plan/`](plan/) | Agents, skills, and twelve repeatable processes. |
| **Control Plane** — *govern* | [`docs/control-plane.html`](docs/control-plane.html) + [`plan/control-and-deployment.md`](plan/control-and-deployment.md) | One artifact for lab/community/enclave, the single agent chokepoint, the secrets broker, and real-time oversight — no agents gone wild. |
| **Build Tickets** — *do* | [`docs/build-tickets.html`](docs/build-tickets.html) + [`plan/build-tickets.md`](plan/build-tickets.md) | The backlog: Ticket 0 (SecretsProvider + FileProvider, fully specced) and the next ten big items, with sizes, deps, and milestones. |

**Operations (private, no public page):** `plan/account-registry.md` *(planned)* — pointer-only inventory of every service/account (no plaintext); `plan/credential-management.md` *(planned)* — password-manager choice + the safe dev-system credential hand-off; [`plan/skills/op-github-deploy/SKILL.md`](plan/skills/op-github-deploy/SKILL.md) — the skill that wires 1Password→GitHub Actions (one-approval, never handles the token); [`.github/workflows/op-secrets-check.yml`](.github/workflows/op-secrets-check.yml) — proof-of-connection workflow.
| **Core** — *run* | [`core/`](core/) | The running v1 governed core (Node, dependency-free). |

## Layout
```
aigovops-library/
├── docs/                     ← GitHub Pages root (the shareable, secret-free hub + the 4 pages)
│   ├── index.html  demo.html  design-book.html  blueprint.html  plan.html  control-plane.html  build-tickets.html
├── core/                     ← the running v1 governed core (docker compose up)
│   └── src · Dockerfile · compose.yml · test · README.md
├── plan/                     ← the private source of truth (no secrets)
│   ├── 00-overview.md · agents.md · skills.md
│   ├── processes/            ← 12 repeatable playbooks
│   └── skills/               ← 11 runnable SKILL.md (auto-loadable)
├── .github/workflows/        ← ci.yml (core tests) · pages.yml (publish docs/)
└── README.md
```

## Run the core
```bash
cd core
cp .env.example .env
cp secrets.local.example.json secrets.local.json   # enables the broker (full loop)
docker compose up        # → http://localhost:8787   (or: npm start)
npm test                 # sign/verify, tamper, policy, governed loop
npm run verify           # walk the ledger (openssl-verifiable)
```
Then open **http://localhost:8787/console** — the interactive **Control Room**: run
skills, drive the Yes-Gate loop (propose → decide → run → verify), and watch the
signed ledger. To host it (VPS or Fly.io), see [`DEPLOY.md`](DEPLOY.md).

## Run a skill (example)
```bash
# framework-map → the gates a problem faces
node -e "import('./core/src/core/policy.js').then(m=>console.log(JSON.stringify(m.evaluate('AI tool that screens job candidates'),null,2)))"
```


## Single source of truth (page + core share one logic)
The Yes-Gate logic lives once in [`core/src/core/yesgate.shared.js`](core/src/core/yesgate.shared.js). The Node core re-exports it (`policy.js`, `lantern.js`, `router.js`); the in-page "See it run" demo is generated from it by `npm run build:docs`, which inlines it into `docs/index.html` between markers. Edit the logic **only** in the shared file, then run the build (the Pages workflow runs it automatically). The page stays one self-contained file, so it works on `file://` and on Pages with no runtime import.
## Publish the shareable hub (GitHub Pages)
- **Simplest:** Settings → Pages → Deploy from a branch → `main` / `/docs`.
- **Or via Action:** enable Settings → Pages → Source: GitHub Actions (uses `.github/workflows/pages.yml`).
- Pages on a **private** repo needs a Team/Enterprise plan; otherwise keep the repo private and serve `docs/` from a public mirror or via Cloudflare (as the main site already is).

## ⚠️ The irreversibility boundary (yours to hold)
This repo is prepared and verified, ready to push. **Bob and Ken make the irreversible
clicks** — creating the repo, the first push, switching on Pages, DNS, registrar,
key enrollment — after the risk is flagged. It ships with **no keys and an empty ledger**.

```bash
tar -xzf aigovops-library.tar.gz && cd aigovops-library
git init && git add . && git commit -m "AiGovOps Library — the whole set (demo, design book, blueprint, plan, core)"
gh repo create aigovops-foundation/aigovops-library-june-ken-bob --private --source=. --remote=origin --push
# then: Settings → Pages → /docs
```

_Apache-2.0 · no SaaS lock-in · local-first · agent-first · English-first, global-always._
