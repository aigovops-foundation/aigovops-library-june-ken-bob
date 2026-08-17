#!/usr/bin/env node
// scripts/repo-audit.mjs — audit every repo Bob and the Foundation own, and say what's
// missing. Writes a plain-text export you can read, mail, or keep as a dated record.
//
// It runs in two tiers, and it always tells you in the report which tier it actually ran:
//
//   INVENTORY tier (no GitHub token needed) — reads a repo list and reasons about the
//     estate as a whole: ownership placement, staleness, archive candidates, duplicate
//     and near-duplicate names, date-stamped names, scratch repos, public/private mix.
//
//   DEEP tier (needs a token with `repo` scope) — additionally opens each repository and
//     checks the things that make a repo maintainable and safe to publish: README,
//     LICENSE, description, topics, .gitignore, CI, tests, SECURITY.md, dependabot,
//     CODEOWNERS, open issues/PRs, and root-level files that look like secrets.
//
// Usage
//   node scripts/repo-audit.mjs                        # live enumeration + deep checks
//   node scripts/repo-audit.mjs --repos-file audit/repos.inventory.json   # offline tier
//   node scripts/repo-audit.mjs --no-deep              # inventory tier only, live list
//   node scripts/repo-audit.mjs --out audit/my-audit.txt --json audit/my-audit.json
//
// Options
//   --owners a,b        owners to audit          (default: repo-audit.config.json)
//   --only a/b,c/d      audit ONLY these repos, by full name. Skips enumeration, so it is
//                       seconds rather than minutes — the way to re-check the handful GitHub
//                       5xx'd on last run without re-scanning the whole estate.
//   --repos-file PATH   JSON {repos:[...]} or newline-delimited owner/name list.
//                       Skips live enumeration — use when the API is unreachable.
//   --out PATH          text export               (default audit/repo-audit-<stamp>.txt)
//   --json PATH         machine-readable export   (default alongside --out)
//   --deep / --no-deep  per-repo content checks   (default: deep when a token is present)
//   --stale-days N      stale threshold           (default 90)
//   --dormant-days N    archive-candidate line    (default 365)
//   --include-archived  audit archived repos too  (default: listed, not scored)
//   --concurrency N     parallel repo fetches     (default 6)
//   --quiet             no progress on stderr
//
// Token: GITHUB_TOKEN or GH_TOKEN. Read-only; never written anywhere. If the token is
// missing or the API refuses, the run degrades to the inventory tier and says so loudly
// rather than reporting an unchecked repo as clean.
//
// Exit codes: 0 clean-ish, 1 findings at BLOCKER severity, 2 the run could not produce a
// report at all. A missing deep tier is never silently green.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/* ── arguments & config ─────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (n) => argv.includes(`--${n}`);

const CONFIG_PATH = join(ROOT, 'repo-audit.config.json');
const config = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) : {};

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const OWNERS = (opt('owners', (config.owners || ['bobrapp', 'aigovops-foundation']).join(','))).split(',').map(s => s.trim()).filter(Boolean);
const REPOS_FILE = opt('repos-file', null);
const ONLY = (opt('only', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const STALE_DAYS = Number(opt('stale-days', config.staleDays ?? 90));
const DORMANT_DAYS = Number(opt('dormant-days', config.dormantDays ?? 365));
const CONCURRENCY = Number(opt('concurrency', 6));
const INCLUDE_ARCHIVED = flag('include-archived');
const QUIET = flag('quiet');
const WANT_DEEP = flag('deep') ? true : flag('no-deep') ? false : Boolean(TOKEN);

const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = resolve(opt('out', join(ROOT, 'audit', `repo-audit-${STAMP}.txt`)));
const JSON_OUT = resolve(opt('json', OUT.replace(/\.txt$/, '') + '.json'));

const NOW = Date.now();
const log = (...a) => { if (!QUIET) process.stderr.write(a.join(' ') + '\n'); };

/* ── github plumbing ────────────────────────────────────────────────────────── */

const API = 'https://api.github.com';
const apiErrors = [];

async function api(path, { raw = false, tolerate404 = true } = {}) {
  const url = path.startsWith('http') ? path : API + path;
  const headers = {
    'Accept': raw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
    'User-Agent': 'aigovops-repo-audit',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers });
    } catch (err) {
      if (attempt === 2) { apiErrors.push(`${path}: ${err.message}`); return { ok: false, status: 0, error: err.message }; }
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.status === 404 && tolerate404) return { ok: false, status: 404, missing: true };
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get('x-ratelimit-reset') || 0) * 1000;
      const remaining = res.headers.get('x-ratelimit-remaining');
      if (remaining === '0' && reset > NOW && attempt < 2) {
        const wait = Math.min(reset - Date.now() + 1000, 60_000);
        log(`  rate limited — waiting ${Math.round(wait / 1000)}s`);
        await sleep(wait);
        continue;
      }
      const body = await res.text().catch(() => '');
      apiErrors.push(`${path}: 403 ${firstLine(body)}`);
      return { ok: false, status: 403, forbidden: true };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      apiErrors.push(`${path}: ${res.status} ${firstLine(body)}`);
      return { ok: false, status: res.status };
    }
    const data = raw ? await res.text() : await res.json();
    return { ok: true, status: res.status, data, link: res.headers.get('link') || '' };
  }
  return { ok: false, status: 0 };
}

async function apiPaged(path, cap = 10) {
  const out = [];
  let url = path + (path.includes('?') ? '&' : '?') + 'per_page=100';
  for (let page = 0; page < cap && url; page++) {
    const r = await api(url);
    if (!r.ok || !Array.isArray(r.data)) break;
    out.push(...r.data);
    const next = /<([^>]+)>;\s*rel="next"/.exec(r.link || '');
    url = next ? next[1] : null;
  }
  return out;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const firstLine = (s) => String(s).replace(/\s+/g, ' ').slice(0, 140);

/* ── repo enumeration ───────────────────────────────────────────────────────── */

function readReposFile(path) {
  const text = readFileSync(resolve(path), 'utf8');
  if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : (parsed.repos || []);
    return list.map(r => (typeof r === 'string' ? { full_name: r } : r));
  }
  return text.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')).map(full_name => ({ full_name }));
}

async function enumerateLive(owners) {
  const seen = new Map();
  // The authenticated user's own repos (covers private ones the owner endpoints hide).
  for (const r of await apiPaged('/user/repos?affiliation=owner,organization_member&sort=pushed')) {
    seen.set(r.full_name, r);
  }
  // Belt and braces: explicit owner listings, in case the token is a fine-grained PAT.
  for (const owner of owners) {
    const asOrg = await apiPaged(`/orgs/${owner}/repos?type=all&sort=pushed`);
    const asUser = asOrg.length ? [] : await apiPaged(`/users/${owner}/repos?type=owner&sort=pushed`);
    for (const r of [...asOrg, ...asUser]) if (!seen.has(r.full_name)) seen.set(r.full_name, r);
  }
  return [...seen.values()].filter(r => owners.includes(r.full_name.split('/')[0]));
}

/* ── deep per-repo checks ───────────────────────────────────────────────────── */

// Matched against the BASENAME, at any depth. Anchoring these to the repo root was a mistake in
// the first cut: it silently half-worked, because the tree call recursed anyway (see deepCheck),
// so `^\.env` matched a root .env but never config/.env — inconsistent coverage that read as
// thorough. Basename matching is honest about what it does: find the shape wherever it lives.
const RISKY_FILE = [
  /^\.env(\..+)?$/i, /\.pem$/i, /\.key$/i, /^id_rsa/i, /^secrets?\..*json$/i,
  /^secrets?\.(ya?ml|txt|env)$/i, /^credentials(\..+)?$/i, /service[-_]?account.*\.json$/i,
  /^\.npmrc$/i, /^\.netrc$/i, /^gha-creds-.*\.json$/i,
];
// Shapes that LOOK like the above and are meant to be committed. A scanner that cries wolf on a
// public key teaches its reader to skim the BLOCKER list, which is the one list that must never be
// skimmed. Both of these were real false positives on the first live run: aigovops-beacon's
// audit/keys/public-key.pem (a public key — publishing it is the point) and Omni-Rapp's
// .env.example (a template with no values).
const BENIGN_FILE = [
  /^\.env\.(example|sample|template|dist|defaults?)$/i,
  /\.pub$/i, /public[-_.].*\.pem$/i, /.*[-_.]public\.pem$/i,
  /^known_hosts$/i,
];
const CI_DIR = '.github/workflows';
const basename = (p) => p.split('/').pop();

async function deepCheck(repo) {
  const [owner, name] = repo.full_name.split('/');
  const d = { reachable: false, checks: {}, counts: {}, riskyFiles: [], notes: [] };

  const meta = await api(`/repos/${owner}/${name}`);
  if (!meta.ok) {
    d.error = meta.forbidden ? 'forbidden (token cannot see this repo)'
      : meta.missing ? 'not found' : `http ${meta.status}`;
    return d;
  }
  d.reachable = true;
  const m = meta.data;
  Object.assign(repo, {
    visibility: m.visibility || (m.private ? 'private' : 'public'),
    archived: m.archived, fork: m.fork, size: m.size, pushed_at: m.pushed_at,
    default_branch: m.default_branch, has_pages: m.has_pages, html_url: m.html_url,
    description: m.description, topics: m.topics || [], open_issues: m.open_issues_count,
    license: m.license ? m.license.spdx_id : null, stargazers: m.stargazers_count,
  });

  if (m.size === 0) { d.notes.push('repository is empty (0 KB)'); d.empty = true; }

  // The whole tree in one call. NOTE: GitHub treats ANY value of `recursive` as true — `recursive=0`
  // recursed, which is how a nested public-key.pem surfaced from a scan documented as root-only.
  // Recursing is what we actually want for the credential sweep, so this asks for it plainly.
  const tree = await api(`/repos/${owner}/${name}/git/trees/${encodeURIComponent(m.default_branch || 'main')}?recursive=1`);
  const paths = tree.ok && Array.isArray(tree.data.tree) ? tree.data.tree.map(t => t.path) : [];
  // GitHub caps a tree response and sets `truncated`. Without this the sweep would quietly cover
  // part of a large repo and report the same clean result as a fully-scanned one.
  if (tree.ok && tree.data.truncated) {
    d.truncated = true;
    d.notes.push('file tree truncated by the API — the credential sweep did not see every file');
  }
  // Root-level presence checks stay root-level: a nested path contains a slash, so these never
  // match a README buried three directories down and call the repo documented.
  const rootNames = paths.filter(p => !p.includes('/'));
  const has = (re) => rootNames.some(n => re.test(n));

  d.checks.readme = has(/^readme(\.md|\.rst|\.txt)?$/i);
  d.checks.license = Boolean(m.license) || has(/^licen[cs]e/i);
  d.checks.gitignore = has(/^\.gitignore$/);
  d.checks.claudeMd = has(/^claude\.md$/i);
  d.checks.description = Boolean(m.description && m.description.trim());
  d.checks.topics = (m.topics || []).length > 0;

  for (const p of paths) {
    const base = basename(p);
    if (BENIGN_FILE.some(re => re.test(base))) continue;
    if (RISKY_FILE.some(re => re.test(base))) d.riskyFiles.push(p);
  }

  // CI, security policy, dependabot, codeowners live under .github/
  const ghDir = await api(`/repos/${owner}/${name}/contents/.github`);
  const ghNames = ghDir.ok && Array.isArray(ghDir.data) ? ghDir.data.map(f => f.name) : [];
  d.checks.security = has(/^security\.md$/i) || ghNames.some(n => /^security\.md$/i.test(n));
  d.checks.codeowners = ghNames.some(n => /^codeowners$/i.test(n)) || has(/^codeowners$/i);
  d.checks.dependabot = ghNames.some(n => /^dependabot\.ya?ml$/i.test(n));

  const wf = await api(`/repos/${owner}/${name}/contents/${CI_DIR}`);
  const workflows = wf.ok && Array.isArray(wf.data) ? wf.data.filter(f => /\.ya?ml$/i.test(f.name)).map(f => f.name) : [];
  d.checks.ci = workflows.length > 0;
  d.workflows = workflows;

  // Tests: a test dir, a test script, or files that look like tests at root.
  const pkg = await api(`/repos/${owner}/${name}/contents/package.json`);
  let pkgJson = null;
  if (pkg.ok && pkg.data && pkg.data.content) {
    try { pkgJson = JSON.parse(Buffer.from(pkg.data.content, 'base64').toString('utf8')); } catch { /* not our problem */ }
  }
  const scriptedTest = pkgJson?.scripts?.test && !/no test specified/i.test(pkgJson.scripts.test);
  d.checks.tests = Boolean(scriptedTest) || has(/^(tests?|spec|__tests__)$/i);

  // Activity: open PRs and how long they have been sitting.
  const prs = await apiPaged(`/repos/${owner}/${name}/pulls?state=open`, 2);
  d.counts.openPrs = prs.length;
  d.counts.stalePrs = prs.filter(p => days(p.updated_at) > 30).length;
  d.counts.openIssues = Math.max(0, (m.open_issues_count || 0) - prs.length);

  return d;
}

/* ── findings engine ────────────────────────────────────────────────────────── */

const SEVERITY = ['BLOCKER', 'RISK', 'GAP', 'NOTE'];
const findings = [];
const finding = (severity, id, title, why, repos, fix) =>
  findings.push({ severity, id, title, why, repos: [...new Set(repos)], fix });

const days = (iso) => iso ? Math.floor((NOW - Date.parse(iso)) / 86_400_000) : Infinity;

const STOP = new Set(['ai', 'bob', 'rapp', 'app', 'the', 'and', 'for', 'v1', 'v2', 'v3', 'v4',
  'june', 'may', 'july', '2025', '2026', 'new', 'my', 'demo', 'test', 'with']);

function tokens(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase().split(/[^a-z0-9]+/).filter(t => t && !STOP.has(t));
}

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function inventoryFindings(repos) {
  const live = repos.filter(r => !r.archived);

  // Foundation work parked in a personal account.
  const misplaced = live.filter(r =>
    r.full_name.startsWith('bobrapp/') && /aigov|govops/i.test(r.name));
  if (misplaced.length) {
    finding('RISK', 'ORG-PLACEMENT', 'Foundation-named work lives in a personal account',
      'These repos carry the AiGovOps name but are owned by bobrapp, not aigovops-foundation. ' +
      'Ownership, access control and continuity all sit with one person — the exact single point ' +
      'of failure the governed model exists to remove. If the account is lost, so is the work.',
      misplaced.map(r => r.full_name),
      'Transfer to aigovops-foundation (Settings → Transfer ownership), or rename to drop the ' +
      'AiGovOps name if it is genuinely personal. Transfer is irreversible — a founder decision.');
  }

  // Public repos with no license — the "open source" claim does not hold without one.
  const publicNoLicense = live.filter(r => r.visibility === 'public' && r.deep?.reachable && !r.deep.checks.license);
  if (publicNoLicense.length) {
    finding('RISK', 'NO-LICENSE-PUBLIC', 'Public repos published with no licence',
      'A public repo without a LICENSE is "all rights reserved" by default: readers may look but ' +
      'may not legally use, fork or contribute. For a foundation whose pitch is open source, this ' +
      'quietly contradicts the promise.',
      publicNoLicense.map(r => r.full_name), 'Add a LICENSE file (Apache-2.0 or MIT) to each.');
  }

  // Stale and dormant.
  const stale = live.filter(r => days(r.pushed_at) > STALE_DAYS && days(r.pushed_at) <= DORMANT_DAYS);
  const dormant = live.filter(r => days(r.pushed_at) > DORMANT_DAYS);
  if (dormant.length) {
    finding('GAP', 'ARCHIVE-CANDIDATE', `${dormant.length} repos untouched for over ${DORMANT_DAYS} days and not archived`,
      'A live repo that nobody has pushed to in a year reads as maintained when it is not. Archiving ' +
      'keeps the history and the URL, and makes the status honest at a glance.',
      dormant.map(r => `${r.full_name}  (${days(r.pushed_at)}d)`),
      'Archive each (Settings → Archive). Reversible, but do it deliberately — a founder decision.');
  }
  if (stale.length) {
    finding('NOTE', 'STALE', `${stale.length} repos idle ${STALE_DAYS}–${DORMANT_DAYS} days`,
      'Not yet archive candidates, but worth a decision: finish, fold into another repo, or let go.',
      stale.map(r => `${r.full_name}  (${days(r.pushed_at)}d)`), 'Triage at the next planning pass.');
  }

  // Near-duplicate names — the sprawl signal.
  const pairs = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      const ta = tokens(a.name), tb = tokens(b.name);
      if (ta.length < 2 || tb.length < 2) continue;
      const score = jaccard(ta, tb);
      if (score >= 0.6) pairs.push(`${a.full_name}  ≈  ${b.full_name}  (${Math.round(score * 100)}% name overlap)`);
    }
  }
  if (pairs.length) {
    finding('GAP', 'NEAR-DUPLICATE', `${pairs.length} pairs of repos with near-identical names`,
      'Two repos with the same idea in the name means someone will eventually open the wrong one and ' +
      'ship from a dead branch of the work. One should be the home; the other should point at it or go.',
      pairs, 'Pick the canonical repo per pair; archive the other with a README line pointing at the survivor.');
  }

  // Date-stamped names age badly.
  const dated = live.filter(r => /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-_]?20\d\d|20\d\d[-_]?(v\d)?$/i.test(r.name));
  if (dated.length) {
    finding('NOTE', 'DATE-STAMPED', `${dated.length} repos carry a date in the name`,
      'A repo called "…-june-2026" reads as expired the moment July arrives, even when it is the live one. ' +
      'The Library itself is in this list.',
      dated.map(r => r.full_name), 'Rename to the durable name when each one settles; GitHub keeps redirects.');
  }

  // Scratch and tutorial leftovers.
  const scratch = live.filter(r => /^(test\d*|demo\d*\w*|desktop-tutorial|examples?-|mod\d|gpt2$)/i.test(r.name) || /tutorial|hello-world/i.test(r.name));
  if (scratch.length) {
    finding('NOTE', 'SCRATCH', `${scratch.length} scratch/tutorial repos still live`,
      'Harmless individually; together they are most of what a visitor sees on the profile.',
      scratch.map(r => r.full_name), 'Archive or delete. Deletion is irreversible — founder decision.');
  }

  // A repo named after an email address.
  const emailNamed = live.filter(r => /@|\.(com|net|org)$/i.test(r.name));
  if (emailNamed.length) {
    finding('NOTE', 'EMAIL-NAMED', 'Repo named after an email address',
      'The name leaks a personal address into every URL and search result that touches the repo.',
      emailNamed.map(r => r.full_name), 'Rename.');
  }
}

function deepFindings(repos) {
  const scored = repos.filter(r => r.deep?.reachable && (!r.archived || INCLUDE_ARCHIVED));

  // Secrets first — the only class that is a BLOCKER.
  const leaky = scored.filter(r => r.deep.riskyFiles.length);
  const leakyPublic = leaky.filter(r => r.visibility === 'public');
  if (leakyPublic.length) {
    finding('BLOCKER', 'SECRET-SHAPED-FILE-PUBLIC', 'Files that look like credentials sit in PUBLIC repos',
      'Filenames matching .env / *.pem / *.key / secrets*.json / credentials* at the repo root of a public ' +
      'repository. This repo has been here before: a dev keypair sat in HEAD of a public repo for six weeks ' +
      'in June. Treat every hit as live until proven otherwise.',
      leakyPublic.map(r => `${r.full_name}: ${r.deep.riskyFiles.join(', ')}`),
      'Rotate the credential FIRST, then purge from history. Rotation before deletion — a deleted secret ' +
      'that was already cloned is still a live secret. Founder decision, not an agent one.');
  }
  const leakyPrivate = leaky.filter(r => r.visibility !== 'public');
  if (leakyPrivate.length) {
    finding('RISK', 'SECRET-SHAPED-FILE-PRIVATE', 'Credential-shaped files in private repos',
      'Lower blast radius than the public case, but a private repo that later goes public carries its ' +
      'whole history with it.',
      leakyPrivate.map(r => `${r.full_name}: ${r.deep.riskyFiles.join(', ')}`),
      'Confirm each is a template/example; gitignore the real ones.');
  }

  const gap = (key, id, sev, title, why, fix, filter = () => true) => {
    const hit = scored.filter(r => filter(r) && r.deep.checks[key] === false);
    if (hit.length) finding(sev, id, `${hit.length} repos ${title}`, why, hit.map(r => r.full_name), fix);
  };

  gap('readme', 'NO-README', 'GAP', 'have no README',
    'The README is the only thing most readers ever open. Without it a repo is unreadable from outside.',
    'Add a README: what it is, how to run it, who owns it.');
  gap('description', 'NO-DESCRIPTION', 'GAP', 'have no description set',
    'The description is what shows in search and on the profile grid. Empty means invisible.',
    'Set a one-line description on each (Settings → About).');
  gap('gitignore', 'NO-GITIGNORE', 'RISK', 'have no .gitignore',
    'No .gitignore is how secrets and build junk get committed by accident — the exact failure this repo ' +
    'already lived through.',
    'Add a .gitignore covering .env, *.pem, *.key, node_modules.');
  gap('ci', 'NO-CI', 'GAP', 'have no CI workflow',
    'Nothing checks these on push, so breakage is discovered by a human noticing.',
    'Add a minimal .github/workflows/ci.yml — even just install + test.',
    r => !r.deep.empty);
  gap('tests', 'NO-TESTS', 'GAP', 'have no tests',
    'No test surface means no way to tell a working change from a broken one.',
    'Add at least a smoke test.', r => !r.deep.empty);
  gap('security', 'NO-SECURITY', 'NOTE', 'have no SECURITY.md',
    'A public repo with no disclosure route means a finder has nowhere to report but Twitter.',
    'Add SECURITY.md with a contact address.', r => r.visibility === 'public');
  gap('topics', 'NO-TOPICS', 'NOTE', 'have no topics',
    'Topics are how anyone finds the Foundation\'s work on GitHub.',
    'Tag each with 3–5 topics.', r => r.visibility === 'public');
  gap('dependabot', 'NO-DEPENDABOT', 'NOTE', 'have no dependabot config',
    'Dependency drift is silent until it is a CVE.',
    'Add .github/dependabot.yml.', r => !r.deep.empty);

  const emptyRepos = scored.filter(r => r.deep.empty);
  if (emptyRepos.length) {
    finding('GAP', 'EMPTY', `${emptyRepos.length} repos are empty`,
      'Zero bytes. Either the work never landed or it landed somewhere else.',
      emptyRepos.map(r => r.full_name), 'Delete, or push the work that was meant to be here.');
  }

  const stalePrs = scored.filter(r => (r.deep.counts.stalePrs || 0) > 0);
  if (stalePrs.length) {
    finding('GAP', 'STALE-PR', `${stalePrs.length} repos have PRs open over 30 days`,
      'An open PR nobody has touched in a month is a decision that was never made.',
      stalePrs.map(r => `${r.full_name}: ${r.deep.counts.stalePrs} stale of ${r.deep.counts.openPrs} open`),
      'Merge, close, or say why it is parked.');
  }
}

/* ── report writer ──────────────────────────────────────────────────────────── */

const rule = (ch = '─') => ch.repeat(78);
const pad = (s, n) => String(s).padEnd(n);

function renderReport(state) {
  const { repos, mode, owners } = state;
  const L = [];
  const p = (s = '') => L.push(s);

  p(rule('═'));
  p('  AiGovOps — REPOSITORY ESTATE AUDIT');
  p(`  generated ${new Date().toISOString()}`);
  p(rule('═'));
  p();
  p(`  Owners audited : ${owners.join(', ')}`);
  p(`  Repos found    : ${repos.length}`);
  p(`  Tier           : ${mode.deep ? 'DEEP (per-repo contents checked)' : 'INVENTORY ONLY'}`);
  p(`  Source of list : ${mode.source}`);
  if (mode.partial) {
    p();
    p('  ┌─ PARTIAL RUN ────────────────────────────────────────────────────────┐');
    p('  │ Only the repos named on the command line were audited. The counts    │');
    p('  │ and findings below describe THOSE repos, not the estate. Nothing     │');
    p('  │ here says anything about the repos that were not asked for.          │');
    p('  └──────────────────────────────────────────────────────────────────────┘');
  }
  if (!mode.deep) {
    p();
    p('  ┌─ READ THIS BEFORE TRUSTING THE SCORE ────────────────────────────────┐');
    p('  │ The deep tier did not run, so nothing below reflects what is INSIDE  │');
    p('  │ these repositories. README, LICENSE, CI, tests and credential-shaped │');
    p('  │ files were NOT checked. An empty findings list here does not mean a  │');
    p('  │ clean estate — it means an unopened one.                             │');
    p(`  │ Reason: ${pad(mode.reason.slice(0, 61), 61)}│`);
    p('  │ To complete it:  GITHUB_TOKEN=<pat> node scripts/repo-audit.mjs      │');
    p('  └──────────────────────────────────────────────────────────────────────┘');
  }
  p();

  /* summary */
  const live = repos.filter(r => !r.archived);
  const byOwner = {};
  for (const r of repos) (byOwner[r.owner] ||= []).push(r);
  const pub = repos.filter(r => r.visibility === 'public').length;
  const priv = repos.filter(r => r.visibility === 'private').length;
  const arch = repos.filter(r => r.archived).length;
  const reachable = repos.filter(r => r.deep?.reachable).length;

  p(rule());
  p('1. THE ESTATE AT A GLANCE');
  p(rule());
  p();
  p(`  total repositories .......... ${repos.length}`);
  for (const [owner, list] of Object.entries(byOwner)) {
    p(`    ${pad(owner, 26)} ${String(list.length).padStart(3)}  ` +
      `(${list.filter(r => r.visibility === 'public').length} public / ${list.filter(r => r.visibility === 'private').length} private)`);
  }
  p(`  public / private ............ ${pub} / ${priv}`);
  p(`  archived .................... ${arch}`);
  p(`  active (pushed <${STALE_DAYS}d) ....... ${live.filter(r => days(r.pushed_at) <= STALE_DAYS).length}`);
  p(`  stale (${STALE_DAYS}–${DORMANT_DAYS}d) .............. ${live.filter(r => days(r.pushed_at) > STALE_DAYS && days(r.pushed_at) <= DORMANT_DAYS).length}`);
  p(`  dormant (>${DORMANT_DAYS}d, unarchived) .. ${live.filter(r => days(r.pushed_at) > DORMANT_DAYS).length}`);
  if (mode.deep) p(`  opened successfully ......... ${reachable} of ${repos.length}`);
  p();

  /* findings */
  p(rule());
  p('2. WHAT IS MISSING');
  p(rule());
  p();
  if (!findings.length) {
    p('  No findings at the tier that ran.');
    p();
  }
  let n = 0;
  for (const sev of SEVERITY) {
    const group = findings.filter(f => f.severity === sev);
    if (!group.length) continue;
    p(`  ${sev} (${group.length})`);
    p(`  ${'-'.repeat(74)}`);
    for (const f of group) {
      n++;
      p();
      p(`  [${sev}/${f.id}]  ${f.title}`);
      p();
      for (const line of wrap(f.why, 72)) p(`    ${line}`);
      p();
      p(`    Affected (${f.repos.length}):`);
      for (const r of f.repos.slice(0, 40)) p(`      · ${r}`);
      if (f.repos.length > 40) p(`      … and ${f.repos.length - 40} more (full list in the JSON export)`);
      p();
      for (const line of wrap('FIX: ' + f.fix, 72)) p(`    ${line}`);
    }
    p();
  }

  /* per-repo table */
  p(rule());
  p('3. EVERY REPOSITORY');
  p(rule());
  p();
  const cols = mode.deep
    ? `  ${pad('repository', 58)} ${pad('vis', 8)} ${pad('idle', 6)} rd li gi ci ts`
    : `  ${pad('repository', 58)} ${pad('vis', 8)} ${pad('idle', 6)} state`;
  p(cols);
  p(`  ${'-'.repeat(74)}`);
  const sorted = [...repos].sort((a, b) => (a.owner + a.name).localeCompare(b.owner + b.name));
  for (const r of sorted) {
    const idle = days(r.pushed_at);
    const idleStr = idle === Infinity ? '  ?  ' : `${String(idle).padStart(4)}d`;
    const vis = (r.archived ? 'arch' : r.visibility || '?');
    if (mode.deep && r.deep?.reachable) {
      const c = r.deep.checks;
      const y = (v) => (v ? ' ✓' : ' ✗');
      p(`  ${pad(r.full_name, 58)} ${pad(vis, 8)} ${idleStr} ${y(c.readme)} ${y(c.license)} ${y(c.gitignore)} ${y(c.ci)} ${y(c.tests)}`);
    } else if (mode.deep) {
      p(`  ${pad(r.full_name, 58)} ${pad(vis, 8)} ${idleStr}  — ${r.deep?.error || 'not opened'}`);
    } else {
      const state = r.archived ? 'archived'
        : idle > DORMANT_DAYS ? 'dormant'
          : idle > STALE_DAYS ? 'stale' : 'active';
      p(`  ${pad(r.full_name, 58)} ${pad(vis, 8)} ${idleStr} ${state}`);
    }
  }
  p();
  if (mode.deep) p('  legend: rd=README li=LICENSE gi=.gitignore ci=workflow ts=tests');
  p();

  /* method */
  p(rule());
  p('4. METHOD & LIMITS');
  p(rule());
  p();
  for (const line of wrap(
    'This audit reads repository metadata and the full file TREE (names only) through the GitHub ' +
    'REST API. Presence checks — README, LICENSE, .gitignore — are root-level; the credential ' +
    'sweep matches filename shapes at any depth. It does not read file contents beyond ' +
    'package.json, does not scan git history, and does not verify that any credential-shaped file ' +
    'actually contains a credential — it flags the shape and leaves the judgement to a human. ' +
    'Branch protection and org settings are not checked (they need admin scope). Nothing here is ' +
    'a substitute for GitHub secret scanning.', 74)) p('  ' + line);
  p();
  const truncatedRepos = repos.filter(r => r.deep?.truncated);
  if (truncatedRepos.length) {
    p(`  Trees truncated by the API — credential sweep incomplete on these (${truncatedRepos.length}):`);
    for (const r of truncatedRepos) p(`    · ${r.full_name}`);
    p();
  }
  // An empty repo answers its tree call with 409. That is the check working, not the check
  // failing — listing it beside real outages buries the outages in noise.
  const benign = apiErrors.filter(e => /409 .*Git Repository is empty/i.test(e));
  const realErrors = apiErrors.filter(e => !benign.includes(e));
  if (realErrors.length) {
    p(`  API calls that did not return (${realErrors.length}) — these repos are UNDER-reported:`);
    for (const e of realErrors.slice(0, 25)) p(`    · ${e}`);
    if (realErrors.length > 25) p(`    … and ${realErrors.length - 25} more`);
    p('    Re-run to pick these up; a 5xx here is GitHub being slow, not a clean repo.');
    p();
  }
  if (benign.length) {
    p(`  (${benign.length} further 409s are empty repositories — expected, already counted above.)`);
    p();
  }
  p(`  Text export : ${OUT}`);
  p(`  JSON export : ${JSON_OUT}`);
  p();
  p(rule('═'));
  p('  Prepared for a human decision. Transfers, deletions, archiving and credential');
  p('  rotation are irreversible — this report proposes; Bob or Ken decide.');
  p(rule('═'));

  return L.join('\n') + '\n';
}

function wrap(text, width) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > width) { lines.push(cur.trim()); cur = w; }
    else cur += ' ' + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

/* ── main ───────────────────────────────────────────────────────────────────── */

async function main() {
  const mode = { deep: false, source: '', reason: '' };
  let raw = [];

  if (ONLY.length) {
    const bad = ONLY.filter(n => !/^[^/\s]+\/[^/\s]+$/.test(n));
    if (bad.length) {
      console.error(`--only wants owner/name, got: ${bad.join(', ')}`);
      process.exit(2);
    }
    raw = ONLY.map(full_name => ({ full_name }));
    mode.source = `--only (${raw.length} named repos)`;
    mode.partial = true;
    log(`auditing ${raw.length} named repo(s)`);
  } else if (REPOS_FILE) {
    raw = readReposFile(REPOS_FILE);
    mode.source = `${REPOS_FILE} (${raw.length} entries)`;
    log(`repo list: ${raw.length} from ${REPOS_FILE}`);
  } else {
    if (!TOKEN) {
      console.error('No GITHUB_TOKEN/GH_TOKEN and no --repos-file. Nothing to audit.');
      console.error('Give it a token, or pass --repos-file audit/repos.inventory.json');
      process.exit(2);
    }
    log('enumerating repositories…');
    raw = await enumerateLive(OWNERS);
    mode.source = `live GitHub API (${raw.length} repos)`;
    if (!raw.length) {
      console.error('Enumeration returned nothing — the token cannot list these owners.');
      console.error(apiErrors.slice(0, 5).map(e => '  ' + e).join('\n'));
      process.exit(2);
    }
  }

  const repos = raw.map(r => {
    const [owner, name] = r.full_name.split('/');
    return { ...r, owner, name, visibility: r.visibility || (r.private ? 'private' : r.private === false ? 'public' : undefined) };
    // An explicitly named repo is always audited. Silently dropping it for not matching the
    // configured owners would answer "nothing to report" to a question about a specific repo.
  }).filter(r => ONLY.length || OWNERS.includes(r.owner));

  if (WANT_DEEP && TOKEN) {
    log(`deep-checking ${repos.length} repos (concurrency ${CONCURRENCY})…`);
    let done = 0, ok = 0;
    const queue = [...repos];
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const r = queue.shift();
        r.deep = await deepCheck(r);
        if (r.deep.reachable) ok++;
        if (++done % 10 === 0) log(`  ${done}/${repos.length}`);
      }
    }));
    if (ok === 0) {
      mode.deep = false;
      mode.reason = 'token present but every repo call was refused';
      log('WARNING: no repo could be opened — falling back to the inventory tier.');
    } else {
      mode.deep = true;
      if (ok < repos.length) log(`note: ${repos.length - ok} repos could not be opened`);
    }
  } else {
    mode.reason = TOKEN ? 'deep tier disabled with --no-deep' : 'no GITHUB_TOKEN/GH_TOKEN available';
  }

  inventoryFindings(repos);
  if (mode.deep) deepFindings(repos);
  findings.sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity));

  const text = renderReport({ repos, mode, owners: OWNERS });
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, text, 'utf8');
  writeFileSync(JSON_OUT, JSON.stringify({
    generatedAt: new Date().toISOString(), owners: OWNERS, mode,
    counts: { total: repos.length, deepChecked: repos.filter(r => r.deep?.reachable).length },
    findings, repos: repos.map(({ deep, ...r }) => ({ ...r, deep: deep || null })), apiErrors,
  }, null, 2), 'utf8');

  log(`\nwrote ${OUT}`);
  log(`wrote ${JSON_OUT}`);
  const blockers = findings.filter(f => f.severity === 'BLOCKER').length;
  log(`${findings.length} findings — ${blockers} blocker(s)`);
  process.exit(blockers ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(2); });
