#!/usr/bin/env node
// seo-drift-check — dependency-free. Verifies the discoverability invariants on the
// published site and catches drift before it ships. Reports, and exits non-zero on any
// problem so it can gate CI or run as a cron with a real signal.
//
//   node scripts/runbooks/seo-drift-check.mjs            # check docs/
//   node scripts/runbooks/seo-drift-check.mjs path/to/docs
//
// Checks, per page: <title>, meta description, og:url, canonical, JSON-LD (valid JSON).
// Site-wide: sitemap.xml + robots.txt present; every internal href resolves to a file;
// every page appears in the sitemap.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const dir = process.argv[2] || 'docs';
const pages = readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
const problems = [];
const note = (file, msg) => problems.push(`${file}: ${msg}`);

// --- per-page invariants ---
for (const f of pages) {
  const s = readFileSync(join(dir, f), 'utf8');
  if (!/<title>\s*\S[\s\S]*?<\/title>/i.test(s)) note(f, 'missing <title>');
  if (!/<meta\s+name=["']description["']/i.test(s)) note(f, 'missing meta description');
  if (!/property=["']og:url["']/i.test(s)) note(f, 'missing og:url');
  if (!/rel=["']canonical["']/i.test(s)) note(f, 'missing canonical');
  const ld = [...s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  if (ld.length === 0) note(f, 'no JSON-LD structured data');
  for (const m of ld) { try { JSON.parse(m[1]); } catch { note(f, 'invalid JSON-LD'); } }
  // internal links resolve
  for (const m of s.matchAll(/href=["'](\.\/)?([a-z0-9_-]+\.html)(#[^"']*)?["']/gi)) {
    const target = m[2];
    if (!existsSync(join(dir, target))) note(f, `broken internal link -> ${target}`);
  }
}

// --- site-wide invariants ---
const hasSitemap = existsSync(join(dir, 'sitemap.xml'));
const hasRobots = existsSync(join(dir, 'robots.txt'));
if (!hasSitemap) note('sitemap.xml', 'MISSING');
if (!hasRobots) note('robots.txt', 'MISSING');
if (hasSitemap) {
  const sm = readFileSync(join(dir, 'sitemap.xml'), 'utf8');
  for (const f of pages) {
    const slug = f === 'index.html' ? '/' : `/${f}`;
    if (!sm.includes(slug)) note('sitemap.xml', `does not list ${f}`);
  }
}

// --- report ---
console.log(`seo-drift-check: ${pages.length} pages in ${dir}/`);
if (problems.length === 0) {
  console.log('OK — no SEO drift. All discoverability invariants hold.');
  process.exit(0);
}
console.log(`\n${problems.length} problem(s):`);
for (const p of problems) console.log('  - ' + p);
process.exit(1);
