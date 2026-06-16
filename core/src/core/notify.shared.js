// src/core/notify.shared.js
// SINGLE SOURCE OF TRUTH for the Notifier (outbound delivery) contract — Hermes.
// Environment-neutral (no Node, fs, or crypto APIs) so the *contract* is defined
// once and every channel implements the same shape: dashboard, email, sms, voice,
// telegram. Hermes (the brain, in agents.js) DECIDES what to send; a Notifier
// (the pipe) DELIVERS it. The pipe has no model, no memory, no tools — that is
// what makes it more reliable than an agentic messenger.
//
// THE RELIABILITY RULES (every channel obeys them, enforced by the orchestrator):
//   • at-least-once with idempotency-key dedupe (no double-send in a window)
//   • bounded retry + backoff, then dead-letter (a failure is visible, never silent)
//   • metadata-only receipts (kind/severity/audience/contentHash — never the body)
//   • fail-closed: an unconfigured or egress-denied channel refuses, loudly.

// Severity, lowest → highest. Drives the auto-send-vs-gate policy and routing.
export const SEVERITY = ['debug', 'info', 'warn', 'critical'];

// The channels Hermes knows how to drive. 'dashboard' is the always-on, no-egress
// default; the rest reach outside and need a declared host + broker credential.
export const CHANNELS = ['dashboard', 'email', 'sms', 'voice', 'telegram'];

// Notification "kinds" — the shape of the thing being delivered. Used by the
// policy to decide auto-send vs human gate, and recorded (kind only) in the ledger.
export const KINDS = ['system', 'health', 'gate-pending', 'alert', 'report', 'message'];

// Typed error so callers/tests can assert the fail-closed path precisely.
export class NotifyError extends Error {
  constructor(reason, message) { super(message || reason); this.name = 'NotifyError'; this.reason = reason; }
}

// Normalize + validate a message envelope. `summary`/`body` are the ACTUAL text
// delivered to the channel; they are never logged or put in a receipt. Returns a
// frozen, validated copy. Throws NotifyError on a malformed message (fail loud).
export function normalizeMessage(msg = {}) {
  const kind = String(msg.kind || 'message');
  const severity = String(msg.severity || 'info');
  if (!KINDS.includes(kind)) throw new NotifyError('bad-kind', `unknown kind '${kind}'`);
  if (!SEVERITY.includes(severity)) throw new NotifyError('bad-severity', `unknown severity '${severity}'`);
  const summary = String(msg.summary || '').trim();
  if (!summary) throw new NotifyError('empty', 'a notification needs a summary');
  // Audience pins the feed/stream scoping: 'stewards', 'members', or a member id
  // like 'github:login' / 'oidc:ken'. Anything else fails closed (no silent
  // mis-scope) rather than landing in an unreadable bucket.
  const audience = String(msg.audience || 'stewards');
  if (!['stewards', 'members'].includes(audience) && !/^[a-z0-9_-]+:.+/i.test(audience)) {
    throw new NotifyError('bad-audience', "audience must be 'stewards', 'members', or a member id (scheme:value)");
  }
  return Object.freeze({
    kind, severity, summary,
    body: msg.body != null ? String(msg.body) : '',
    to: msg.to != null ? String(msg.to) : '',          // channel-specific address (phone, chat id, email)
    audience,
    idempotencyKey: msg.idempotencyKey ? String(msg.idempotencyKey) : null,
  });
}

// Build the METADATA-ONLY receipt detail for one delivery. By construction it
// carries no message body — only the shape of what happened. The orchestrator
// passes this straight to Beacon as the receipt's `detail`.
export function notifyReceiptDetail({ channel, kind, severity, audience, contentHash, delivered, attempts, deadlettered = false, idempotencyKey = null }) {
  const d = { channel, kind, severity, audience, contentHash, delivered: !!delivered, attempts: Number(attempts) || 0 };
  if (deadlettered) d.deadlettered = true;
  if (idempotencyKey) d.idempotencyKey = idempotencyKey;
  return d;
}

// The contract. Channels extend this; the orchestrator codes against THIS shape
// only. send() returns delivery METADATA, never the payload. A channel that isn't
// wired returns configured()===false and the orchestrator skips/fails it closed.
export class Notifier {
  /** @returns {string} short channel name, one of CHANNELS */
  get name() { throw new NotifyError('not-implemented', 'name not implemented'); }
  /** @returns {boolean} are the credentials + target present for this channel? */
  configured() { return false; }
  /** @returns {string[]} external hosts this channel will contact (for the egress allow-list) */
  hosts() { return []; }
  /** Deliver. @returns {Promise<{delivered:boolean, id?:string, detail?:string}>} — METADATA ONLY */
  async send(/* normalizedMessage */) { throw new NotifyError('not-implemented', 'send() not implemented'); }
  /** @returns {Promise<{ok:boolean, channel:string, detail?:string}>} */
  async health() { return { ok: this.configured(), channel: this.name, detail: this.configured() ? 'configured' : 'not-configured' }; }
}
