# Foundation operations (personal account)

Foundation-branded work that still lives under bobrapp. The estate review flagged personal-account Foundation work as a risk.

| Repo | Owner | Updated | Licence |
|---|---|---|---|
| [AIGovOps Bot](#aigovops-bot) | `bobrapp` | 2026-10-08 | MIT |
| [AIUpdates](#aiupdates) | `bobrapp` | 2026-09-02 | MIT (README) |
| [Clean-room intake agent](#clean-room-intake-agent) | `bobrapp` | 2026-04-23 | see repo |
| [Hall of Justice League Portal v3](#hall-of-justice-league-portal-v3) | `bobrapp` | 2026-02-10 | MIT |
| [Vendor RFI (retired mirror)](#vendor-rfi-retired-mirror) | `bobrapp` | 2026-06-20 | Apache-2.0 |

## AIGovOps Bot

**Repo:** [bobrapp/ai-bob-setup-agent](https://github.com/bobrapp/ai-bob-setup-agent) · **Live:** <https://bobrapp.github.io/ai-bob-setup-agent> · **Stack:** Python

Telegram bot (@aigovops_bot) on Fly.io that runs the Foundation's ops: Gmail triage, drafting posts in the Foundation voice with approve/reject, research scans, per-agent LLM cost tracking, a Cedar-style YAML policy engine and an append-only audit trail. SQLite, 83 tests.

**Place in the practice:** Ops machinery.

- Live at aigovops-automation.fly.dev.

## AIUpdates

**Repo:** [bobrapp/aiupdates](https://github.com/bobrapp/aiupdates) · **Stack:** React/Express

'AI intelligence for practitioners, by the AiGovOps Foundation.' Monitors 1,000 sources across 11 tiers, summarizes changes with Gemini Flash, and feeds a dashboard, newsletter and immutable log. Membership tiers fund the Foundation.

**Place in the practice:** Revenue/content experiment.

- estate.yaml: role unknown, flagged as 'Foundation work in a personal account'.
- README links `aigovopsfoundation.org`.

## Clean-room intake agent

**Repo:** [bobrapp/ai-bob-external-to-internal-code-clean-room-agent](https://github.com/bobrapp/ai-bob-external-to-internal-code-clean-room-agent) · **Live:** <https://bobrapp.github.io/ai-bob-external-to-internal-code-clean-room-agent/> · **Stack:** YAML/Python

Portable `aigovops` subagent that moves external prototypes (Replit, Lovable, Cursor) into an internal GitHub estate under NIST SSDF, SLSA v1.0, OpenSSF Scorecard and UN R155. It has 10 hard rules, 7 stages with human approval at 4 and 7, and six SHA-pinned workflows. Runs on OpenAI Agents SDK, Claude Code, Lovable and Replit.

**Place in the practice:** Policy gate for code intake.


## Hall of Justice League Portal v3

**Repo:** [bobrapp/justice-league-v3-model-agnostic](https://github.com/bobrapp/justice-league-v3-model-agnostic) · **Stack:** Next.js (described)

Model-agnostic 'AIGovOps platform for enterprise agent swarms' where agents build agents, with Zero Trust, OWASP ASI Top-10 guardrails, human approval gates and audit logging. The repo holds only the README and LICENSE; the code is described, not committed.

**Place in the practice:** Early concept.


## Vendor RFI (retired mirror)

**Repo:** [bobrapp/aigov-ops-open-source-vendor-rfi-rapp-johnston-june-2026](https://github.com/bobrapp/aigov-ops-open-source-vendor-rfi-rapp-johnston-june-2026) · **Stack:** static HTML

Old source of the Vendor RFI. Its README says it moved to `aigovops-foundation/aigovops-vendor-rfi` and is archived/read-only.

**Place in the practice:** Retired.

Generated from repo READMEs, estate.yaml and the GitHub API on 2026-10-10.
