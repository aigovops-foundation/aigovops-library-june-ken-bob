// test/interaction-crawl.test.mjs — proves the interaction crawler catches planted
// defects and does NOT cry wolf. Needs a browser, so it runs in the interaction-crawl
// workflow (playwright + chromium), NOT the dependency-free core-tests suite.
//
//   node --test test/interaction-crawl.test.mjs
//
// Requires: playwright (or playwright-core) installed + a chromium available.
import { test } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile); // async: keeps the in-process fixture server responsive

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, 'interaction-fixture');
const CRAWLER = join(HERE, '..', 'scripts', 'interaction-crawl.mjs');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function serveFixture() {
  const server = createServer((req, res) => {
    const p = join(FIXTURE, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!p.startsWith(FIXTURE) || !existsSync(p)) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('content-type', MIME[extname(p)] || 'text/plain');
    res.end(readFileSync(p));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

test('interaction crawler catches planted dead + broken, passes the good ones', async () => {
  const server = await serveFixture();
  const { port } = server.address();
  const out = join(mkdtempSync(join(tmpdir(), 'icrawl-')), 'r.json');
  let res = {};
  // The crawler exits non-zero when it finds broken/dead — expected here, so catch and
  // still read the report. execFile is async so the fixture server keeps serving.
  try { res = await run('node', [CRAWLER, '--url', `http://127.0.0.1:${port}/`, '--out', out, '--site-name', 'Fixture', '--max-pages', '5', '--fail-on-dead'], { env: process.env }); }
  catch (e) { res = e; }
  server.close();
  assert.ok(existsSync(out), `crawler produced no report.\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  const rep = JSON.parse(readFileSync(out, 'utf8'));

  // 4 planted defects: 404 link (BROKEN), missing anchor + dead button + dead card (DEAD).
  assert.strictEqual(rep.summary.broken, 1, 'should catch exactly the one 404 link');
  assert.strictEqual(rep.summary.dead, 3, 'should catch the missing-anchor + dead button + dead card');

  const deadText = rep.dead.map((d) => d.text).join(' | ');
  assert.match(deadText, /Dead button/, 'flags the handler-less button');
  assert.match(deadText, /Dead card/, 'flags the handler-less card');
  assert.match(rep.broken.map((b) => b.text).join(' | '), /Broken internal link/, 'flags the 404 link');

  // no false positives on the good ones (real link, onclick, addEventListener, submit,
  // covered child, span-in-link, anchor-to-existing, external).
  const badTexts = [...rep.dead, ...rep.broken].map((x) => x.text).join(' | ');
  // The four classes that faked 95% of the 2026-08-19 estate report. Each was reported DEAD by a
  // crawler looking the wrong way; each is pinned here so the fix cannot silently regress.
  //   Dotted anchor            — querySelector('#' + frag) parses '.mod' as a CLASS
  //   onclick property         — el.onclick = fn sets no attribute and no listener
  //   wrapping label           — a <label> around its input is interactive without for=
  //   disabled / [data-simulated] — declared non-operable: a depiction, not a defect
  for (const good of ['Good internal link', 'Wired via onclick', 'Wired via addEventListener', 'Submit', 'covered child link', 'span inside a link', 'Anchor to existing',
                      'Dotted anchor', 'Wired via onclick property', 'child of a wrapping label', 'Disabled on purpose', 'Depicted button', 'Unfilled placeholder link',
                      'child of a property-wired chip']) {
    assert.ok(!badTexts.includes(good), `false positive: "${good}" was flagged`);
  }
});
