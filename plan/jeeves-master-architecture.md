# Jeeves as the master agent — one mind that runs the estate (proposal)

> Status: **proposal for Bob & Ken**, 2026-06-21. The diagram of this lives in the chat;
> this is the durable write-up. Nothing here is wired up beyond the `reports_to: jeeves`
> hierarchy + `cadence:` already added to `agents.yaml` and `FLEET-AUTONOMY.md`.

## The thesis

Stop thinking in *agents* and start thinking in *one manager, a brain, and a small set of
departments*. Today there are ~35 named agents — that's an org chart no human can hold and a
lot of near-duplicate prompt logic. Replace it with **one master agent (Jeeves)** that owns
every function of the four web properties, a **shared brain** it thinks with, and **~9
functional departments** it dispatches — all bounded by the **gate** that already makes this
safe. Most work runs automatically; Ken and Bob touch only the irreversible.

## What changes: 35 agents → 9 departments

The current roster is really a handful of *functions* wearing many names. Collapse them:

| Department | Absorbs (today's agents) | Cast role | Does automatically |
|---|---|---|---|
| **Dev** | aigovops-agent-deploy, -release, -config, automation | Maker + Deploy | build pages/skills, branch → PR → ship (Devin-style loop) |
| **Test** | aigovops-agent-testing | Cloud-Mary | unit · e2e · a11y · responsive · scale · chaos = the CI gate |
| **UX** | aigovops-agent-design, -experience | Aperture | design system, flows, accessibility-by-construction |
| **UA** (user-assist) | curriculum, newsletter, intel-content, translations | Scribe + Polyglot | docs, in-context help, courses, i18n, the Concierge front desk |
| **Compliance** | aigovops-agent-governance, -vendor-rfi | Lantern | framework-map → controls (Umbrella), "what applies" |
| **Evidence** | auditor | Beacon | sign receipts, keep/verify the ledger, export audit bundles |
| **Security** | aigovops-agent-security, linkedin-guardian | Guardian | secret/PII scan, threat model, least-privilege review |
| **Ops** | aigovops-agent-uptime, -resilience, -communications, -onboarding | Sentinel | monitor, alert, backup/restore, channel health |
| **Community** | welcomer, curator, moderator, host, pollster, treasurer, social | Host + Herald | members, courses, posts/polls/events, contributions, reports |

(Bob's *personal* fleet — inbox, calendar, job-search, home-asset, assistant-bob/ken — is a
separate "Personal" org, not part of running the websites. Keep it distinct.)

A department is **one lead agent + a skill set**; it spawns **ephemeral workers** for parallel
jobs (the Claude subagent pattern) and disbands them. Nine durable leads instead of 35 standing
agents.

## The brain (shared cognition)

Departments stay thin because the thinking is shared. Four faculties:

- **Router** — classify an incoming goal/message and hand off to the right department, in the
  member's language. (OpenAI-style *handoffs*; Hermes as the messenger fabric.)
- **Planner** — decompose a goal into a task plan/DAG, assign, track to done, replan on failure.
  (Devin's watchable planner; Claude's plan mode.)
- **Memory** — durable facts + the **signed ledger as episodic memory** (what happened, provably)
  + steward preferences.
- **Knowledge** — the corpus: frameworks, the skill catalog, design tokens, and a live
  world-model of the four sites (what exists, where, how it deploys).

## Jeeves — the manager

Jeeves is the only agent that (a) reads goals from any source — a steward, a cron, a webhook, a
channel message; (b) asks the brain to plan; (c) dispatches tasks to departments on each
department's `cadence`; (d) watches the gate's `?` queue and **batches every held action into
one list** for Ken/Bob with ETAs; (e) audits the fleet and reports. Jeeves holds no credentials
and performs no effect itself — it routes and escalates. `manages: all-agents`,
`reports_to: [bobrapp, kenjohnston01]`.

## The autonomy loop

`goal in → Router → Planner → Jeeves dispatches → department runs a skill → the gate decides:
1 proceeds (reversible) · ? parks for a steward (irreversible) → Jeeves batches ?s to Ken/Bob →
on yes, the broker mints a 60-s scoped token → the tool runs sandboxed → Beacon signs the
receipt → Ops watches → Herald reports → loop.`

**Mostly automatic** = the loop runs continuously; humans appear only at the `?` queue and the
kill switch. (See `FLEET-AUTONOMY.md` for the honest framing: automatic for all *reversible*
work, a human holds every *irreversible* move — not "no humans.")

## What we borrow (and where we go further)

- **Devin (Cognition)** — the long-horizon, sandboxed dev loop (plan → code → test → iterate)
  and a planner you can watch and steer → the **Dev** department + the Planner faculty.
- **Claude (Code / Agent SDK)** — orchestrator + ephemeral subagents, **Skills** as the shared
  capability library, **MCP** for typed tool access, context/memory management → Jeeves +
  departments + the skill library.
- **OpenAI (Agents SDK / Swarm)** — **handoffs** and function-calling discipline + guardrails →
  the Router.
- **Hermes** — the messenger/intent fabric across channels (and an open-weight model option for
  cost/sovereignty on the OpenClaw host) → the Concierge voice + Router I/O.
- **OpenClaw / Clawbot / Moltbot** — the hardened, sandboxed substrate with native
  WhatsApp/Telegram/Slack/Discord and audit logging → the body everything runs in.

**Where AiGovOps is different:** every system above secures agents with prompts, policy, and a
sandbox. We add a **cryptographically enforced reversibility boundary** — no ambient authority,
every effect brokered with a short-lived scoped token and signed into a hash-chained ledger,
every irreversible action held for a named human. That's the moat: *agents do the bureaucracy;
humans hold the keys.* It's the one thing Devin/Claude/OpenAI don't give you out of the box.

## Migration (incremental, each step reversible)

1. **Label** — add `department:` to every entry in `agents.yaml` (group the 35 into the 9). No
   behavior change. ✅ groundwork done (`archetype:`, `reports_to: jeeves`, `cadence:`).
2. **Brain v1** — implement the Planner + `?`-queue batching in Jeeves (the highest-leverage
   piece: one queue for Ken/Bob).
3. **Collapse** — turn each department into one lead + skills + ephemeral workers; retire the
   redundant standing agents.
4. **Measure** — Jeeves emits the auto-vs-held ratio so "% automatic" is measured, not asserted.
5. **Channels** — wire Hermes/OpenClaw so a steward can approve a `?` from Slack/Telegram, not
   just the cockpit.

## Open decisions for Bob & Ken

- The 9-department split above — right granularity, or merge any (e.g. Evidence into Compliance)?
- Brain models: one strong model for the Planner (Claude) + a cheap/open model (Hermes) for
  routine routing on the host — or all Claude for now?
- Where the brain's memory lives: extend the existing ledger/`HIBT.md`, or a dedicated store?
- First department to fully convert to the lead+workers pattern (suggest **Dev** or **Community**).
