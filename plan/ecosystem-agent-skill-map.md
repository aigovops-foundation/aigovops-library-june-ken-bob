# Agent & skill taxonomy — reconciling the cast with the deployment (proposal)

> Status: **proposal for Bob/Ken**. Nothing here is wired up yet. It documents the drift
> found in the 2026-06-21 cross-site sync review and proposes how to make the library's
> named cast and the deployed Omni community agree.

## The drift

There are two agent vocabularies, and they don't line up:

- **The library (this repo)** defines a **13-agent cast** with archetypal, human-facing names
  (`plan/agents.md`): Concierge · Lantern · Beacon · Maker · Scribe · Cloud-Mary · Polyglot ·
  Aperture · Sentinel · Herald · Guardian · Host · Deploy.
- **The deployed membership platform** (`bobrapp/Omni-Rapp-June-2026`, `agents.yaml`) runs a
  *different, larger* roster of ~30 implementation agents (jeeves, curriculum, welcomer,
  curator, moderator, auditor, `aigovops-agent-*`, plus personal-fleet agents).

Two specific collisions:
1. **Lantern and Beacon are *agents* in the library but *products* on the Foundation site**
   (Beacon = scanner/signer, Umbrella = compiler, Lantern = reader/report). Same names, two
   meanings.
2. The library's **skill catalog** (`framework-map`, `beacon-sign-evidence`, …) and Omni's
   **effectors** (`publish_course`, `draft_control`, …) overlap in concept but share no names.

## Proposed model

Keep the **13-agent cast as the canonical, human-facing vocabulary** (it's the story we tell
on the sites and in the docs). Treat each **deployed Omni agent as an implementation** that
maps to one cast role. Add a `role:` field to each entry in `agents.yaml` naming its archetype,
so the deployment is self-documenting and the map can't silently drift again.

Resolve the Beacon/Lantern collision by **scoping**: "Beacon" and "Lantern" name **products**
in public/product contexts (Foundation site), and name **internal agent roles** only inside the
governed core. The cast keeps the names; the products keep the names; context disambiguates.
(Already corrected on the Foundation site: Beacon signs · Umbrella compiles · Lantern reads.)

## Mapping: deployed Omni agent → library cast role

| Library role | Deployed Omni agent(s) |
|---|---|
| Concierge — welcome, intent, routing | `welcomer`, `jeeves` (task surface), `assistant-bob/ken` |
| Lantern — problem → frameworks → gates | `aigovops-agent-governance`, `aigovops-agent-vendor-rfi` |
| Beacon — sign receipts, keep the ledger | core ledger/beacon signing, `auditor` |
| Maker — design & build workflows/agents | `automation`, `aigovops-agent-config` |
| Scribe — docs + user assistance | `curriculum`, `curator`, `intel-content`, `newsletter` |
| Cloud-Mary — unit/e2e/scale/chaos tests | `aigovops-agent-testing` |
| Polyglot — translation & i18n | translations module (no dedicated agent yet) |
| Aperture — accessibility audits | `aigovops-agent-design` |
| Sentinel — monitoring, alerts, cap-and-pause | `aigovops-agent-uptime`, `aigovops-agent-resilience` |
| Herald — status / community reports | `aigovops-agent-experience`, `auditor` |
| Guardian — secret/PII scan, threat model | `aigovops-agent-security` |
| Host — member introductions | `host`, `curator`, `moderator` |
| Deploy — branch → test → PR → merge → publish | `aigovops-agent-deploy`, `aigovops-agent-release` |

**Deployed agents with no cast role** (real capabilities the library doesn't yet name):
`treasurer`/`aigovops-agent-finance`, `pollster`, `researcher`, `social`, `calendar`, `inbox`,
`job-search`, `linkedin-guardian`, `home-asset`. These are domain/commerce/personal-fleet
agents beyond the seven-room governance model.

## Mapping: library skill → Omni effector

| Library skill | Omni effector(s) |
|---|---|
| `framework-map` | `draft_control`, `emit_control`, `flag_violation` |
| `beacon-sign-evidence` | core ledger sign, `audit_report` |
| `accessibility-audit` | (design agent) |
| `security-privacy-review` | (security agent: audit secrets, verify signatures) |
| `monitor-and-alert` | `config_report` (uptime probes) |
| `status-report` | `audit_report`, `config_report` |
| `translate-and-sign` | translations module |
| `doc-generate` | `draft_post`, `publish_post`, `curate_digest` |
| `aigovops-deploy-workflow` | `draft_pr`, `open_pr`, `merge_pr`, `deploy`, `publish_to_site` |
| `cloud-mary-testing` | (testing agent) |
| *(missing — add to catalog)* | `publish_course`, `publish_poll`, `research_brief`, `create_contribution_link`, `newsletter_send`, `social_post` |

## Recommended next steps (each its own small change, on approval)

1. Add a `role:` archetype field to every agent in `agents.yaml` (purely additive, documents the map).
2. Add the six missing real capabilities above to the library skill catalog so it reflects what's deployed.
3. Add a one-line note to `plan/agents.md` pointing here, so the cast and the deployment stay linked.
4. Leave the deployed agent *names* alone (renaming a live fleet is high-cost, low-value).
