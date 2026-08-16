// test/mail-health.test.mjs — mailer provider selection is deterministic and never leaks.
//   node --test test/mail-health.test.mjs   (no browser, no network)
import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'mail-health.mjs');
const run = (env) => execFileSync('node', [SCRIPT], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });

test('unconfigured when no provider secrets are set', () => {
  const out = run({});
  assert.match(out, /mail-health: unconfigured \(none\)/);
  assert.match(out, /armed, not live/);
});

test('reports SMTP when ESTATE_SMTP_URL is set (no network needed)', () => {
  const out = run({ ESTATE_SMTP_URL: 'smtps://u:p@smtp.example.com:465' });
  assert.match(out, /mail-health: ok \(smtp\)/);
});

test('SMTP wins when both SMTP and Graph are configured (relay is explicit)', () => {
  const out = run({ ESTATE_SMTP_URL: 'smtps://apikey:SG.k@smtp.sendgrid.net:465', GRAPH_TENANT_ID: 't', GRAPH_CLIENT_ID: 'c', GRAPH_CLIENT_SECRET: 's', GRAPH_SENDER: 'x@y.com' });
  assert.match(out, /mail-health: ok \(smtp\)/);
});

test('never prints the client secret', () => {
  const out = run({ GRAPH_TENANT_ID: 't', GRAPH_CLIENT_ID: 'c', GRAPH_CLIENT_SECRET: 'SUPERSECRETVALUE', GRAPH_SENDER: 'estate@x.com' });
  assert.ok(!out.includes('SUPERSECRETVALUE'), 'the secret must never appear in output');
  assert.match(out, /\(graph\)/); // it attempted the graph provider
});
