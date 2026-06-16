// src/core/notify.factory.js
// CONFIG-ONLY channel selection for Hermes (the same discipline as the secrets
// factory). NOTIFY_CHANNELS picks which pipes are live; each external channel
// self-disables (configured()===false) if its broker credential is absent, so the
// dashboard always works and a half-configured channel fails closed, never silent.
//
//   NOTIFY_CHANNELS=dashboard,telegram,email,sms,voice   (default: dashboard)

import { CHANNELS } from './notify.shared.js';
import { DashboardNotifier } from './notify.dashboard.js';
import { EmailNotifier } from './notify.email.js';
import { SmsNotifier } from './notify.sms.js';
import { VoiceNotifier } from './notify.voice.js';
import { TelegramNotifier } from './notify.telegram.js';

const BUILDERS = {
  email: (o) => new EmailNotifier(o),
  sms: (o) => new SmsNotifier(o),
  voice: (o) => new VoiceNotifier(o),
  telegram: (o) => new TelegramNotifier(o),
};

export function resolveChannels(opts = {}) {
  const raw = opts.channels || process.env.NOTIFY_CHANNELS || 'dashboard';
  const wanted = String(raw).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  // dashboard is always present (the always-on operator surface); de-dupe + validate.
  const set = new Set(['dashboard', ...wanted]);
  for (const c of set) if (!CHANNELS.includes(c)) throw new Error(`unknown notify channel '${c}' (expected: ${CHANNELS.join(', ')})`);
  return [...set];
}

// Build the live channel map. `dashboard` may be injected (shared with the SSE
// feed); the rest take per-adapter opts (mainly a `transport` for tests).
export function createChannels(opts = {}) {
  const names = resolveChannels(opts);
  const map = new Map();
  map.set('dashboard', opts.dashboard || new DashboardNotifier(opts.dashboardOpts || {}));
  for (const name of names) {
    if (name === 'dashboard') continue;
    map.set(name, BUILDERS[name](opts[name] || {}));
  }
  return map;
}

// Secret-free posture for /status + the management UI: which channels are wanted,
// and whether each is actually wired (credentials present). No tokens, ever.
export function notifyPosture(opts = {}) {
  const map = opts.channels instanceof Map ? opts.channels : createChannels(opts);
  return [...map.values()].map((ch) => ({ channel: ch.name, configured: ch.configured(), egress: ch.hosts() }));
}

// --- auto-send vs human gate (the outward-facing-act rule) -------------------
// Sending a message on someone's behalf is permissioned. So Hermes PROPOSES by
// default; only a NARROW internal class auto-sends: steward-audience operational
// kinds. Anything member/external-facing, or a free-form 'message'/'report' to
// non-stewards, goes to the gate.
export function autosendKinds() {
  return String(process.env.NOTIFY_AUTOSEND_KINDS || 'system,health,gate-pending,alert')
    .split(',').map((s) => s.trim()).filter(Boolean);
}

export function notifyDecision({ kind, audience }) {
  if (audience !== 'stewards') return 'gate';        // member/external-facing → human approves
  return autosendKinds().includes(kind) ? 'auto' : 'gate';
}
