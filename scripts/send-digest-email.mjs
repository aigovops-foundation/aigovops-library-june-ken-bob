#!/usr/bin/env node
// scripts/send-digest-email.mjs — send a plaintext/markdown body by email, dependency-free.
//
// CREDENTIAL-GATED BY DESIGN: it does nothing unless ESTATE_SMTP_URL is set. No secret in
// the repo; the operator (Bob) provisions the sender. This is the "prepare, don't send"
// boundary in code — CI wires it, a human's credential arms it.
//
//   ESTATE_SMTP_URL='smtps://user:app-password@smtp.gmail.com:465' \
//   node scripts/send-digest-email.mjs --subject "Estate health" --body digest.md \
//        [--to a@x.com,b@y.com] [--from "AiGovOps <user@host>"]
//
// Recipients default to founders.json `emails`. A copy always goes to every founder
// ("cc Ken and Bob on every mail"). Implicit-TLS (smtps, port 465) + AUTH LOGIN.

import { readFileSync } from 'node:fs';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

const URL_ = process.env.ESTATE_SMTP_URL || '';
if (!URL_) { console.log('send-digest-email: ESTATE_SMTP_URL not set — skipping (nothing sent). This is the paused, human-armed state.'); process.exit(0); }

const founders = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'founders.json'), 'utf8')); } catch { return {}; } })();
const toArg = opt('to', '');
const recipients = [...new Set([...(toArg ? toArg.split(',') : []), ...((founders.emails) || [])].map((s) => s.trim()).filter(Boolean))];
if (!recipients.length) { console.log('send-digest-email: no recipients (set founders.json emails or --to) — skipping.'); process.exit(0); }

const u = new URL(URL_);
const host = u.hostname, port = Number(u.port || 465);
const user = decodeURIComponent(u.username), pass = decodeURIComponent(u.password);
const from = opt('from', `AiGovOps Estate <${user}>`);
const subject = opt('subject', 'AiGovOps — estate health');
const body = readFileSync(opt('body', 'digest.md'), 'utf8');

function smtp(sock) {
  let buf = '';
  const steps = [];
  const expect = (code) => new Promise((res, rej) => {
    const onData = (d) => {
      buf += d.toString('utf8');
      const lines = buf.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (/^\d{3} /.test(last)) { // final line of a reply
        sock.off('data', onData); buf = '';
        if (last.startsWith(String(code))) res(last); else rej(new Error(`SMTP expected ${code}, got: ${lines.join(' | ')}`));
      }
    };
    sock.on('data', onData);
  });
  const send = (line) => new Promise((res) => sock.write(line + '\r\n', res));
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
  const rcptCmds = recipients.map((r) => [`RCPT TO:<${r}>`, 250]);
  const msg = [
    `From: ${from}`, `To: ${recipients.join(', ')}`, `Subject: ${subject}`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '', body,
  ].join('\r\n').replace(/\r\n\./g, '\r\n..'); // dot-stuffing
  return (async () => {
    await expect(220);
    await send(`EHLO aigovops`); await expect(250);
    await send('AUTH LOGIN'); await expect(334);
    await send(b64(user)); await expect(334);
    await send(b64(pass)); await expect(235);
    await send(`MAIL FROM:<${user}>`); await expect(250);
    for (const [cmd, code] of rcptCmds) { await send(cmd); await expect(code); }
    await send('DATA'); await expect(354);
    await send(msg + '\r\n.'); await expect(250);
    await send('QUIT').catch(() => {});
  })();
}

const sock = tls.connect({ host, port, servername: host }, () => {});
sock.setEncoding('utf8');
sock.setTimeout(30000, () => { console.error('send-digest-email: timeout'); process.exit(1); });
import { createHash } from 'node:crypto';
// Keep the traffic in the brain: a metadata-only record of the send — never the body, never
// a raw address. Wired to the core, this becomes a signed ledger receipt.
function brainLog() {
  const rec = {
    op: 'email', ts: new Date().toISOString(), subject,
    recipients: recipients.length,
    recipientHash: createHash('sha256').update(recipients.slice().sort().join(',')).digest('hex').slice(0, 16),
    bodyHash: createHash('sha256').update(body).digest('hex').slice(0, 16),
  };
  console.log('brain: ' + JSON.stringify(rec));
}

smtp(sock)
  .then(() => { console.log(`send-digest-email: sent "${subject}" to ${recipients.join(', ')}`); brainLog(); sock.end(); process.exit(0); })
  .catch((e) => { console.error('send-digest-email:', e.message); sock.end(); process.exit(1); });
