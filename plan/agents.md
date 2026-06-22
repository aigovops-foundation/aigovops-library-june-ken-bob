# The cast — the library staff (agents)

Each agent is a **role** with a narrow, **reversible** capability dial and a named
human it answers to. Agents propose; humans approve anything irreversible
(propose-not-execute). All agents speak the member's language.

| Agent | Room | Does (the bureaucracy) | Wields (skills) | Answers to |
|---|---|---|---|---|
| **Concierge** | Front Desk | In-language welcome, intent, routing | framework-map | the member |
| **Lantern** | Reading Room | Maps a problem → frameworks → gates | framework-map | architecture review |
| **Beacon** | Archives | Signs receipts, keeps the ledger | beacon-sign-evidence | Guardian |
| **Maker** | Makerspace | Designs & builds workflows/agents | design-system-apply, ux-flow-spec | human design approval |
| **Scribe** | Reading Room / Front Desk | Docs + user assistance | doc-generate, ua-help-authoring | maintainer / editor |
| **Cloud-Mary** | Makerspace | Runs unit/e2e/scale/chaos tests | cloud-mary-testing | CI gate |
| **Polyglot** | all rooms | Translation & i18n | translate-and-sign | per-locale reviewer |
| **Aperture** | all rooms | Accessibility audits (WCAG 2.2 AA) | accessibility-audit | a11y sign-off |
| **Sentinel** | Status | Monitoring, alerts, cap-and-pause | monitor-and-alert | on-call human |
| **Herald** | Status | Status / leadership / community reports | status-report | leadership (Bob/Ken) |
| **Guardian** | the gateway | Secret/PII scan, threat model | security-privacy-review | human exposure approval |
| **Host** | Coffee Shop | Member introductions over global tables | links-for-events | the members |
| **Deploy** | CI/CD | Branch → test → PR → merge → publish | aigovops-deploy-workflow, github-pages-publish | **Bob/Ken (irreversible click)** |

> This is the canonical **cast** (the human-facing vocabulary). The deployed membership
> community runs a larger implementation roster; each of those agents is tagged with its
> cast `archetype:` in `agents.yaml`. Full mapping + the skill↔effector table:
> [`plan/ecosystem-agent-skill-map.md`](ecosystem-agent-skill-map.md).

## Capability dial (every agent + member)
`read → propose → auto-within-caps`. Defaults are narrow; trust widens the dial;
one toggle narrows it again. Spend and blast-radius are hard-capped; agents
**pause at the cap** rather than push through. Tools run sandboxed, least-privilege,
no ambient credentials.

## Build-your-own-agent (governed)
Members compose agents in the Makerspace. Those agents **inherit** the same gates,
caps, and signing — capability is a dial they earn, not a switch they flip.
