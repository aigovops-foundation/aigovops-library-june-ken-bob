#!/usr/bin/env node
// core/scripts/compliance-report.mjs
// Build + SIGN a compliance report from the signed ledger, and write a JSON and
// a standalone HTML artifact an auditor (or a regulator) can read. The report's
// hash is anchored by a signed receipt appended to the ledger, so the report is
// itself verifiable offline (npm run export:evidence / verify.mjs).
//
// Run:  cd core && node scripts/compliance-report.mjs [outDir]   (default ./compliance)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.KEYS_DIR) process.env.KEYS_DIR = path.resolve(__dirname, '..', 'keys');
if (!process.env.LEDGER_DIR) process.env.LEDGER_DIR = path.resolve(__dirname, '..', 'ledger');

const { signComplianceReport } = await import('../src/core/compliance.js');

function html(report, receipt) {
  const g = report.governance;
  const rows = Object.entries(g).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  const fw = report.frameworks.map((f) => `<li><b>${f.name}</b> — ${f.gateQuestion || 'attested'} <span class="muted">(${f.observations}×)</span></li>`).join('') || '<li class="muted">none observed</li>';
  const badge = report.posture === 'clean' ? '#36e08a' : report.posture === 'integrity-failure' ? '#f08a8a' : '#e8c25a';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>AiGovOps Compliance Report</title>
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;background:#0c1430;color:#dce6f5;max-width:840px;margin:0 auto;padding:30px}
h1{color:#fff}.muted{color:#8da3c8}table{border-collapse:collapse;width:100%;margin:12px 0}td{border-bottom:1px solid rgba(120,160,210,.22);padding:7px 10px}
.badge{display:inline-block;padding:3px 10px;border-radius:6px;border:1px solid ${badge};color:${badge};font-family:ui-monospace,monospace;font-size:12px}
.att{border-left:3px solid #3fd0c8;padding:8px 14px;margin:14px 0;color:#bfe9d0}code{color:#3fd0c8;font-family:ui-monospace,monospace;font-size:12px;word-break:break-all}</style></head>
<body><h1>AiGovOps — Compliance Report</h1>
<p class="muted">${report.profile} · generated ${report.generatedAt} · posture <span class="badge">${report.posture.toUpperCase()}</span></p>
<div class="att">${report.attestation}</div>
<h3>Ledger integrity</h3><p>${report.ledger.entries} receipts · chain ${report.ledger.valid ? 'VALID ✓' : 'BROKEN ✗'} · key <code>${report.ledger.kid}</code></p>
<h3>Governance activity</h3><table>${rows}</table>
<h3>Frameworks touched</h3><ul>${fw}</ul>
<h3>Verification</h3><p class="muted">This report's content hash is anchored by a signed receipt in the ledger:</p>
<p><code>contentHash ${report.contentHash}</code><br/><code>receipt kid ${receipt.kid} · sig ${receipt.sig.slice(0, 24)}…</code></p>
<p class="muted">Verify the whole ledger offline: <code>cd core &amp;&amp; npm run export:evidence</code> then <code>node evidence-bundle/verify.mjs</code>.</p>
</body></html>`;
}

function main() {
  const outDir = process.argv[2] || path.join(__dirname, '..', 'compliance');
  fs.mkdirSync(outDir, { recursive: true });
  const { report, receipt } = signComplianceReport({ now: new Date().toISOString() });
  fs.writeFileSync(path.join(outDir, 'compliance-report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'compliance-report.html'), html(report, receipt));
  console.log(`Compliance report written: ${outDir}`);
  console.log(`  posture: ${report.posture} · ${report.ledger.entries} receipts · chain ${report.ledger.valid ? 'valid' : 'BROKEN'} · frameworks: ${report.frameworks.length}`);
  console.log(`  signed receipt kid=${receipt.kid} contentHash=${report.contentHash.slice(0, 16)}…`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
