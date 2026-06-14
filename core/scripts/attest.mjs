#!/usr/bin/env node
// core/scripts/attest.mjs
// CONTINUOUS COMPLIANCE ATTESTATION (#4) — runnable on a daily cron.
// Reads the prior attestation (for drift), builds + signs a new one mapped to
// named framework controls, writes JSON + HTML, and flags any REGRESSION loudly.
//
// Cron example (daily 06:00):  0 6 * * *  cd /path/core && npm run attest
// Run once:  cd core && npm run attest

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.KEYS_DIR) process.env.KEYS_DIR = path.resolve(__dirname, '..', 'keys');
if (!process.env.LEDGER_DIR) process.env.LEDGER_DIR = path.resolve(__dirname, '..', 'ledger');

const { signAttestation } = await import('../src/core/attestation.js');

const OUT = process.argv[2] || path.resolve(__dirname, '..', 'attestations');
const LATEST = path.join(OUT, 'latest.json');

function html(att) {
  const color = { pass: '#36e08a', partial: '#e8c25a', attention: '#e8c25a', fail: '#f08a8a' };
  const rows = att.controls.map((c) => `<tr><td><b>${c.framework}</b><br><span class="muted">${c.clause}</span></td><td><span style="color:${color[c.status]}">${c.status.toUpperCase()}</span></td><td class="muted">${c.rationale}</td></tr>`).join('');
  const drift = att.drift.regressions.length
    ? `<div class="att" style="border-color:#f08a8a;color:#f08a8a">⚠ ${att.drift.regressions.length} REGRESSION(S): ${att.drift.regressions.map((d) => `${d.id} ${d.from}→${d.to}`).join(', ')}</div>`
    : (att.drift.vsPrior ? `<div class="att">No regressions vs the prior attestation (${att.drift.changed.length} change(s)).</div>` : '<div class="att muted">First attestation — no prior to compare.</div>');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>AiGovOps Compliance Attestation</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;background:#0c1430;color:#dce6f5;max-width:900px;margin:0 auto;padding:30px}
h1{color:#fff}.muted{color:#8da3c8}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border-bottom:1px solid rgba(120,160,210,.22);padding:8px 10px;text-align:left;vertical-align:top}
.att{border-left:3px solid #3fd0c8;padding:8px 14px;margin:14px 0}code{color:#3fd0c8;font-family:ui-monospace,monospace;font-size:12px;word-break:break-all}</style></head>
<body><h1>AiGovOps — Compliance Attestation</h1>
<p class="muted">${att.profile} · ${att.period} · ${att.generatedAt} · posture <b style="color:${color[att.posture]}">${att.posture.toUpperCase()}</b></p>
${drift}
<p>Controls: ${att.summary.pass} pass · ${att.summary.partial} partial · ${att.summary.attention} attention · ${att.summary.fail} fail</p>
<table><thead><tr><th>Control</th><th>Status</th><th>Basis (from the signed ledger)</th></tr></thead><tbody>${rows}</tbody></table>
<p class="muted">Anchored by a signed receipt: <code>contentHash ${att.contentHash}</code>. Verify the ledger offline: <code>npm run export:evidence</code>.</p>
</body></html>`;
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let prior = null;
  try { prior = JSON.parse(fs.readFileSync(LATEST, 'utf8')); } catch { /* first run */ }

  const { attestation } = signAttestation({ now: new Date().toISOString(), period: 'daily', prior });

  const stamp = attestation.generatedAt.slice(0, 10);
  fs.writeFileSync(path.join(OUT, `attestation-${stamp}.json`), JSON.stringify(attestation, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT, `attestation-${stamp}.html`), html(attestation));
  fs.writeFileSync(LATEST, JSON.stringify(attestation, null, 2) + '\n');

  console.log(`Attestation (${attestation.period}) — posture ${attestation.posture.toUpperCase()} · ${attestation.summary.pass}/${attestation.summary.total} controls pass`);
  if (attestation.drift.regressions.length) {
    console.log(`  ⚠ ${attestation.drift.regressions.length} REGRESSION(S): ${attestation.drift.regressions.map((d) => `${d.id} ${d.from}→${d.to}`).join(', ')}`);
    process.exitCode = 3;   // non-zero so a cron/CI surfaces a regression
  } else if (attestation.drift.vsPrior) {
    console.log(`  drift: ${attestation.drift.changed.length} change(s), no regressions`);
  } else {
    console.log('  first attestation — no prior to compare');
  }
  console.log(`  written: ${OUT}/attestation-${stamp}.{json,html}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
