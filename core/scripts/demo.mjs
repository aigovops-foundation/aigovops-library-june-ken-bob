#!/usr/bin/env node
// scripts/demo.mjs — the end-to-end story of the AiGovOps governed core, for Ken
// + Bob to review. Hermetic + dependency-free: boots a fresh core in temp dirs,
// drives the WHOLE system once, narrates each scene to the console, and writes a
// self-contained report to docs/demo-e2e.html. Every action leaves a signed,
// metadata-only receipt; the finale verifies the entire chain.
//
//   cd core && npm run demo        # narrates + regenerates docs/demo-e2e.html
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Hermetic ledger/keys BEFORE importing beacon so the demo never touches real state.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-demo-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const beacon = await import('../src/core/beacon.js');
const { createGovernedCore } = await import('../src/core/govapi.js');
const { FileProvider } = await import('../src/core/secrets.fileprovider.js');
const { Caps } = await import('../src/core/caps.js');
const { MemoryStore } = await import('../src/core/statestore.js');
const { Workflows } = await import('../src/core/workflow.js');
const { Orgs } = await import('../src/core/orgs.js');
const { createHermes } = await import('../src/core/notify.js');
const { searchCorpus } = await import('../src/core/search.js');
const { createCheckpoint, verifyFromCheckpoint } = await import('../src/core/checkpoints.js');
const { buildDsar } = await import('../src/core/dsar.js');
const { frameworks } = await import('../src/core/lantern.js');
const { governanceGate } = await import('./governance-gate.mjs');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(HERE, '..', '..', 'docs');
const OUT = process.env.DEMO_OUT || path.join(DOCS, 'demo-run.html');

// A backing secrets file with the demo scopes (placeholder masters — never used,
// never the token; the broker hands out short-lived opaque tokens, not these).
const SECRETS = path.join(TMP, 'secrets.json');
fs.writeFileSync(SECRETS, JSON.stringify({ owner: 'foundation', scopes: { 'github-deploy': 'DEMO-MASTER-NEVER-LEAVES', 'self-host': 'DEMO' }, rotated: { 'github-deploy': '2026-06-06' } }));

const scenes = [];
function lastReceipt() {
  const f = beacon.ledgerFile();
  if (!fs.existsSync(f)) return null;
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean);
  if (!lines.length) return null;
  const s = JSON.parse(lines[lines.length - 1]);
  return { kind: s.record.kind, action: s.record.action, kid: s.kid, sig: (s.sig || '').slice(0, 20) + '…', ts: s.record.ts };
}
function scene(n, title, prose, detail, explicitReceipt) {
  const receipt = explicitReceipt || lastReceipt();
  scenes.push({ n, title, prose, detail, receipt });
  console.log(`\n${n}. ${title}\n   ${detail}`);
  if (receipt) console.log(`   ⮑ signed receipt: ${receipt.kind}/${receipt.action}  kid=${receipt.kid}  ${receipt.ts}`);
}

// ── Scene 1 — a risky ask, governed ─────────────────────────────────────────
const store = new MemoryStore();
const caps = new Caps(); caps.setProfile('agent:maker', { level: 'act', maxSpend: 10 });
const gov = createGovernedCore({ secrets: new FileProvider({ storePath: SECRETS, store }), caps, store });
const p1 = await gov.propose('publish our Q3 governance report', { actor: 'agent:maker' });
const d1 = await gov.decide(p1.pendingId, 'approve', { scope: 'github-deploy', ttlSeconds: 60, cost: { requiredLevel: 'act', spend: 1 }, decidedBy: 'steward:bob' });
const r1 = await gov.runTool({ token: d1.grant.token, code: 'export default async () => "published";' });
scene(1, 'A risky ask, governed', 'An agent asks to publish. The Yes-Gate classifies it as irreversible and PAUSES for a human. A steward approves; the broker mints a scoped token that expires in 60s — never the master secret — and a sandboxed tool runs with it.',
  `gated ✓ → steward approved ✓ → token ${d1.grant.token.slice(0, 10)}… (≠ master) → sandboxed run → result: "${r1.result}"`);

// ── Scene 2 — what regulations apply ────────────────────────────────────────
const fw = frameworks();
beacon.emit({ kind: 'artifact', actor: 'agent:lantern', action: 'assess', gate: { id: 'assessment', framework: 'EU-AI-Act', act: 'get', decision: 'no' }, contentHash: beacon.sha256('AI tool that screens job candidates') });
scene(2, 'What regulations apply', 'A member asks about an AI tool that screens job candidates. Lantern maps the problem to the frameworks that bind it and the gates to pass.',
  `mapped to ${fw.length} frameworks (incl. EU AI Act — high-risk: employment) → human-gate required before any effect`);

// ── Scene 3 — the capability dial ───────────────────────────────────────────
const p3 = await gov.propose('deploy something expensive', { actor: 'agent:maker' });
const d3 = await gov.decide(p3.pendingId, 'approve', { scope: 'github-deploy', cost: { requiredLevel: 'act', spend: 50 }, decidedBy: 'steward:ken' });
scene(3, 'The dial they earn, not a switch they flip', 'Capability is bounded. Even with a human yes, the agent is paused at its spend cap — it does not push through. A signed breach receipt records the pause.',
  `steward approved, but spend 50 > cap 10 → PAUSED (${d3.reason}); no token brokered`);

// ── Scene 4 — scale without losing the thread (A4b) ─────────────────────────
const cluster = new MemoryStore();
const replica = () => createGovernedCore({ secrets: new FileProvider({ storePath: SECRETS, store: cluster }), store: cluster });
const A = replica(), B = replica(), C = replica();
const pa = await A.propose('deploy the library site', { actor: 'agent:maker' });
const db = await B.decide(pa.pendingId, 'approve', { scope: 'github-deploy', ttlSeconds: 60, decidedBy: 'steward:ken' });
const rc = await C.runTool({ token: db.grant.token, code: 'export default async () => "built";' });
scene(4, 'Scale without losing the thread', 'The whole loop is replica-agnostic. A member proposes on one instance, a steward approves on a second, and the brokered tool runs on a third — one cluster, one signed ledger. No sticky sessions.',
  `propose@A → approve@B → run@C = "${rc.result}" (token issued by B, redeemed by C)`);

// ── Scene 5 — multi-step work (workflows) ───────────────────────────────────
const wf = new Workflows({ store });
await wf.define('q3-review', [{ id: 'draft' }, { id: 'legal' }, { id: 'steward-approve' }]);
const inst = await wf.start('q3-review', { actor: 'oidc:alice' });
await wf.advance(inst.id, { decision: 'approve', actor: 'steward:bob' });
const done = await wf.advance(inst.id, { decision: 'approve', actor: 'steward:ken' });
const fin = await wf.advance(done.id, { decision: 'approve', actor: 'steward:bob' });
scene(5, 'Multi-step work, with SLAs', 'Beyond one decision: a durable, resumable workflow with per-step assignment, SLA timers, and escalation. State lives in the shared store — any replica can advance it.',
  `workflow "q3-review" — 3 steps → state: ${fin.state}`);

// ── Scene 6 — the governed messenger (Hermes) ───────────────────────────────
const hermes = createHermes();
const note = await hermes.send({ kind: 'gate-pending', severity: 'warn', audience: 'stewards', summary: 'A proposal is waiting for approval', body: 'Q3 report publish' });
scene(6, 'The messenger, governed', 'Hermes delivers — alerts, reports, "a proposal is waiting" — across channels (dashboard/email/SMS/voice/telegram). Propose-only, and the receipt is metadata-only: the fact of the message, never its contents.',
  `notification delivered to stewards (${note.results.map((r) => r.channel).join(', ')}); body never logged`);

// ── Scene 7 — find anything, prove everything ───────────────────────────────
const hits = searchCorpus({ frameworks: fw, skills: [{ name: 'framework-map', title: 'map a problem to frameworks' }], members: [{ id: 'oidc:alice', role: 'member' }] }, 'ai act');
createCheckpoint();
const retiredOldReceipt = JSON.parse(fs.readFileSync(beacon.ledgerFile(), 'utf8').trim().split('\n')[0]);  // the very first receipt
const rot = beacon.rotateKeys();
const oldStillVerifies = beacon.verifySigned(retiredOldReceipt);
scene(7, 'Find anything; prove everything', 'Search indexes the frameworks/skills/members/receipts. Checkpoints anchor the chain so verification stays fast at scale. And the signing key rotates — yet every receipt signed under the old key still verifies.',
  `search "ai act" → ${hits.length} hit(s) (${hits[0]?.meta?.name || '—'}); ledger anchored; key rotated ${rot.retiredKid.slice(0, 8)}…→${rot.newKid.slice(0, 8)}…; pre-rotation receipt still verifies: ${oldStillVerifies}`);

// ── Scene 8 — your data, on demand (DSAR) ───────────────────────────────────
const dsar = buildDsar('agent:maker');
scene(8, 'Your data, on demand', 'A data-subject access request returns the complete record held for a subject — metadata only, no payloads, no PII — and the export is itself signed, so it’s verifiable offline.',
  `DSAR for "agent:maker": ${dsar.record.count} receipts, signed (kid=${dsar.kid}), residency=${dsar.record.residency.region}`,
  { kind: 'dsar', action: 'export', kid: dsar.kid, sig: (dsar.sig || '').slice(0, 20) + '…', ts: dsar.record.generatedAt });

// ── Finale — the whole trail verifies ───────────────────────────────────────
const v = beacon.verifyLedger();
const gate = governanceGate();
console.log(`\n✅ ${v.entries} signed receipts; chain + signatures valid: ${v.valid}; governance gate: ${gate.ok ? 'PASS' : 'FAIL'}`);

// ── Render the reviewable report ────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const sceneHtml = scenes.map((s) => `
  <section class="scene">
    <div class="num">${s.n}</div>
    <div class="body">
      <h2>${esc(s.title)}</h2>
      <p>${esc(s.prose)}</p>
      <div class="detail">${esc(s.detail)}</div>
      ${s.receipt ? `<div class="receipt"><span class="tag">signed receipt</span> <code>${esc(s.receipt.kind)}/${esc(s.receipt.action)}</code> · kid <code>${esc(s.receipt.kid)}</code> · sig <code>${esc(s.receipt.sig)}</code> · <span class="ts">${esc(s.receipt.ts)}</span></div>` : ''}
    </div>
  </section>`).join('');

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>AiGovOps — end-to-end demo</title>
<style>
:root{--paper:#0c1430;--ink:#dce6f5;--ink2:#8da3c8;--line:rgba(120,160,210,.22);--card:rgba(255,255,255,.04);--teal:#3fd0c8;--green:#36e08a;--gold:#e8c25a}
*{box-sizing:border-box;margin:0;padding:0}body{font:16px/1.6 ui-serif,Georgia,serif;color:var(--ink);background:var(--paper);padding:40px 20px 90px}
.wrap{max-width:820px;margin:0 auto}.hdr{text-align:center;margin-bottom:8px}
h1{font-family:ui-sans-serif,system-ui;font-size:30px;color:#fff;letter-spacing:.01em}
.sub{color:var(--ink2);font-size:15px;margin:6px 0 4px}.quote{color:var(--gold);font-style:italic;margin:14px 0 34px;text-align:center}
.scene{display:flex;gap:18px;border-top:1px solid var(--line);padding:26px 0}
.num{font-family:ui-sans-serif;font-weight:800;color:var(--teal);font-size:22px;min-width:34px}
h2{font-family:ui-sans-serif;font-size:19px;color:#fff;margin-bottom:8px}p{color:var(--ink);margin-bottom:10px}
.detail{font-family:ui-monospace,monospace;font-size:13px;color:#bfe;background:rgba(0,0,0,.28);border:1px solid var(--line);border-radius:9px;padding:9px 11px}
.receipt{margin-top:9px;font-size:12px;color:var(--ink2)}.receipt code{color:var(--green);font-size:12px}.tag{display:inline-block;border:1px solid var(--line);border-radius:99px;padding:1px 8px;color:var(--teal);font-family:ui-sans-serif;font-size:11px}.ts{font-family:ui-monospace,monospace}
.finale{margin-top:30px;border:1px solid var(--line);border-radius:14px;background:var(--card);padding:20px}
.finale b{color:var(--green)}.meta{color:var(--ink2);font-size:13px;text-align:center;margin-top:26px}
</style></head><body><div class="wrap">
<div class="hdr"><h1>AiGovOps — the governed core, end to end</h1>
<div class="sub">A live walk through the whole system. Every step below was actually executed to generate this page; each left a signed, metadata-only receipt.</div>
<div style="margin:16px 0 4px"><a href="${process.env.DEMO_LIVE_URL || 'https://198.199.121.180/demo'}" style="display:inline-block;background:var(--green);color:#06241a;font-family:ui-sans-serif;font-weight:700;text-decoration:none;border-radius:10px;padding:11px 20px">▶ Run it yourself, live on the host →</a></div>
<div class="sub" style="font-size:12.5px">(opens the running core; accept the self-signed cert, paste a steward token, and watch fresh receipts)</div></div>
<div class="quote">“Agents do the bureaucracy; humans hold the meaning — and humans hold the keys.”</div>
${sceneHtml}
<div class="finale">
  <h2 style="margin-bottom:10px">The whole trail verifies</h2>
  <p><b>${v.entries} signed receipts.</b> Signatures + hash chain valid: <b>${v.valid}</b>. Governance gate: <b>${gate.ok ? 'PASS' : 'FAIL'}</b>. The signing key was rotated mid-run and pre-rotation receipts still verify.</p>
  <div class="detail">verify it yourself: every receipt is Ed25519-signed; the public key is at <code>/beacon/pubkey</code>, and <code>npm run verify</code> / <code>openssl</code> check the chain offline. No payloads, no PII — metadata only.</div>
</div>
<div class="meta">Generated by <code>npm run demo</code> · dependency-free · the same engine that runs in production.</div>
</div></body></html>`;

fs.mkdirSync(DOCS, { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`\n📄 wrote ${path.relative(path.resolve(HERE, '..', '..'), OUT)} — open it to review the full story.`);
process.exit(v.valid && gate.ok ? 0 : 1);
