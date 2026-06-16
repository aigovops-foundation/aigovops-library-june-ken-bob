// src/core/notify.sms.js
// SMS channel — dependency-free over the Twilio REST API (form-encoded POST).
// Credentials come from the secrets broker (account SID + auth token), never a
// file. A text message is, by design, short: we send the summary only.
//
// Config (env; op:// refs resolved at boot):
//   NOTIFY_TWILIO_SID      account SID (AC…)
//   NOTIFY_TWILIO_TOKEN    auth token
//   NOTIFY_TWILIO_FROM     sending number (+1…)
//   NOTIFY_SMS_TO          default recipient (overridden per-message by msg.to)

import { Notifier, NotifyError } from './notify.shared.js';
import { postForm, basicAuth } from './httpclient.js';

const API = 'https://api.twilio.com';

export class SmsNotifier extends Notifier {
  constructor(opts = {}) {
    super();
    this.sid = opts.sid || process.env.NOTIFY_TWILIO_SID || '';
    this.token = opts.token || process.env.NOTIFY_TWILIO_TOKEN || '';
    this.from = opts.from || process.env.NOTIFY_TWILIO_FROM || '';
    this.to = opts.to || process.env.NOTIFY_SMS_TO || '';
    this.transport = opts.transport || postForm;     // injectable for tests
  }
  get name() { return 'sms'; }
  configured() { return !!(this.sid && this.token && this.from); }
  hosts() { return ['api.twilio.com']; }

  async send(msg) {
    if (!this.configured()) throw new NotifyError('not-configured', 'sms needs NOTIFY_TWILIO_SID + NOTIFY_TWILIO_TOKEN + NOTIFY_TWILIO_FROM');
    const to = msg.to || this.to;
    if (!to) throw new NotifyError('no-recipient', 'sms has no recipient (msg.to or NOTIFY_SMS_TO)');
    const text = (msg.body ? `${msg.summary} — ${msg.body}` : msg.summary).slice(0, 600);
    const url = `${API}/2010-04-01/Accounts/${encodeURIComponent(this.sid)}/Messages.json`;
    const res = await this.transport(url, { To: to, From: this.from, Body: text }, {
      headers: { Authorization: basicAuth(this.sid, this.token) },
      allow: new Set(this.hosts()),
    });
    if (res.status < 200 || res.status >= 300) throw new NotifyError('rejected', `twilio sms ${res.status}`);
    return { delivered: true, id: (res.json && res.json.sid) || 'sms', detail: `to=${to}` };
  }
}
