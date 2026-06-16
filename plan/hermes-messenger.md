# Hermes — the governed messenger

> Status: **BUILT** (2026-06-15) — dependency-free, 23 tests green. Live channels:
> dashboard (always-on) + email · sms · voice · telegram (config + broker creds),
> a two-way Telegram founder bridge, and a management UI at `/messaging`.
> "Agents do the bureaucracy; humans hold the meaning — and humans hold the keys."

Hermes is the courier the rest of the staff have lacked: the piece that *delivers*
what Sentinel notices, what Herald writes, and the "a proposal is waiting at the
gate" nudge a steward needs. It is the messenger — **reliably**, which is the whole
point, and the reason it is **not** built the way a clawbot/OpenClaw is built.

## The one design decision that defines Hermes

**Split the brain from the pipe.** Two jobs that look like one:

1. **Decide** *what* to send, *to whom*, *when* — judgement, context, governance.
2. **Deliver** that message — a dumb, single-purpose transport.

Conflating them is exactly what makes an agentic messenger (clawbot, OpenClaw,
Nous "Hermes Agent") unreliable: an LLM agent wanders, hallucinates a recipient,
or stalls — *in the delivery step*, where you want a pipe that either sends or
loudly fails. So:

- **Hermes = a governed agent *in core*** — the brain. Propose-only, metadata-only
  receipts, sits in the roster next to Sentinel and Herald. It never holds a
  channel credential and never "acts" on the outside world directly.
- **Delivery = a swappable transport seam** — the pipe. The same factory pattern as
  `SecretsProvider` and the sandbox: one interface, the strongest/most-appropriate
  backend per environment, selected by config with **no code change** at the call
  site.

This keeps the project honest with itself: we do not run an **ungoverned autonomous
agent at the heart of the governance backbone**. Hermes proposes; a transport with
no autonomy delivers; the ledger records that it happened — metadata only.

## Why not just deploy OpenClaw / Hermes-Agent as the messenger

Plainly, because it inverts the thesis. OpenClaw is an autonomous agent that
"executes tools and commands" and reaches WhatsApp/Telegram/Slack/Discord/Signal.
That is precisely the class of actor AiGovOps exists to *wrap*, not to *be*. Making
it the courier would:

- put an ungoverned, tool-executing agent inside the trust boundary;
- make delivery *less* reliable (an LLM for a job a 200-line server does perfectly);
- undercut the enclave story (an air-gapped customer cannot ship a chatty cloud agent).

OpenClaw has a legitimate place — but as a **governed subject behind the gate** (see
Backend C), not as Hermes itself.

## The agent (the brain) — `hermes` in the roster

Mirrors `core/src/core/agents.js`. Propose-only, like every other agent.

```
hermes:  { title: 'Hermes · Messenger', skill: 'notify-deliver',
           match: /notify|message|deliver|send (an? )?(alert|update|report|ping)|tell|inform|courier/i }
```

What Hermes does on dispatch:

- assembles a **notification proposal**: `{ kind, audience, severity, summary,
  contentHash, channel? }` — never the raw payload in the receipt;
- routes through the **policy** for whether this notification may **auto-send** or
  must be **gated** (below);
- on send, calls the active `Notifier` transport and emits a metadata-only Beacon
  receipt (`kind: 'notify'`, actor, audience, severity, contentHash, transport,
  delivered|deadlettered).

Hermes is also the common courier the other agents *route through* rather than each
inventing delivery: Sentinel's alerts, Herald's reports, and the gate's
"proposal-pending" nudges all become `hermes.notify(...)` calls.

## The transport seam (the pipe) — `Notifier`

One interface, config-only swap (`NOTIFY_PROFILE`, like `SECRETS_PROFILE`):

```
interface Notifier {
  notify({ kind, audience, severity, summary, contentHash, idempotencyKey })
    -> { delivered: bool, id, transport, attempts }   // synchronous-contract, fail-closed
  health() -> { ok, transport, detail }
}
```

Factory: `core/src/core/notify.factory.js` → `createNotifier({ profile })`.
Default profile **`null`** (no-op + log line) keeps the core dependency-free and
safe out of the box — exactly how `lab`/FileProvider keeps secrets safe by default.

### The three backends (this is the "decide later")

| | **A — ntfy (self-host)** | **B — webhook (Slack/Telegram)** | **C — OpenClaw (two-way)** |
|---|---|---|---|
| Shape | dumb push server, HTTP POST → topic | outbound POST to a vendor URL | full autonomous agent, conversational |
| Where | **one more container in our compose** (5.8 GB free on the box) | external SaaS | its own droplet ($12/mo, DO 1-click) |
| Reach | phone/desktop/web; webhook out | Slack/Telegram | WhatsApp/Telegram/Slack/Discord/Signal |
| Egress | none leaves the box (Caddy TLS, localhost) | **must be on the egress allow-list** | broad; must be **governed behind the MCP gate** |
| Governance | inside the perimeter; cleanest | one declared outbound host | heaviest — an agent to govern, not a pipe |
| Reliability | highest (single purpose, restarts clean) | high (vendor SLA) | lowest (LLM in the delivery path) |
| Effort | S–M (add service + provider) | S (provider only) | L (separate project) |
| Two-way? | no (delivery only) | no (delivery only) | **yes** (the only reason to pick it) |

**Recommendation:** **A** for "reliably deliver alerts/reports/pings" — most
governed, most reliable, no new droplet. **B** when you specifically want Slack/
Telegram reach and accept one outbound egress dependency. **C** *only* if the real
goal is *conversing with the Foundation over chat* — and then OpenClaw runs as a
**governed subject** (proposals flow back through `/api/gov`), never as a free actor.
The seam means we can ship A now and add B/C later without touching Hermes.

## Governance properties (non-negotiable, all backends)

- **Metadata-only ledger.** A receipt says *a notification of kind X, severity Y,
  went to audience Z, content sha256 = …, via transport T, delivered/deadlettered*.
  Never the message body, never PII. Same rule as beacons today.
- **The send is an outward-facing act.** Per the project's own safety contract,
  "sending a message on the user's behalf" is permissioned. Default Hermes therefore
  **proposes**; a steward approves at the gate. A **policy allow-list** may auto-send
  a *narrow* class — internal, low-severity, steward-only system pings (e.g.
  "proposal pending", "core unhealthy") — because the recipient is the operator and
  the channel is ours. Anything member-facing or external stays gated. This per-kind
  auto-vs-gate table is an explicit decision to make before build.
- **Egress is declared.** Backend B/C transports add an outbound host; it must be on
  the sandbox/egress allow-list, or the send fails closed — no silent new egress.
- **No channel secret reaches an agent.** The ntfy token / Slack URL / Telegram
  token lives in the **secrets broker** (`op://AiGovOps/notify-<channel>/credential`),
  resolved by the transport, never handed to Hermes or any tool.

## Reliability design (the "more reliable than clawbot" requirement)

The pipe earns the word "reliable" by being boring:

- **at-least-once with dedupe** — every notification carries an `idempotencyKey`;
  the transport drops a duplicate within a window.
- **bounded retry + backoff**, then **dead-letter to the ledger** (metadata-only) so
  nothing fails silently — a steward can see "3 alerts undelivered."
- **`health()`** wired into `/readyz`-style checks; a dead transport is visible, not
  guessed.
- **single responsibility** — the pipe sends bytes; it has no model, no memory, no
  tools, nothing to wander into.

## Where it touches the code (for the build, when greenlit — not now)

- `core/src/core/agents.js` — add the `hermes` entry + `notify-deliver` skill.
- `core/src/core/notify.factory.js` + `notify.null.js` / `notify.ntfy.js` /
  `notify.webhook.js` — the seam and backends (null is dependency-free).
- `core/src/server.js` — a `POST /api/notify` (gated) + Hermes wired into the
  gate-pending and Sentinel/Herald paths.
- `core/src/core/policy*.js` — the per-kind auto-send vs gate rule.
- `deploy/docker-compose.yml` — (Backend A) an `ntfy` service bound to `127.0.0.1`,
  fronted by Caddy; broker item `notify-ntfy`.
- `core/test/notify.*.test.mjs` — provider contract + metadata-only + fail-closed.

## Two-way conversations for the founders

The sections above are Hermes *outbound* — the courier pushing alerts and reports.
Ken and Bob also want to talk *to* the Foundation, two-way, from their phones. The
key realisation: **two-way already exists, governed, today** — the conversational
console (`/console`, OIDC steward login, over Caddy TLS) is exactly that. What is
missing is **reach**: it is a browser tab, not the chat app in a pocket. So the
two-way feature is not "add a brain"; it is "add a transport to the brain we have."

### The shape: a bridge, not a second agent

```
Founder (phone) ──▶ chat app ──▶ Hermes bridge (relay) ──▶ core /api/ask ──▶ reply back
                                        │
                                effects → proposal → the gate (a human approves)
```

The **bridge is a dumb relay** — message in, reply out — holding no autonomy, no
model, no tools. It is the inbound twin of the outbound `Notifier`: the same
"transport, not agent" rule. It reuses the **one brain** (the governed core's
existing conversational endpoint), so there is nothing to keep in sync and nothing
ungoverned at the centre. This is why it is *more reliable* than a clawbot/OpenClaw
front-end: a relay has nowhere to wander.

### Recommendation: a Telegram bridge, founder-locked

For exactly two trusted, highest-privilege people, Telegram is the fastest path to
reliable mobile two-way: mature bot API, excellent phone clients, free, no infra.

- **Identity binding is the whole security model.** A static allow-list maps
  `telegram_user_id → steward identity` (Ken, Bob). Any other sender is rejected
  before a single token is spent — no open bot, ever. The mapping lives in config /
  the broker, not in the chat.
- **Effects stay gated.** The bridge may *surface* "a proposal is waiting — approve?"
  but the irreversible click remains a human move (in-app confirm that calls the
  gate, or a deep link to `/console`). The bot **cannot approve or act on its own** —
  the same boundary the whole project is built on.
- **Metadata-only ledger, unchanged.** A receipt records *a steward conversed via the
  telegram bridge, content sha256 = …* — never the message body.
- **Reuses the console brain.** Inbound text → `POST /api/ask` (steward-scoped) →
  reply. No second model, no divergent memory.

### The tradeoff that flips the choice: privacy

Telegram bot chats transit Telegram's cloud (not end-to-end). For ops chatter that
is fine, and the sensitive *approvals* never live in the chat anyway — they happen
at the gate. But if founder conversations themselves must be **E2E private** (true
to "humans hold the keys"), run the **same bridge over Signal** (`signal-cli` + a
dedicated number — heavier ops, full E2E). A third option, **self-hosted Mattermost**
(DO 1-click or a compose container), owns the whole chat server on your box at the
cost of running it. The bridge design is identical across all three; only the
transport adapter changes — the same swap-the-backend discipline as everywhere else.

### Not the brain: OpenClaw / Nous "Hermes Agent"

These give chat reach in one click, but as a *second, autonomous, tool-executing
agent* — two brains, the ungoverned one bypassing the gate. For a governance
company that is a credibility problem, and for two people it buys almost nothing a
relay does not. Govern one behind the gate only if you later want agentic
convenience; never as the path to plain two-way chat.

### Where the bridge touches the code (when greenlit — not now)

- `core/src/core/bridge.factory.js` + `bridge.telegram.js` (`bridge.signal.js` later)
  — the inbound transport seam; verifies sender against the founder allow-list,
  forwards to `/api/ask` as that steward, returns the reply.
- `core/src/server.js` — a webhook receiver (Telegram) or poller, steward-scoped;
  wires "proposal pending" deep links back to `/console`.
- broker item `bridge-telegram/credential` (the bot token) — never in a file.
- `core/test/bridge.*.test.mjs` — sender allow-list (reject unknown), effects-gated
  (no auto-approve), metadata-only receipts.

> Irreversible, founder-owned step at build time: **creating the bot token** (Telegram
> BotFather / a Signal number). Everything up to that line is code we prepare.

## As built (2026-06-15)

The brain/pipe split shipped exactly as designed, dependency-free (Node `https`
only), with 23 tests green.

**Modules** (`core/src/core/`): `notify.shared.js` (contract), `httpclient.js`
(egress-allow-listed `https`), `notify.dashboard.js`, `notify.email.js` (Postmark-
shape), `notify.sms.js` + `notify.voice.js` (Twilio), `notify.telegram.js`,
`notify.factory.js` (channel selection + posture + the auto-vs-gate policy),
`notify.js` (the orchestrator), `bridge.telegram.js` (inbound founder relay).
`hermes` is in the agent roster.

**HTTP surface** (`server.js`): `POST /api/notify` (gated), `GET /api/notify/channels`
(steward posture + health + dead-letters), `GET /api/notify/feed` + `/stream`
(role-scoped), `POST /api/notify/test`, `POST /api/bridge/telegram` (founder-gated
webhook). `/status` now carries a secret-free `notify` posture. Management UI at
**`/messaging`**.

**Governance, enforced + tested:** receipts are metadata-only (a test asserts the
summary/body never appear in the ledger); member/external-facing sends gate while
steward-audience operational kinds auto-send; the inbound bridge has no gov/tool
handle, so it cannot execute an effect; every outbound host is on the egress
allow-list or the send fails closed; channel tokens come from the broker.

**Reliability, tested:** idempotency-key dedupe, bounded retry → dead-letter (with
a no-retry fast-path for deterministic config errors), `health()` per channel.

### Operating it (config-only)

1. Enable channels: `NOTIFY_CHANNELS=dashboard,telegram,email,sms,voice`.
2. Put each channel's credential in the broker (`op://AiGovOps/notify-*`); see
   `deploy/.env.1password.tmpl` / `core/.env.example` for the exact keys.
3. Two-way: set `NOTIFY_TELEGRAM_FOUNDERS=<tg_id>:bob,<tg_id>:ken`, point the bot
   webhook at `/api/bridge/telegram` (with `NOTIFY_TELEGRAM_WEBHOOK_SECRET`).
4. Verify wiring from `/messaging` → "Send test notification" per channel.

> The one founder-owned, irreversible step remains **creating the bot token / Twilio
> + email accounts**. Everything else is code, in the broker, and one toggle.

## Still the human's call (config, not build)

1. **Backend (outbound):** A (ntfy on-box), B (Slack/Telegram webhook), or C
   (govern OpenClaw)?
2. **Two-way transport:** Telegram (fast, reliable, cloud-transit), Signal (E2E,
   heavier), or self-hosted Mattermost (own the server)?
3. **Auto-send vs gated, per notification kind** — which narrow internal class, if
   any, may Hermes send without a steward click?
4. **Audiences** — stewards-only first, or member-facing from day one (changes the
   gating and the i18n surface)?
5. **ntfy auth** (if A) — access-token topic vs. open topic behind Caddy basic-auth.
6. **Founder identity binding** — confirm the `telegram_user_id → steward` map for
   Ken and Bob, and where it is stored (broker vs config).
