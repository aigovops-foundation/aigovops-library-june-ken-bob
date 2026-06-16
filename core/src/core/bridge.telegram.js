// src/core/bridge.telegram.js
// INBOUND founder bridge (two-way) — the dumb relay, not a second brain.
// A founder messages the bot; the bridge verifies the sender against a static
// allow-list, forwards the text to the SAME conversational brain the console
// uses, and sends the reply back. It holds no autonomy and executes nothing:
// any effect still goes through the gate in the console. This is why it is more
// reliable than an agentic front-end — it has nowhere to wander.
//
// SECURITY MODEL = identity binding. Only telegram_user_id values on the
// allow-list (mapped to a steward identity) are answered; everyone else is
// silently rejected (no oracle) and recorded as a metadata-only receipt.
//
//   NOTIFY_TELEGRAM_FOUNDERS=123456789:bob,987654321:ken   (telegram_id:steward)

import { respondAsync } from './router.js';
import { TelegramNotifier } from './notify.telegram.js';
import * as beacon from './beacon.js';

// Parse the founder allow-list into Map<telegram_id(string), steward login>.
export function parseFounders(raw = process.env.NOTIFY_TELEGRAM_FOUNDERS || '') {
  const map = new Map();
  for (const pair of String(raw).split(',').map((s) => s.trim()).filter(Boolean)) {
    const i = pair.indexOf(':');
    if (i <= 0) continue;
    map.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  return map;
}

// Pull the (sender id, chat id, text) out of a Telegram webhook update, tolerating
// the message vs edited_message shapes. Returns null if there is no text message.
export function extractMessage(update = {}) {
  const m = update.message || update.edited_message;
  if (!m || typeof m.text !== 'string') return null;
  return { fromId: String(m.from && m.from.id), chatId: String(m.chat && m.chat.id), text: m.text };
}

export function createTelegramBridge(opts = {}) {
  const founders = opts.founders || parseFounders();
  const respond = opts.respond || respondAsync;                 // the conversational brain (read-only)
  const telegram = opts.telegram || new TelegramNotifier(opts.telegramOpts || {});
  const emit = opts.emit || ((m) => beacon.emit(m));
  const sha256 = opts.sha256 || beacon.sha256;

  function configured() { return founders.size > 0 && telegram.configured(); }

  // Handle one inbound update. Never throws; returns a metadata result.
  async function handleUpdate(update) {
    const msg = extractMessage(update);
    if (!msg) return { ignored: true, reason: 'no-text' };

    const login = founders.get(msg.fromId);
    if (!login) {
      // Unknown sender: do NOT reply (no oracle), but record the rejected attempt.
      emit({ kind: 'bridge', actor: `telegram:${msg.fromId}`, action: 'reject', contentHash: sha256(msg.text), detail: { transport: 'telegram', delivered: false, reason: 'unauthorized-sender' } });
      return { rejected: true, reason: 'unauthorized-sender' };
    }

    // Authorized founder → relay to the read-only brain as that steward. No effect
    // is executed here; the model answers, and any action it proposes is for the
    // gate in the console, not for this chat.
    const ans = await respond({ prompt: msg.text });
    let delivered = false, sendErr = null;
    try { await telegram.send({ to: msg.chatId, kind: 'message', severity: 'info', summary: ans.text || '(no answer)' }); delivered = true; }
    catch (e) { sendErr = e.reason || e.message; }

    emit({ kind: 'bridge', actor: `steward:${login}`, action: 'relay', contentHash: sha256(msg.text), detail: { transport: 'telegram', delivered, ...(sendErr ? { reason: sendErr } : {}) } });
    return { relayed: true, steward: login, delivered };
  }

  return { handleUpdate, configured, founders };
}
