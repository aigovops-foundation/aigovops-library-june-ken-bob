// src/core/notify.email.js
// EMAIL channel — dependency-free over an HTTP email API (default: Postmark-shape,
// a single documented JSON POST). No SMTP socket to babysit; the token comes from
// the secrets broker (op://AiGovOps/notify-email/credential), never a file.
//
// Config (all via env, op:// refs resolved at boot):
//   NOTIFY_EMAIL_TOKEN     server token (Postmark: X-Postmark-Server-Token)
//   NOTIFY_EMAIL_FROM      verified sender address
//   NOTIFY_EMAIL_TO        default recipient (overridden per-message by msg.to)
//   NOTIFY_EMAIL_ENDPOINT  default https://api.postmarkapp.com/email
// The endpoint host is added to the egress allow-list only when configured.

import { Notifier, NotifyError } from './notify.shared.js';
import { postJson } from './httpclient.js';

const DEFAULT_ENDPOINT = 'https://api.postmarkapp.com/email';

export class EmailNotifier extends Notifier {
  constructor(opts = {}) {
    super();
    this.token = opts.token || process.env.NOTIFY_EMAIL_TOKEN || '';
    this.from = opts.from || process.env.NOTIFY_EMAIL_FROM || '';
    this.to = opts.to || process.env.NOTIFY_EMAIL_TO || '';
    this.endpoint = opts.endpoint || process.env.NOTIFY_EMAIL_ENDPOINT || DEFAULT_ENDPOINT;
    this.transport = opts.transport || postJson;   // injectable for tests
  }
  get name() { return 'email'; }
  configured() { return !!(this.token && this.from); }
  hosts() { try { return [new URL(this.endpoint).host.split(':')[0]]; } catch { return []; } }

  async send(msg) {
    if (!this.configured()) throw new NotifyError('not-configured', 'email needs NOTIFY_EMAIL_TOKEN + NOTIFY_EMAIL_FROM');
    const to = msg.to || this.to;
    if (!to) throw new NotifyError('no-recipient', 'email has no recipient (msg.to or NOTIFY_EMAIL_TO)');
    const subject = `[AiGovOps · ${msg.severity}] ${msg.summary}`.slice(0, 180);
    const body = {
      From: this.from, To: to, Subject: subject,
      TextBody: msg.body ? `${msg.summary}\n\n${msg.body}` : msg.summary,
      MessageStream: 'outbound',
    };
    const res = await this.transport(this.endpoint, body, {
      headers: { Accept: 'application/json', 'X-Postmark-Server-Token': this.token },
      allow: new Set(this.hosts()),
    });
    if (res.status < 200 || res.status >= 300) throw new NotifyError('rejected', `email API ${res.status}`);
    return { delivered: true, id: (res.json && (res.json.MessageID || res.json.id)) || 'email', detail: `to=${to}` };
  }
}
