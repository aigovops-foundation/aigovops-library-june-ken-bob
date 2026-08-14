#!/usr/bin/env node
// scripts/estate-digest.mjs — turn docs/estate-health.json into the hourly digest
// Ken and Bob GET: every page, red or green, with green the goal for each one.
//
//   node scripts/estate-digest.mjs            # markdown digest → stdout
//   node scripts/estate-digest.mjs --status   # one word: green | red | pending (exit 0/1)
//
// The notify workflow pipes the markdown into a pinned GitHub issue and pings the
// founders (founders.json) when a page flips red.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const data = JSON.parse(readFileSync(join(ROOT, 'docs', 'estate-health.json'), 'utf8'));
const e = data.estate || {};
const reporting = (data.sites || []).filter((s) => s.summary);

const anyRed = reporting.some((s) => s.status === 'red') || (e.redPages || 0) > 0;
const overall = reporting.length === 0 ? 'pending' : (anyRed ? 'red' : 'green');

if (argv.includes('--status')) {
  process.stdout.write(overall);
  process.exit(overall === 'red' ? 1 : 0);
}

const dot = (s) => (s === 'green' ? '🟢' : s === 'red' ? '🔴' : '⚪');
const founders = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'founders.json'), 'utf8')).founders || []; } catch { return []; } })();

const L = [];
L.push(`# ${dot(overall)} Estate Interaction Health — ${overall.toUpperCase()} · score ${e.score ?? '–'}%`);
L.push('');
L.push(`_Every page of the estate, every button and link, opened in a real browser and verified to actually do something. **Green is the goal for each page.**_`);
L.push('');
L.push(`**Uptime score: ${e.score ?? '–'}%** _(share of crawled pages fully green)_ · ${e.greenPages ?? 0} pages green · **${e.redPages ?? 0} pages red** · ${e.healthy ?? 0}/${e.reporting ?? 0} properties green · ${e.dead ?? 0} dead buttons · ${e.broken ?? 0} broken links`);
L.push(`_crawled ${data.generatedAt || 'never'} · live board: \`docs/estate-health.html\`_`);
L.push('');

L.push('| Property | State | Pages 🟢 | Pages 🔴 | Dead | Broken |');
L.push('|---|---|---:|---:|---:|---:|');
for (const s of data.sites || []) {
  const sm = s.summary;
  const state = { green: '🟢 healthy', red: '🔴 red', warn: '🟡 review', pending: '⚪ pending', error: '🔴 unreachable' }[s.status] || s.status;
  L.push(`| ${s.name} | ${state} | ${sm ? sm.greenPages : '–'} | ${sm ? sm.redPages : '–'} | ${sm ? sm.dead : '–'} | ${sm ? sm.broken : '–'} |`);
}
L.push('');

// Every RED page, named, with why — this is what turns green into an action.
const redPages = [];
for (const s of reporting) for (const p of (s.pageHealth || [])) if (p.status === 'red') redPages.push({ site: s.name, base: s.base, ...p });
if (redPages.length) {
  L.push('## 🔴 Pages to get back to green');
  L.push('');
  for (const p of redPages) {
    const bits = [p.dead ? `${p.dead} dead` : '', p.broken ? `${p.broken} broken` : '', p.jsErrors ? `${p.jsErrors} JS error(s)` : '', p.loadError ? `load error` : ''].filter(Boolean).join(', ');
    L.push(`- 🔴 **${p.path}** — ${bits} — \`${p.base.replace(/\/$/, '')}${p.path}\``);
  }
  L.push('');
  // name the actual dead/broken controls
  for (const s of reporting) {
    if (!(s.dead?.length || s.broken?.length)) continue;
    L.push(`<details><summary>${s.name} — the controls</summary>`);
    L.push('');
    for (const d of s.dead || []) L.push(`- DEAD \`${d.tag}\` "${(d.text || d.cls || '').slice(0, 70)}" — ${d.reason}`);
    for (const b of s.broken || []) L.push(`- BROKEN "${(b.text || '').slice(0, 60)}" → ${b.href} — ${b.reason}`);
    L.push('');
    L.push('</details>');
    L.push('');
  }
} else if (reporting.length) {
  L.push('## ✅ Every reporting page is green');
  L.push('');
  L.push(`All ${e.greenPages ?? 0} crawled pages have a working handler or link on every button. Keep it here.`);
  L.push('');
}

if (founders.length) { L.push('---'); L.push(`cc ${founders.map((f) => '@' + f).join(' ')} — hourly estate-health digest.`); }

process.stdout.write(L.join('\n') + '\n');
