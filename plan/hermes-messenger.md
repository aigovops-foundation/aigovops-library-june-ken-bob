# Hermes — the governed messenger

> Status: **design / spec** (not built). Decision pending: which delivery backend.
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

## Open decisions to settle before building

1. **Backend:** A (ntfy on-box), B (Slack/Telegram webhook), or C (govern OpenClaw)?
2. **Auto-send vs gated, per notification kind** — which narrow internal class, if
   any, may Hermes send without a steward click?
3. **Audiences** — stewards-only first, or member-facing from day one (changes the
   gating and the i18n surface)?
4. **ntfy auth** (if A) — access-token topic vs. open topic behind Caddy basic-auth.
