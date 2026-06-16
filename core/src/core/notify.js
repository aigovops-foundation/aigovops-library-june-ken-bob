// src/core/notify.js
// HERMES ORCHESTRATOR — the runtime that turns "deliver this" into reliable,
// governed, metadata-only delivery across every channel. This is the pipe's
// discipline (the brain that DECIDES what to send is the `hermes` agent in
// agents.js + the gate). Responsibilities, all enforced here so no channel can
// forget them:
//   • idempotency — a repeat within the window is deduped, never double-sent
//   • retry + backoff — bounded, then DEAD-LETTER (a failure is visible)
//   • metadata-only receipts — one signed Beacon per send(), no body ever
//   • fan-out — dashboard always, plus any explicitly chosen/configured channels
//
// Dependency-free: Beacon + the channel adapters. All side-effecting collaborators
// (emit, sha256, sleep, now) are injectable so tests never touch the net or clock.

import { normalizeMessage, notifyReceiptDetail, NotifyError } from './notify.shared.js';
import { createChannels } from './notify.factory.js';
import * as beacon from './beacon.js';

const DEFAULT_RETRIES = Number(process.env.NOTIFY_RETRIES || 2);   // total attempts = retries + 1
const DEDUPE_WINDOW_MS = Number(process.env.NOTIFY_DEDUPE_MS || 5 * 60 * 1000);
const DEDUPE_MAX = Number(process.env.NOTIFY_DEDUPE_MAX || 5000);  // hard cap so the window map can't grow unbounded

export function createHermes(opts = {}) {
  const channels = opts.channels || createChannels(opts);
  const dashboard = channels.get('dashboard');
  const emit = opts.emit || ((m) => beacon.emit(m));
  const sha256 = opts.sha256 || beacon.sha256;
  const now = opts.now || (() => Date.now());
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const retries = opts.retries != null ? opts.retries : DEFAULT_RETRIES;

  const seen = new Map();          // idempotencyKey -> ts (dedupe window)
  const deadLetters = [];          // bounded ring of failed deliveries (metadata only)
  const DEAD_CAP = opts.deadCap || 100;

  function dedupe(key) {
    const t = now();
    for (const [k, ts] of seen) if (t - ts > DEDUPE_WINDOW_MS) seen.delete(k);   // evict old (by age)
    if (seen.has(key)) return true;
    seen.set(key, t);
    while (seen.size > DEDUPE_MAX) seen.delete(seen.keys().next().value);         // evict oldest (by count)
    return false;
  }

  // Deliver to one channel with bounded retry + backoff. Returns a metadata
  // result; never throws (a channel failure becomes a dead-letter, not a crash).
  async function deliver(ch, msg) {
    let attempts = 0, lastErr = null;
    while (attempts <= retries) {
      attempts++;
      try {
        const r = await ch.send(msg);
        return { channel: ch.name, delivered: true, attempts, id: r.id, detail: r.detail };
      } catch (e) {
        lastErr = e;
        // Don't retry a deterministic config/egress error — it will never succeed.
        if (e instanceof NotifyError && ['not-configured', 'no-recipient', 'egress-denied', 'bad-url'].includes(e.reason)) break;
        if (attempts <= retries) await sleep(Math.min(2000, 50 * 2 ** (attempts - 1)));
      }
    }
    const dl = { channel: ch.name, delivered: false, attempts, deadlettered: true, reason: (lastErr && lastErr.reason) || 'failed', ts: new Date(now()).toISOString() };
    deadLetters.push({ ...dl, kind: msg.kind, severity: msg.severity, audience: msg.audience });
    if (deadLetters.length > DEAD_CAP) deadLetters.shift();
    return dl;
  }

  // The one public verb. Hermes sends a normalized message across the chosen (or
  // all configured) channels, dedupes, and writes ONE metadata-only receipt.
  async function send(raw, { channels: pick = null, actor = 'agent:hermes' } = {}) {
    const msg = normalizeMessage(raw);
    const contentHash = sha256(`${msg.summary}\n${msg.body}`);
    const idem = msg.idempotencyKey || sha256(`${msg.kind}|${msg.audience}|${msg.to}|${contentHash}`);
    if (dedupe(idem)) return { deduped: true, idempotencyKey: idem, contentHash };

    // Resolve target channels: explicit pick (validated against the live map),
    // else every configured channel. Dashboard is always included.
    let targets;
    if (pick && pick.length) {
      targets = pick.map((n) => channels.get(n)).filter(Boolean);
      if (!targets.some((c) => c.name === 'dashboard')) targets.unshift(dashboard);
    } else {
      targets = [...channels.values()].filter((c) => c.name === 'dashboard' || c.configured());
    }

    const results = [];
    for (const ch of targets) results.push(await deliver(ch, msg));

    const receipt = emit({
      kind: 'notify', actor, action: 'deliver', contentHash,
      detail: {
        kind: msg.kind, severity: msg.severity, audience: msg.audience, idempotencyKey: idem,
        channels: results.map((r) => notifyReceiptDetail({
          channel: r.channel, kind: msg.kind, severity: msg.severity, audience: msg.audience,
          contentHash, delivered: r.delivered, attempts: r.attempts, deadlettered: !!r.deadlettered, idempotencyKey: idem,
        })),
      },
    });

    return {
      id: idem, contentHash,
      results: results.map(({ channel, delivered, attempts, deadlettered, reason }) => ({ channel, delivered, attempts, deadlettered: !!deadlettered, reason })),
      delivered: results.some((r) => r.delivered),
      signed: receipt ? { kid: receipt.kid, ts: receipt.record.ts } : null,
    };
  }

  async function health() {
    const out = [];
    for (const ch of channels.values()) out.push(await ch.health());
    return out;
  }

  return {
    send,
    health,
    dashboard,
    channels,
    feed: (o) => dashboard.feed(o),
    subscribe: (fn) => dashboard.subscribe(fn),
    deadLetters: () => deadLetters.slice(),
  };
}
