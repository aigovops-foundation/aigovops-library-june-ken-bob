#!/usr/bin/env node
// scripts/estate-crawl.mjs — run the interaction crawler over the WHOLE estate and
// write one aggregate report the live monitor (docs/estate-health.html) renders.
//
// Reads estate-sites.json, crawls each non-gated property with interaction-crawl.mjs,
// and merges the per-site reports into docs/estate-health.json. Gated properties are
// listed as "pending" until an auth recipe is wired (they need a session to crawl).
//
//   node scripts/estate-crawl.mjs [--out docs/estate-health.json] [--max-pages 80]
//
// Exit is non-zero if any property with failOnDead=true has a dead/broken element,
// so a scheduled run turns the estate red loudly.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const OUT = opt('out', join(ROOT, 'docs', 'estate-health.json'));
const MAX = opt('max-pages', '80');

const registry = JSON.parse(readFileSync(join(ROOT, 'estate-sites.json'), 'utf8'));
const CRAWLER = join(HERE, 'interaction-crawl.mjs');

const sites = [];
let anyFail = false;

for (const s of registry.sites) {
  if (s.gated) {
    sites.push({ name: s.name, base: s.base, gated: true, status: 'pending', note: 'gated surface — needs an authenticated session to crawl', summary: null });
    continue;
  }
  const tmp = join(ROOT, `.crawl.${s.name.replace(/\W+/g, '_')}.json`);
  const args = [CRAWLER, '--url', s.base, '--out', tmp, '--site-name', s.name, '--max-pages', String(MAX)];
  if (s.failOnDead) args.push('--fail-on-dead');
  const res = spawnSync('node', args, { stdio: 'inherit', env: process.env });
  if (!existsSync(tmp)) {
    sites.push({ name: s.name, base: s.base, gated: false, status: 'error', note: 'crawler produced no report (unreachable?)', summary: null });
    anyFail = true;
    continue;
  }
  const rep = JSON.parse(readFileSync(tmp, 'utf8'));
  const red = !rep.summary.healthy && (s.failOnDead || rep.summary.broken > 0 || rep.summary.consoleErrorPages > 0);
  if (red && res.status !== 0) anyFail = true;
  sites.push({
    name: s.name, base: s.base, gated: false,
    status: rep.summary.healthy ? 'green' : (red ? 'red' : 'warn'),
    ranAt: rep.generatedAt, summary: rep.summary,
    pageHealth: rep.pageHealth || [],
    dead: rep.dead || [], broken: rep.broken || [], consoleErrors: rep.consoleErrors || [],
  });
}

const reporting = sites.filter((s) => s.summary);
const estate = {
  properties: sites.length,
  reporting: reporting.length,
  healthy: reporting.filter((s) => s.status === 'green').length,
  red: reporting.filter((s) => s.status === 'red').length,
  greenPages: reporting.reduce((n, s) => n + (s.summary?.greenPages || 0), 0),
  redPages: reporting.reduce((n, s) => n + (s.summary?.redPages || 0), 0),
  dead: reporting.reduce((n, s) => n + (s.summary?.dead || 0), 0),
  broken: reporting.reduce((n, s) => n + (s.summary?.broken || 0), 0),
  consoleErrorPages: reporting.reduce((n, s) => n + (s.summary?.consoleErrorPages || 0), 0),
};
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), estate, sites }, null, 2));
console.log(`\n  estate-crawl → ${OUT}`);
console.log(`  properties ${estate.properties} · reporting ${estate.reporting} · green ${estate.healthy} · red ${estate.red} · dead ${estate.dead} · broken ${estate.broken}`);
process.exit(anyFail ? 1 : 0);
