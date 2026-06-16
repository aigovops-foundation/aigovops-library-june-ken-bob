// src/core/notify.telegram.js
// TELEGRAM channel — dependency-free over the Bot API (sendMessage, JSON POST).
// The OUTBOUND half of the founder bridge: Hermes pushes alerts/reports to a
// steward's Telegram chat. The bot token comes from the broker
// (op://AiGovOps/notify-telegram/credential), never a file. The INBOUND half
// (two-way conversation) lives in bridge.telegram.js and reuses this to reply.
//
// Config (env; op:// refs resolved at boot):
//   NOTIFY_TELEGRAM_TOKEN  bot token from BotFather (the founder-owned step)
//   NOTIFY_TELEGRAM_TO     default chat id (overridden per-message by msg.to)

import { Notifier, NotifyError } from './notify.shared.js';
import { postJson } from './httpclient.js';

const API = 'https://api.telegram.org';

export class TelegramNotifier extends Notifier {
  constructor(opts = {}) {
    super();
    this.token = opts.token || process.env.NOTIFY_TELEGRAM_TOKEN || '';
    this.to = opts.to || process.env.NOTIFY_TELEGRAM_TO || '';
    this.transport = opts.transport || postJson;     // injectable for tests
  }
  get name() { return 'telegram'; }
  configured() { return !!this.token; }
  hosts() { return ['api.telegram.org']; }

  async send(msg) {
    if (!this.configured()) throw new NotifyError('not-configured', 'telegram needs NOTIFY_TELEGRAM_TOKEN');
    const chatId = msg.to || this.to;
    if (!chatId) throw new NotifyError('no-recipient', 'telegram has no chat id (msg.to or NOTIFY_TELEGRAM_TO)');
    // Plain text (no parse_mode): summaries/bodies are free text — and via the
    // bridge, an LLM answer — so Markdown parsing would 400 on a stray * _ [ `.
    const text = msg.body ? `${msg.summary}\n${msg.body}` : msg.summary;
    const url = `${API}/bot${this.token}/sendMessage`;
    const res = await this.transport(url, { chat_id: chatId, text }, {
      allow: new Set(this.hosts()),
    });
    if (res.status < 200 || res.status >= 300 || (res.json && res.json.ok === false)) {
      throw new NotifyError('rejected', `telegram ${res.status}${res.json ? ' ' + (res.json.description || '') : ''}`);
    }
    return { delivered: true, id: String((res.json && res.json.result && res.json.result.message_id) || 'tg'), detail: `chat=${chatId}` };
  }
}
