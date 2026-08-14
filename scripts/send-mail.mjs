#!/usr/bin/env node
// scripts/send-mail.mjs — the estate mailer, "the right way" for a Microsoft 365 org.
//
// Provider precedence, all credential-gated (nothing sends without a human's secret):
//   1. Microsoft Graph app-only (RECOMMENDED) — sends as a real Foundation mailbox, works
//      unattended in CI. Needs GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_SENDER.
//   2. SMTP (delegates to send-digest-email.mjs) — if ESTATE_SMTP_URL is set instead.
//   3. Neither set → skip (prints why, exits 0). The paused, human-armed state.
//
//   node scripts/send-mail.mjs --subject "..." --body digest.md [--to a@x,b@y]
//
// Recipients default to founders.json `emails`; every founder is always included (cc Ken+Bob).
// Keeps the traffic in the brain: a metadata-only line on send (never the body/PII).

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

const subject = opt('subject', 'AiGovOps — estate');
const bodyFile = opt('body', 'digest.md');
const body = readFileSync(bodyFile, 'utf8');
const founders = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'founders.json'), 'utf8')); } catch { return {}; } })();
const toArg = opt('to', '');
const recipients = [...new Set([...(toArg ? toArg.split(',') : []), ...((founders.emails) || [])].map((s) => s.trim()).filter(Boolean))];

function brainLog(via) {
  console.log('brain: ' + JSON.stringify({
    op: 'email', via, subject, recipients: recipients.length,
    recipientHash: createHash('sha256').update(recipients.slice().sort().join(',')).digest('hex').slice(0, 16),
    bodyHash: createHash('sha256').update(body).digest('hex').slice(0, 16),
  }));
}

const G = {
  tenant: process.env.GRAPH_TENANT_ID, client: process.env.GRAPH_CLIENT_ID,
  secret: process.env.GRAPH_CLIENT_SECRET, sender: process.env.GRAPH_SENDER,
};

async function sendGraph() {
  if (!recipients.length) { console.log('send-mail: no recipients — skipping.'); return 0; }
  // 1) client-credentials token
  const tokRes = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(G.tenant)}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: G.client, client_secret: G.secret, scope: 'https://graph.microsoft.com/.default' }),
  });
  if (!tokRes.ok) { console.error('send-mail(graph): token error', tokRes.status, (await tokRes.text()).slice(0, 300)); return 1; }
  const { access_token } = await tokRes.json();
  // 2) sendMail as the configured sender
  const msg = {
    message: {
      subject,
      body: { contentType: 'HTML', content: body },
      toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
    },
    saveToSentItems: true,
  };
  const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(G.sender)}/sendMail`, {
    method: 'POST', headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify(msg),
  });
  if (sendRes.status !== 202) { console.error('send-mail(graph): sendMail error', sendRes.status, (await sendRes.text()).slice(0, 300)); return 1; }
  console.log(`send-mail(graph): sent "${subject}" from ${G.sender} to ${recipients.join(', ')}`);
  brainLog('graph');
  return 0;
}

if (G.tenant && G.client && G.secret && G.sender) {
  process.exit(await sendGraph());
} else if (process.env.ESTATE_SMTP_URL) {
  const r = spawnSync('node', [join(HERE, 'send-digest-email.mjs'), '--subject', subject, '--body', bodyFile, ...(toArg ? ['--to', toArg] : [])], { stdio: 'inherit', env: process.env });
  process.exit(r.status || 0);
} else {
  console.log('send-mail: no mail provider configured (set GRAPH_* for Microsoft Graph app-only, or ESTATE_SMTP_URL for SMTP) — skipping. This is the paused, human-armed state.');
  process.exit(0);
}
