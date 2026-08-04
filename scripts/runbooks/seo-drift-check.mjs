#!/usr/bin/env node
// seo-drift-check — dependency-free. Verifies the discoverability invariants on the
// published site and catches drift before it ships. Reports, and exits non-zero on any
// problem so it can gate CI or run as a cron with a real signal.
//
//   node scripts/runbooks/seo-drift-check.mjs            # check docs/
//   node scripts/runbooks/seo-drift-check.mjs path/to/docs
//
// Checks, per page: <title>, meta description, og:url, canonical, JSON-LD (valid JSON),
// and that canonical/og:url actually POINT AT this page on the live site.
// Site-wide: sitemap.xml + robots.txt present; every internal href resolves to a file;
// every page appears in the sitemap; nothing still addresses the retired github.io mirror.
//
// Why the "points at" check exists: until 2026-08-02 this script only asserted that a
// canonical tag was PRESENT, never where it pointed. When the public github.io mirror was
// retired behind the membership wall, all 23 pages kept canonicals aimed at that mirror —
// every one a 404 — and this gate stayed green the whole time. Presence is not correctness.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

// The Library's live home. Pages are served member-gated from the community platform;
// the github.io mirror is retired and serves only a "moved" stub (redirect-stub/).
const SITE = 'https://community.aigovops-foundation.com/library';
const RETIRED = 'https://aigovops-foundation.github.io/aigovops-library-june-ken-bob';

const dir = process.argv[2] || 'docs';
const pages = readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
const problems = [];
const note = (file, msg) => problems.push(`${file}: ${msg}`);

// The URL a given page should call its own: index.html is the bare directory.
const expectedUrl = (f) => (f === 'index.html' ? `${SITE}/` : `${SITE}/${f}`);

// --- per-page invariants ---
for (const f of pages) {
  const s = readFileSync(join(dir, f), 'utf8');
  if (!/<title>\s*\S[\s\S]*?<\/title>/i.test(s)) note(f, 'missing <title>');
  if (!/<meta\s+name=["']description["']/i.test(s)) note(f, 'missing meta description');
  if (!/property=["']og:url["']/i.test(s)) note(f, 'missing og:url');
  if (!/rel=["']canonical["']/i.test(s)) note(f, 'missing canonical');

  // ...and that they point at THIS page on the live site, not merely exist.
  const want = expectedUrl(f);
  const canon = s.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  if (canon && canon[1] !== want) note(f, `canonical points at ${canon[1]} — expected ${want}`);
  const ogUrl = s.match(/<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)["']/i);
  if (ogUrl && ogUrl[1] !== want) note(f, `og:url points at ${ogUrl[1]} — expected ${want}`);
  if (s.includes(RETIRED)) note(f, 'still addresses the retired github.io mirror (404s)');
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
    if (!sm.includes(`<loc>${expectedUrl(f)}</loc>`)) note('sitemap.xml', `${f} is not listed at its live URL ${expectedUrl(f)}`);
  }
  if (sm.includes(RETIRED)) note('sitemap.xml', 'lists the retired github.io mirror (404s)');
}
// robots.txt must advertise a sitemap that actually exists, at the live origin.
if (hasRobots) {
  const rb = readFileSync(join(dir, 'robots.txt'), 'utf8');
  if (rb.includes(RETIRED)) note('robots.txt', 'points at the retired github.io mirror (404s)');
  if (!rb.includes(`Sitemap: ${SITE}/sitemap.xml`)) note('robots.txt', `does not advertise ${SITE}/sitemap.xml`);
}
// Nothing else shipped in docs/ should address the retired mirror either (JS, JSON, …).
for (const f of readdirSync(dir).filter((f) => /\.(js|json|txt|xml|webmanifest)$/i.test(f))) {
  if (readFileSync(join(dir, f), 'utf8').includes(RETIRED)) note(f, 'still addresses the retired github.io mirror (404s)');
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
