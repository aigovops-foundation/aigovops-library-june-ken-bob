#!/usr/bin/env node
// scripts/mail-health.mjs — non-destructive health check for the estate mailer.
//
// The e2e proof that email actually works WITHOUT sending an email: it asks the
// mailer's own credentials to authenticate. For Graph app-only that means fetching a
// client-credentials token (proves the app + secret + admin consent are all good); for
// SMTP it confirms the URL is present. Sends nothing, reveals no secret.
//
//   node scripts/mail-health.mjs           # prints a metadata-only status line + JSON
//   node scripts/mail-health.mjs --write docs/estate-health.json   # also merges `mail` into the board
//
// Exit 0 always (monitoring), unless --strict and the configured provider is broken.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const argv = process.argv.slice(2);
const writePath = argv.includes('--write') ? argv[argv.indexOf('--write') + 1] : null;
const strict = argv.includes('--strict');

const G = {
  tenant: process.env.GRAPH_TENANT_ID, client: process.env.GRAPH_CLIENT_ID,
  secret: process.env.GRAPH_CLIENT_SECRET, sender: process.env.GRAPH_SENDER,
};

async function check() {
  // Match send-mail.mjs precedence so the board shows the provider that will actually send.
  const graphReady = !!(G.tenant && G.client && G.secret && G.sender);
  const smtpReady = !!process.env.ESTATE_SMTP_URL;
  const forced = (process.env.MAIL_PROVIDER || '').toLowerCase();
  const provider = forced === 'smtp' ? 'smtp' : forced === 'graph' ? 'graph'
    : smtpReady ? 'smtp' : graphReady ? 'graph' : 'none';
  if (provider === 'smtp' && smtpReady) return { provider: 'smtp', status: 'ok', detail: 'SMTP relay configured (send verified at send time)' };
  if (provider === 'graph' && graphReady) {
    try {
      const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(G.tenant)}/oauth2/v2.0/token`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: G.client, client_secret: G.secret, scope: 'https://graph.microsoft.com/.default' }),
      });
      if (r.ok) return { provider: 'graph', status: 'ok', detail: `app authenticates; sends as ${G.sender}` };
      // surface the error class only (no secret, no token)
      let code = String(r.status);
      try { const j = await r.json(); code = j.error || code; } catch { /* ignore */ }
      return { provider: 'graph', status: 'error', detail: `token request failed: ${code} (check secret / admin consent)` };
    } catch (e) { return { provider: 'graph', status: 'error', detail: 'token endpoint unreachable' }; }
  }
  if (process.env.ESTATE_SMTP_URL) return { provider: 'smtp', status: 'ok', detail: 'SMTP URL configured (send-time verified)' };
  return { provider: 'none', status: 'unconfigured', detail: 'no mailer configured — armed, not live (set GRAPH_* or ESTATE_SMTP_URL)' };
}

const res = await check();
res.checkedAt = new Date().toISOString();
console.log(`mail-health: ${res.status} (${res.provider}) — ${res.detail}`);
console.log('brain: ' + JSON.stringify({ op: 'mail-health', ...res }));

if (writePath && existsSync(writePath)) {
  try {
    const board = JSON.parse(readFileSync(writePath, 'utf8'));
    board.mail = res;
    writeFileSync(writePath, JSON.stringify(board, null, 2));
    console.log(`mail-health: wrote mail status into ${writePath}`);
  } catch (e) { console.error('mail-health: could not merge into board:', e.message); }
}

process.exit(strict && res.status === 'error' ? 1 : 0);
