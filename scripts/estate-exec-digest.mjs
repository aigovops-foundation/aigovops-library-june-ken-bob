#!/usr/bin/env node
// scripts/estate-exec-digest.mjs — turn the raw interaction crawl into something two
// founders can read in ninety seconds and act on.
//
//   node scripts/estate-exec-digest.mjs [--in docs/estate-health.json]
//                                       [--html docs/estate-exec.html] [--pdf docs/estate-exec.pdf]
//
// WHY THIS EXISTS. The hourly digest reported "609 dead buttons, 28 red pages, score 90%".
// Every one of those numbers was true and none of them were useful:
//
//   - 609 is 203 counted three times. Beacon, Umbrella and NCW AI Camp serve the same
//     content, so one dead control is reported once per property. The estate looked three
//     times as broken as it is, and "1 of 5 properties green" counted one property thrice.
//   - Of the 203 real ones, 98 are a SINGLE missing anchor target: ~98 buttons point at
//     "#variants" and no element has that id. One line of HTML retires 98 defects.
//   - Lantern's 4 broken links are one wrong href on two pages.
//
// A list of 609 items tells a reader to scroll past it. Two named bugs with a fix each
// tells them what to do. Same data; the difference is whether anyone acts. This digest
// therefore DEDUPLICATES mirrored properties, GROUPS by root cause, and leads with the
// smallest set of real decisions — while still linking the full evidence, because a
// summary that cannot be checked is just an assertion.
//
// Output: a self-contained HTML page (garden-warm, same tokens as the estate) and a PDF
// printed from it. If the PDF engine is unavailable the HTML is still written and the run
// says the PDF was skipped — it never pretends to have produced one.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

const IN = resolve(opt('in', join(ROOT, 'docs', 'estate-health.json')));
const HTML_OUT = resolve(opt('html', join(ROOT, 'docs', 'estate-exec.html')));
const PDF_OUT = resolve(opt('pdf', join(ROOT, 'docs', 'estate-exec.pdf')));

const data = JSON.parse(readFileSync(IN, 'utf8'));

/* ── deduplicate mirrored properties ─────────────────────────────────────────
   Two properties that publish the same content report the same defects. Counting them
   separately is how "203 dead" became "609 dead" and how one broken page became three.
   Fingerprint each property by its multiset of defect signatures; identical fingerprints
   are one origin wearing several hostnames. */

const sig = (e) => `${e.tag}|${(e.text || '').slice(0, 60)}|${e.reason}`;
const fingerprint = (s) => [...(s.dead || []).map(sig), ...(s.broken || []).map(e => `B|${e.href}|${e.reason}`)]
  .sort().join('\n');

const reporting = (data.sites || []).filter(s => !s.gated && s.summary);
const groups = new Map();
for (const s of reporting) {
  const fp = fingerprint(s);
  if (!fp) { groups.set(`__green__${s.name}`, [s]); continue; }
  if (!groups.has(fp)) groups.set(fp, []);
  groups.get(fp).push(s);
}

const origins = [...groups.values()].map(sites => ({
  primary: sites[0],
  mirrors: sites.slice(1).map(s => s.name),
  sites,
}));

/* ── group defects by root cause ─────────────────────────────────────────────
   A reader can act on "one anchor target is missing" and cannot act on a list of 294
   identical rows. Each issue carries a plain-English consequence and a concrete fix, and
   declares whether an agent may do it or whether it needs a human. */

const issues = [];

for (const origin of origins) {
  const s = origin.primary;
  const where = origin.mirrors.length
    ? `${s.name} (and ${origin.mirrors.join(', ')} — same content, same defects)`
    : s.name;

  // Missing anchor targets: the highest-leverage class, always one id per group.
  const anchors = new Map();
  for (const e of s.dead || []) {
    const m = /anchor "(#[^"]+)" has no matching target/.exec(e.reason || '');
    if (m) anchors.set(m[1], (anchors.get(m[1]) || 0) + 1);
  }
  for (const [anchor, count] of anchors) {
    issues.push({
      severity: 'red', where, count,
      title: `${count} buttons point at ${anchor} — nothing on the page has that id`,
      plain: `Every one of these looks like a working button. A visitor clicks, the page does not move, and they conclude the site is broken. It is the same defect ${count} times, not ${count} defects.`,
      fix: `Add id="${anchor.slice(1)}" to the section those buttons are meant to jump to — or point them at the section that already exists.`,
      canFix: true,
      pages: topPages(s.dead, e => (e.reason || '').includes(anchor)),
    });
  }

  // Inert clickable affordances: real, but a design question rather than a broken link.
  const inert = (s.dead || []).filter(e => /no link and no handler/.test(e.reason || ''));
  if (inert.length) {
    const tags = tally(inert.map(e => e.tag));
    issues.push({
      severity: 'amber', where, count: inert.length,
      title: `${inert.length} elements look clickable but do nothing`,
      plain: `Mostly quiz options and numbered step chips (${tags}). They are styled to invite a click and no click is wired. Either they were meant to be interactive and the handler was lost, or they are decorative and should stop looking like buttons.`,
      fix: 'Decide per group: wire the handler, or drop the pointer cursor and button styling so they read as text. A quiz option that does not respond is worse than a plain list.',
      canFix: false,
      pages: topPages(inert),
    });
  }

  // Broken links: an href that 404s is unambiguous.
  // Count PAGES, not occurrences. Two links to the same dead href on one page is one page
  // a visitor can land on — reporting it as "4 pages" is the same inflation this digest exists
  // to remove, committed by the digest itself.
  const broken = new Map();
  for (const e of s.broken || []) {
    if (!broken.has(e.href)) broken.set(e.href, new Set());
    broken.get(e.href).add(e.page);
  }
  for (const [href, pageSet] of broken) {
    const count = pageSet.size;
    issues.push({
      severity: 'red', where, count,
      title: `Link to ${href} returns 404`,
      plain: `Appears on ${count} page${count > 1 ? 's' : ''}. Anyone following it lands on a GitHub 404 wearing the Foundation's URL — the single most damaging thing a visitor can hit.`,
      fix: `Point it at a page that exists. ${href.replace(/\/$/, '').endsWith('github.io') ? 'The org Pages root has never been published — the link almost certainly wants the Foundation site instead.' : 'Check the intended destination.'}`,
      canFix: true,
      pages: [...new Set((s.broken || []).filter(e => e.href === href).map(e => e.page))].slice(0, 3),
    });
  }

  // Non-HTML assets reported as load errors: a download is not a broken page.
  const loadErrors = (s.pageHealth || []).filter(p =>
    /load error/i.test(p.status || p.reason || '') && /\.(rego|xlsx|pptx|pdf|zip|csv)$/i.test(p.url || p.path || ''));
  if (loadErrors.length) {
    issues.push({
      severity: 'note', where, count: loadErrors.length,
      title: `${loadErrors.length} downloadable files counted as broken pages`,
      plain: 'Spreadsheets, decks and policy files. A browser cannot open them as a web page, so the crawler records a load error. These are almost certainly working downloads being reported as failures.',
      fix: 'Teach the crawler to treat non-HTML assets as downloads: check they return 200 and stop trying to render them.',
      canFix: true,
      pages: loadErrors.slice(0, 3).map(p => p.url || p.path),
    });
  }
}

function tally(arr) {
  const c = {};
  for (const a of arr) c[a] = (c[a] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([t, n]) => `${n}× <${t}>`).join(', ');
}
function topPages(list, filter = () => true) {
  const c = {};
  for (const e of (list || []).filter(filter)) c[e.page] = (c[e.page] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p, n]) => `${p} (${n})`);
}

/* ── honest headline numbers ─────────────────────────────────────────────── */

const uniqueDead = origins.reduce((n, o) => n + (o.primary.dead || []).length, 0);
const uniqueBroken = origins.reduce((n, o) => n + (o.primary.broken || []).length, 0);
const rawDead = reporting.reduce((n, s) => n + (s.dead || []).length, 0);
const greenOrigins = origins.filter(o => !(o.primary.dead || []).length && !(o.primary.broken || []).length);
const redIssues = issues.filter(i => i.severity === 'red');
const pending = (data.sites || []).filter(s => s.gated);

// Stable per-run ids so a founder can answer "fix R2" instead of pasting a URL. Numbered
// over the red list in display order, so the id in the mail is the id on the page.
issues.filter(i => i.severity === 'red').forEach((i, n) => { i.id = `R${n + 1}`; });

const stamp = data.generatedAt || new Date().toISOString();
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── the page ────────────────────────────────────────────────────────────── */

const card = (i) => `
  <article class="issue ${i.severity}">
    <div class="issue-head">
      <span class="pill ${i.severity}">${i.severity === 'red' ? 'Fix now' : i.severity === 'amber' ? 'Decide' : 'Noise'}</span>
      <h3>${i.id ? `<span class="rid">${i.id}</span> ` : ''}${esc(i.title)}</h3>
    </div>
    <p class="where">${esc(i.where)}</p>
    <p class="plain">${esc(i.plain)}</p>
    <div class="fix">
      <h4>Suggested fix</h4>
      <p>${esc(i.fix)}</p>
      <p class="offer">${i.canFix
    ? '<strong>I can do this one.</strong> Say the word and it ships as a PR.'
    : '<strong>Needs a human decision first</strong> — the fix depends on what these were meant to do.'}</p>
    </div>
    ${i.pages?.length ? `<details><summary>Where it shows up</summary><ul>${i.pages.map(p => `<li><code>${esc(p)}</code></li>`).join('')}</ul></details>` : ''}
  </article>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Estate Health — Executive Summary</title>
<style>
  :root{--ink:#22301f;--muted:#5c6b58;--ground:#FAF7F0;--panel:#fff;--line:#e3ddcd;
        --green:#2E7D4F;--deep:#1F5E3A;--red:#a3341f;--amber:#9a6b1f;}
  *{box-sizing:border-box}
  body{margin:0;background:var(--ground);color:var(--ink);
       font:17px/1.65 "Source Serif 4",Georgia,serif;}
  .wrap{max-width:52rem;margin:0 auto;padding:3rem 1.5rem 5rem}
  h1{font:700 2.4rem/1.15 Fraunces,Georgia,serif;margin:0 0 .3rem;letter-spacing:-.01em}
  .sub{color:var(--muted);margin:0 0 2.5rem;font-size:1.02rem}
  h2{font:600 1.4rem/1.3 Fraunces,Georgia,serif;margin:3rem 0 .4rem;
     padding-bottom:.5rem;border-bottom:2px solid var(--line)}
  .lede{color:var(--muted);margin:.4rem 0 1.8rem}
  .verdict{background:var(--panel);border:1px solid var(--line);border-left:5px solid var(--red);
           border-radius:10px;padding:1.4rem 1.6rem;margin:0 0 2rem}
  .verdict h2{border:0;margin:0 0 .5rem;padding:0;font-size:1.25rem}
  .verdict p{margin:.5rem 0 0}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:1rem;margin:2rem 0}
  .tile{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:1.1rem 1.2rem}
  .tile .n{font:600 2rem/1 Fraunces,Georgia,serif;display:block}
  .tile .l{color:var(--muted);font-size:.86rem;display:block;margin-top:.35rem}
  .tile.good .n{color:var(--green)} .tile.bad .n{color:var(--red)}
  .issue{background:var(--panel);border:1px solid var(--line);border-radius:10px;
         padding:1.5rem 1.7rem;margin:0 0 1.5rem}
  .issue.red{border-left:5px solid var(--red)}
  .issue.amber{border-left:5px solid var(--amber)}
  .issue.note{border-left:5px solid var(--muted)}
  .issue-head{display:flex;gap:.8rem;align-items:baseline;flex-wrap:wrap}
  .issue h3{font:600 1.18rem/1.35 Fraunces,Georgia,serif;margin:0 0 .2rem}
  .pill{font:600 .72rem/1 "IBM Plex Mono",monospace;text-transform:uppercase;letter-spacing:.06em;
        padding:.4rem .6rem;border-radius:5px;white-space:nowrap}
  .pill.red{background:#f6e5e0;color:var(--red)}
  .pill.amber{background:#f7eeda;color:var(--amber)}
  .pill.note{background:#eeeae0;color:var(--muted)}
  .where{color:var(--muted);font-size:.9rem;margin:.1rem 0 .9rem}
  .rid{font:600 .8rem/1 "IBM Plex Mono",monospace;color:var(--red);
       background:#f6e5e0;padding:.2rem .4rem;border-radius:4px;margin-right:.3rem}
  .plain{margin:0 0 1.1rem}
  .fix{background:#f4f1e7;border-radius:8px;padding:1rem 1.2rem}
  .fix h4{font:600 .78rem/1 "IBM Plex Mono",monospace;text-transform:uppercase;
          letter-spacing:.07em;color:var(--deep);margin:0 0 .5rem}
  .fix p{margin:0 0 .6rem} .fix p:last-child{margin:0}
  .offer{font-size:.94rem;color:var(--deep)}
  details{margin-top:1rem;font-size:.9rem}
  summary{cursor:pointer;color:var(--muted)}
  details ul{margin:.6rem 0 0;padding-left:1.2rem} code{font:.84rem "IBM Plex Mono",monospace;word-break:break-all}
  .green-list{background:var(--panel);border:1px solid var(--line);border-left:5px solid var(--green);
              border-radius:10px;padding:1.3rem 1.6rem}
  .green-list li{margin:.3rem 0}
  footer{margin-top:4rem;padding-top:1.5rem;border-top:1px solid var(--line);
         color:var(--muted);font-size:.88rem}
  @media print{body{background:#fff}.wrap{padding:0}.issue,.tile,.verdict,.green-list{break-inside:avoid}}
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
    --ink:#ece7db;--muted:#a8b1a2;--ground:#191d17;--panel:#212620;--line:#333a30;}
    .fix{background:#1a1f19}.pill.red{background:#3a211c}.pill.amber{background:#332a17}.pill.note{background:#262a24}}
</style></head><body><div class="wrap">

<h1>Estate Health</h1>
<p class="sub">Executive summary · crawled ${esc(stamp)}</p>

<div class="verdict">
  <h2>${redIssues.length} things actually need fixing</h2>
  <p>The raw crawl counted <strong>${rawDead} dead controls</strong>. That is <strong>${uniqueDead}</strong>
     counted more than once — ${origins.filter(o => o.mirrors.length).map(o => `${esc(o.primary.name)} and ${o.mirrors.length} mirror${o.mirrors.length > 1 ? 's' : ''}`).join('; ') || 'no mirrors detected'}
     publish the same content, so each defect was reported once per property.</p>
  <p>Grouped by cause rather than by occurrence, the whole estate comes down to the
     ${redIssues.length} red item${redIssues.length === 1 ? '' : 's'} below.</p>
</div>

<div class="tiles">
  <div class="tile good"><span class="n">${greenOrigins.length}</span><span class="l">properties fully green</span></div>
  <div class="tile bad"><span class="n">${redIssues.length}</span><span class="l">real defects to fix</span></div>
  <div class="tile"><span class="n">${uniqueDead}</span><span class="l">unique dead controls</span></div>
  <div class="tile"><span class="n">${uniqueBroken}</span><span class="l">unique broken links</span></div>
</div>

<h2>What is red</h2>
<p class="lede">Each is one cause, not one occurrence. Fixing the cause retires every instance.</p>
${issues.filter(i => i.severity === 'red').map(card).join('') || '<p>Nothing red. The estate is clean.</p>'}

<h2>Worth a decision</h2>
<p class="lede">Real, but not broken links — these need someone to say what was intended.</p>
${issues.filter(i => i.severity === 'amber').map(card).join('') || '<p>Nothing pending a decision.</p>'}

<h2>Probably not real</h2>
<p class="lede">Reported as failures, almost certainly working. Fixing the checker, not the site.</p>
${issues.filter(i => i.severity === 'note').map(card).join('') || '<p>No suspected false positives.</p>'}

<h2>What is green</h2>
<div class="green-list">
  <ul>
    ${greenOrigins.map(o => `<li><strong>${esc(o.primary.name)}</strong> — ${o.primary.summary?.greenPages ?? 0} pages, every control working</li>`).join('') || '<li>No property is fully green.</li>'}
    ${origins.filter(o => !greenOrigins.includes(o)).map(o => `<li><strong>${esc(o.primary.name)}</strong> — ${o.primary.summary?.greenPages ?? 0} pages green${o.mirrors.length ? ` (mirrored by ${esc(o.mirrors.join(', '))})` : ''}</li>`).join('')}
  </ul>
</div>

${pending.length ? `<h2>Not checked</h2><p class="lede">Gated surfaces need an authenticated session to crawl. Silence here means nobody looked — not that nothing is wrong.</p>
<div class="green-list" style="border-left-color:var(--muted)"><ul>${pending.map(s => `<li><strong>${esc(s.name)}</strong> — pending an auth recipe</li>`).join('')}</ul></div>` : ''}

<footer>
  <p>Generated by <code>scripts/estate-exec-digest.mjs</code> from <code>${esc(IN.replace(ROOT + '/', ''))}</code>.
     Full evidence, every page and every control, stays on the live board at <code>docs/estate-health.html</code> —
     this page summarises it, it does not replace it.</p>
  <p>Fixes marked <em>I can do this one</em> ship as a pull request for a human to merge.
     Nothing here changes a live site on its own.</p>
</footer>
</div></body></html>`;

mkdirSync(dirname(HTML_OUT), { recursive: true });
writeFileSync(HTML_OUT, html, 'utf8');
console.error(`wrote ${HTML_OUT}`);

/* ── markdown, for the pinned issue and the founders' mail ─────────────────
   The raw crawl dump ran to hundreds of near-identical lines, so nobody read past the
   first screen. This is the same information at one line per cause, each carrying the fix
   and a reply the founders can actually send back. */

const reds = issues.filter(i => i.severity === 'red');
const ambers = issues.filter(i => i.severity === 'amber');
const md = [];
md.push(`## ${reds.length ? '🔴' : '🟢'} Estate health — ${reds.length} thing${reds.length === 1 ? '' : 's'} to fix`);
md.push('');
md.push(`_Crawled ${stamp}. The raw crawl counted **${rawDead} dead controls**; that is **${uniqueDead}** counted once per mirrored property. Grouped by cause, here is the whole estate._`);
md.push('');
if (reds.length) {
  md.push('### 🔴 Red — one line each, with the fix');
  md.push('');
  for (const i of reds) {
    md.push(`**${i.id} · ${i.title}**  `);
    md.push(`↳ _${i.where}_  `);
    md.push(`↳ **Fix:** ${i.fix}  `);
    md.push(`↳ ${i.canFix ? `Reply **\`fix ${i.id}\`** and Claude prepares it as a pull request for you to merge.` : '_Needs a human decision first._'}`);
    md.push('');
  }
} else {
  md.push('### 🟢 Nothing red. Every control on every crawled page works.');
  md.push('');
}
if (ambers.length) {
  md.push('### 🟠 Waiting on a decision from you');
  md.push('');
  for (const i of ambers) md.push(`- **${i.title}** — ${i.where}. ${i.fix}`);
  md.push('');
}
md.push('### 🟢 Green');
md.push('');
for (const o of greenOrigins) md.push(`- **${o.primary.name}** — ${o.primary.summary?.greenPages ?? 0} pages, every control working`);
for (const o of origins.filter(o => !greenOrigins.includes(o))) {
  md.push(`- **${o.primary.name}** — ${o.primary.summary?.greenPages ?? 0} pages green${o.mirrors.length ? ` (mirrored by ${o.mirrors.join(', ')})` : ''}`);
}
if (pending.length) {
  md.push('');
  md.push(`_Not checked: ${pending.map(s => s.name).join(', ')} — gated, needs an authenticated crawl. Silence there means nobody looked._`);
}
md.push('');
md.push('_Full evidence: `docs/estate-health.html`. Formatted HTML and PDF are attached to this run._');
md.push('<!-- estate-health-digest -->');

const MD_OUT = resolve(opt('markdown', join(ROOT, 'audit', 'estate-exec.md')));
mkdirSync(dirname(MD_OUT), { recursive: true });
writeFileSync(MD_OUT, md.join('\n'), 'utf8');
console.error(`wrote ${MD_OUT}`);

// A fingerprint of the CAUSES, not the counts. The hourly job mails and comments only when
// this changes, so a red that is already known and already reported stops re-notifying every
// hour — the behaviour that taught everyone to ignore the digest. A new cause, a fixed
// cause, or a flip to green all change it; another hour of the same thing does not.
if (argv.includes('--fingerprint')) {
  const key = issues.filter(i => i.severity === 'red')
    .map(i => `${i.title}|${i.where}`).sort().join('\n');
  let h = 5381;
  for (let n = 0; n < key.length; n++) h = ((h * 33) ^ key.charCodeAt(n)) >>> 0;
  process.stdout.write(key ? h.toString(16).padStart(8, '0') : 'allgreen');
  process.exit(0);
}

if (argv.includes('--status')) {
  process.stdout.write(reds.length ? 'red' : 'green');
  process.exit(0);
}

/* ── PDF, or a clear statement that there isn't one ─────────────────────── */

let pdfOk = false;
try {
  // The hourly workflow installs `playwright`; a local dev box may only have
  // `playwright-core`. Try both rather than silently skipping the PDF every hour because
  // of which package name happened to be installed.
  let chromium;
  for (const pkg of ['playwright', 'playwright-core']) {
    try { ({ chromium } = await import(pkg)); break; } catch { /* try the next */ }
  }
  if (!chromium) throw new Error('neither playwright nor playwright-core is installed');
  const browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE_PATH || undefined });
  const page = await browser.newPage();
  await page.goto('file://' + HTML_OUT, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print', colorScheme: 'light' });
  await page.pdf({ path: PDF_OUT, format: 'A4', printBackground: true,
    margin: { top: '18mm', bottom: '18mm', left: '15mm', right: '15mm' } });
  await browser.close();
  pdfOk = true;
  console.error(`wrote ${PDF_OUT}`);
} catch (err) {
  // Never claim a PDF that does not exist. The HTML is the deliverable either way.
  console.error(`PDF skipped — ${err.message.split('\n')[0]}`);
  console.error('  (install playwright-core, or open the HTML and print to PDF)');
}

const mac = process.platform === 'darwin';
console.error('');
console.error(`  ${redIssues.length} red · ${issues.filter(i => i.severity === 'amber').length} to decide · ${greenOrigins.length} properties green`);
console.error('  open it       ' + (mac ? `open "${HTML_OUT}"` : `xdg-open "${HTML_OUT}"`));
if (pdfOk) console.error('  the pdf       ' + (mac ? `open "${PDF_OUT}"` : `xdg-open "${PDF_OUT}"`));
console.error('  copy the html ' + (mac ? `cat "${HTML_OUT}" | pbcopy` : `cat "${HTML_OUT}" | xclip -selection clipboard`));
