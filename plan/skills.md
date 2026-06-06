# The skills — reusable procedures the agents wield

A **skill** is a version-controlled `SKILL.md` (procedure, not facts). Live facts
live in `HIBT.md`. The same skills already operate the live site; new ones below
extend coverage to every discipline.

## Operating skills (exist today)
- `aigovops-deploy-workflow` — branch → Cloud-Mary → commit → PR → squash-merge → sync.
- `cloud-mary-testing` — run/extend the test suite (unit, e2e, scale, chaos).
- `marblism-chatbot-integration` — wire a backend to the chatbot safely (PROXY_URL, no keys in client).
- `hostinger-github-pages` / `github-pages-publish` — connect a domain, auto-deploy, serve the live page.
- `links-for-events` — update event/resource URLs in the chatbot and ship.

## Plan skills (new in this plan)
- `framework-map` — a problem → applicable frameworks → the gates you'll face.
- `beacon-sign-evidence` — build a metadata-only receipt, sign Ed25519, append to ledger.
- `design-system-apply` — apply the Beacon+library tokens to any surface.
- `ux-flow-spec` — produce a full flow spec (states, transitions, path to Yes).
- `ua-help-authoring` — author in-context help, tooltips, gate summaries.
- `doc-generate` — generate documentation from source + receipts.
- `translate-and-sign` — MT coverage → human review → signed locale bundle.
- `accessibility-audit` — audit a surface to WCAG 2.2 AA, fix, re-test.
- `monitor-and-alert` — health/gate/cap signals → alert → cap-and-pause.
- `status-report` — compose a report from signed evidence only.
- `security-privacy-review` — secret + PII scan, threat-model check, sign/block.

## How a skill ships
Skills are durable in the plan repo. To make one auto-load in a Claude environment,
copy it to the runtime user-skills path (e.g. `/mnt/skills/user/<name>/SKILL.md`);
the repo is the source of truth, the runtime location is a copy.
