// src/core/notify.voice.js
// VOICE channel — dependency-free over the Twilio Voice REST API. Places a call
// that speaks the summary via inline TwiML (<Response><Say>…</Say></Response>).
// For a 'critical' alert a ringing phone beats a buried notification. Credentials
// come from the broker; the spoken text is the summary only (metadata-light).
//
// Config (env; op:// refs resolved at boot) — reuses the Twilio account:
//   NOTIFY_TWILIO_SID / NOTIFY_TWILIO_TOKEN / NOTIFY_TWILIO_FROM
//   NOTIFY_VOICE_TO        default callee (overridden per-message by msg.to)

import { Notifier, NotifyError } from './notify.shared.js';
import { postForm, basicAuth } from './httpclient.js';

const API = 'https://api.twilio.com';

// Minimal XML escape so a summary can't break the TwiML document.
function xmlEscape(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

export class VoiceNotifier extends Notifier {
  constructor(opts = {}) {
    super();
    this.sid = opts.sid || process.env.NOTIFY_TWILIO_SID || '';
    this.token = opts.token || process.env.NOTIFY_TWILIO_TOKEN || '';
    this.from = opts.from || process.env.NOTIFY_TWILIO_FROM || '';
    this.to = opts.to || process.env.NOTIFY_VOICE_TO || '';
    this.transport = opts.transport || postForm;     // injectable for tests
  }
  get name() { return 'voice'; }
  configured() { return !!(this.sid && this.token && this.from); }
  hosts() { return ['api.twilio.com']; }

  async send(msg) {
    if (!this.configured()) throw new NotifyError('not-configured', 'voice needs NOTIFY_TWILIO_SID + NOTIFY_TWILIO_TOKEN + NOTIFY_TWILIO_FROM');
    const to = msg.to || this.to;
    if (!to) throw new NotifyError('no-recipient', 'voice has no callee (msg.to or NOTIFY_VOICE_TO)');
    const twiml = `<Response><Say voice="alice">AiGovOps ${xmlEscape(msg.severity)} alert. ${xmlEscape(msg.summary)}</Say></Response>`;
    const url = `${API}/2010-04-01/Accounts/${encodeURIComponent(this.sid)}/Calls.json`;
    const res = await this.transport(url, { To: to, From: this.from, Twiml: twiml }, {
      headers: { Authorization: basicAuth(this.sid, this.token) },
      allow: new Set(this.hosts()),
    });
    if (res.status < 200 || res.status >= 300) throw new NotifyError('rejected', `twilio voice ${res.status}`);
    return { delivered: true, id: (res.json && res.json.sid) || 'voice', detail: `to=${to}` };
  }
}
