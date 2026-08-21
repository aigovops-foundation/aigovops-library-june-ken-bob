#!/usr/bin/env node
// scripts/interaction-crawl.mjs — the estate's INTERACTION crawler.
//
// The link-check lane (reusable-link-check.yml) is curl-based: it asks "does this
// href return 200?". It cannot see a card that LOOKS clickable but has no link, a
// <button> whose JS handler was deleted, a language toggle that silently no-ops, or
// a page that throws on load. Those need a real browser that RENDERS the page and
// inspects every interactive element the way a person would reach for it.
//
// This script drives headless Chromium (Playwright) over every same-origin page of a
// site and, for each interactive element, decides whether it actually DOES something:
//
//   • LINK      — an <a href>; the target is verified (internal 4xx/5xx = BROKEN).
//   • WIRED     — a real handler is present: an onclick attribute, a form submit, OR
//                 a click/pointer/key listener attached via addEventListener (we
//                 instrument addEventListener BEFORE page scripts run, so delegation
//                 and framework handlers are visible — not guessed).
//   • DEAD      — it looks clickable (a <button>, [role=button], a .btn/.cta, or an
//                 element with cursor:pointer) but has NO target and NO handler:
//                 clicking it does nothing. This is the class the curl checker misses.
//   • console errors / pageerrors on load are captured per page.
//
// It never CLICKS destructively — classification is by inspection + target-verify, so
// a run has no side effects (no forms submitted, no state mutated). Deterministic.
//
// Usage:
//   node scripts/interaction-crawl.mjs --url https://www.aigovops-foundation.com \
//        --out out.json [--max-pages 80] [--site-name "Foundation"] [--fail-on-dead]
//
// Env override for a pinned browser (e.g. a pre-installed Chromium):
//   PW_EXECUTABLE_PATH=/opt/pw-browsers/chromium-XXXX/chrome-linux/chrome
//
// Dependency: playwright (or playwright-core). The link checker stays dependency-free;
// clicking buttons is not possible without a browser, so this lane owns that cost.

import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const flag = (name) => argv.includes(`--${name}`);

const BASE = opt('url') || process.env.CRAWL_URL;
const OUT = opt('out') || 'interaction-crawl.json';
const SITE_NAME = opt('site-name') || (BASE ? new URL(BASE).host : 'site');
const MAX_PAGES = parseInt(opt('max-pages', '80'), 10);
const FAIL_ON_DEAD = flag('fail-on-dead') || process.env.FAIL_ON_DEAD === 'true';

// A CONSENT DOOR IS NOT AN AUTHENTICATION WALL. The rendered Library sits behind a one-click
// "I agree to ten rules" page that sets omni_rules=1 — no account, no payment, no secret. It was
// marked gated and therefore never crawled, so the estate's interaction checks covered five
// marketing and docs sites and neither member-facing surface. --cookie carries that consent, so
// the Library is held to the same standard as everything else. NON-SECRET cookies only, by
// design: anything needing a real session belongs in a signed-in crawl, not a flag here.
const COOKIE = opt('cookie', process.env.CRAWL_COOKIE || '');
const NAV_TIMEOUT = parseInt(opt('nav-timeout', '20000'), 10);

if (!BASE) {
  console.error('interaction-crawl: --url <site root> is required');
  process.exit(2);
}
const ORIGIN = new URL(BASE).origin;

// ---- helpers ----------------------------------------------------------------
const sameOrigin = (u) => { try { return new URL(u, ORIGIN).origin === ORIGIN; } catch { return false; } };
// ALLOW-LIST the extensions a browser renders as a page, rather than deny-listing the ones
// it does not. The deny-list was the wrong shape: it named png/pdf/zip and missed .rego,
// .xlsx and .pptx, so those downloads were queued as PAGES. page.goto() on a download
// aborts the navigation, the abort was recorded as a load error, and three working
// downloads were reported as three red pages on every property, every hour. A deny-list
// silently mis-handles every file type nobody thought of; an allow-list fails closed.
//
// Excluding them here costs no coverage: every linked target, asset or not, is still
// fetched and status-checked below, so a genuinely broken download is still caught as a
// BROKEN link. It simply stops being rendered, and stops being a fake red page.
const isHtmlPath = (u) => {
  try {
    const p = new URL(u, ORIGIN).pathname;
    const ext = (p.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
    return ext === '' || ext === 'html' || ext === 'htm' || ext === 'xhtml';
  } catch { return false; }
};
const stripHash = (u) => { try { const x = new URL(u, ORIGIN); x.hash = ''; return x.href; } catch { return u; } };

// Instrumentation injected BEFORE any page script: tag every element that receives an
// interaction listener, and record whether the document/body/window use delegation.
const INIT_SCRIPT = `(() => {
  const INTERACT = new Set(['click','pointerdown','pointerup','mousedown','mouseup','keydown','keyup','submit']);
  const proto = EventTarget.prototype;
  const orig = proto.addEventListener;
  window.__crawlDelegation = false;
  proto.addEventListener = function(type, listener, opts) {
    try {
      if (INTERACT.has(type)) {
        if (this instanceof Element) { this.setAttribute('data-crawl-wired', '1'); }
        else if (this === document || this === window || this === (document && document.body)) { window.__crawlDelegation = true; }
      }
    } catch (e) { /* never break the page */ }
    return orig.call(this, type, listener, opts);
  };
})();`;

// Runs in the page: enumerate every interactive-looking element and describe it.
const COLLECT = `(() => {
  const SEL = 'a, button, [role="button"], [onclick], input[type="submit"], input[type="button"], input[type="reset"], summary, label[for], [data-jeeves-open], .btn, .cta, [class*="btn"]';
  const seen = new Set();
  const nodes = Array.from(document.querySelectorAll(SEL));
  // also anything the author styled as clickable (cursor:pointer) that isn't native
  for (const el of Array.from(document.querySelectorAll('div, span, li, article, section'))) {
    if (getComputedStyle(el).cursor === 'pointer') nodes.push(el);
  }
  const out = [];
  // A LABEL THAT WRAPS ITS CONTROL IS INTERACTIVE TOO. This listed only label[for], so the
  // perfectly ordinary <label><input type=radio><span>…</span></label> was not counted as a
  // control — and every span inside it, inheriting the label's pointer cursor, was reported as
  // a dead clickable. That was 43 of the "105 dead controls" on the Beacon lab pages on
  // 2026-08-19; clicking any of them toggles its radio exactly as intended.
  // A CSS SELECTOR CANNOT TEST A JS PROPERTY. An element wired with el.onclick = fn matches
  // neither [onclick] (that is the ATTRIBUTE) nor [data-crawl-wired] (that is set only by the
  // addEventListener instrumentation), so it was invisible to the ancestor test below even after
  // the element-level check learned to see it. Consequence: NCW's jeeves-demo.html has six
  // process chips wired exactly that way; every chip verified WIRED while its own child spans
  // were reported DEAD — 14 findings from six working controls. Tag them first so closest()
  // can find them. (No backticks in this comment: it lives inside a template literal.)
  for (const el of document.querySelectorAll('*')) {
    if (typeof el.onclick === 'function') el.setAttribute('data-crawl-onclick', '1');
  }
  const INT = 'a[href], button, [role="button"], [onclick], [data-crawl-onclick], [data-crawl-wired], input[type="submit"], input[type="button"], summary, label[for], label:has(input), label:has(select), label:has(textarea)';
  for (const el of nodes) {
    if (seen.has(el)) continue; seen.add(el);
    const r = el.getBoundingClientRect();
    const visible = !!(el.offsetParent || r.width || r.height) && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
    const tag = el.tagName.toLowerCase();
    const rawHref = el.getAttribute('href');
    let href = null; if (rawHref != null) { try { href = new URL(rawHref, location.href).href; } catch { href = rawHref; } }
    const type = (el.getAttribute('type') || '').toLowerCase();
    const inForm = !!el.closest('form');
    const forId = el.getAttribute('for');
    const labelTargetOk = forId ? !!document.getElementById(forId) : null;
    const labelWraps = tag === 'label' && !!el.querySelector('input, select, textarea');
    let anchorTargetOk = null;
    // ANCHOR TARGETS ARE LOOKED UP BY ID, NOT BY SELECTOR. querySelector('#' + frag) parses the
    // fragment as CSS, where '.' starts a class and ':' a pseudo-class — so every dotted id
    // (mkdocstrings names every Python symbol that way: #aigovops_lantern.bundle.Receipt) asked
    // for "id=aigovops_lantern AND class=bundle AND class=Receipt" and never matched. That single
    // line reported 18 live anchors on Lantern's API pages as dead on 2026-08-18. getElementById
    // does an exact string match and cannot be confused by punctuation. The fragment is also
    // percent-decoded, because href="#caf%C3%A9" targets id="café".
    if (rawHref && rawHref.startsWith('#')) {
      const frag = rawHref.slice(1);
      let id = frag; try { id = decodeURIComponent(frag); } catch (err) { id = frag; }
      anchorTargetOk = frag === '' ? false
        : !!(document.getElementById(id) || document.getElementById(frag)
             || document.getElementsByName(id).length);
    }
    out.push({
      tag,
      role: el.getAttribute('role') || null,
      text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\\s+/g,' ').slice(0,80),
      cls: (el.getAttribute('class')||'').slice(0,80),
      href, rawHref: rawHref ?? null,
      type: type || null, inForm,
      onclickAttr: el.hasAttribute('onclick'),
      // A HANDLER CAN BE A PROPERTY, NOT AN ATTRIBUTE OR A LISTENER. Assigning el.onclick = fn
      // sets neither an onclick ATTRIBUTE nor an addEventListener registration, so both of the
      // detectors above are blind to it and the element reads as dead. On 2026-08-19 that
      // reported the "Reveal debrief" buttons on ksr-cards.html and the quiz options on
      // demo-walkthroughs.html as dead — all of which respond correctly when clicked.
      // (No backticks in this comment: it lives inside a template literal.)
      onclickProp: typeof el.onclick === 'function',
      // A CONTROL NOBODY CAN OPERATE IS NOT A BROKEN CONTROL. Two cases, both deliberate:
      // the disabled attribute (the page says this cannot be pressed), and anything inside
      // [data-simulated] or [inert] (the page says the region is a PICTURE of software, not
      // software). The NCW
      // kit's demo-walkthroughs.html is nineteen labelled "SIMULATED — example output for
      // teaching" screens; its mock quiz buttons and its deliberately unfilled "Official
      // donation link placeholder" were reported as five dead controls on 2026-08-19. Wiring
      // them would have destroyed the lesson, which is precisely that the placeholder is
      // unfilled. Flagging a drawing of a button teaches the reader to distrust the report.
      disabled: !!el.disabled,
      simulated: !!el.closest('[data-simulated], [inert]'),
      wired: el.hasAttribute('data-crawl-wired'),
      isSubmit: (tag === 'button' && (type === 'submit' || (!type && inForm))) || type === 'submit',
      labelTargetOk, labelWraps, anchorTargetOk,
      cursorPointer: getComputedStyle(el).cursor === 'pointer',
      visible,
      dataJeeves: el.hasAttribute('data-jeeves-open'),
      // A clickable-looking element is NOT dead if a real control wraps it (its
      // parent is the link) or nests inside it (it is just a container/caption).
      hasIntAncestor: !!(el.parentElement && el.parentElement.closest(INT)),
      hasIntDescendant: !!el.querySelector(INT),
    });
  }
  return { delegation: !!window.__crawlDelegation, elements: out };
})();`;

// ---- classify one element (in Node) ----------------------------------------
function classify(e, delegation, targetStatus) {
  // Declared non-operable before anything else: neither is a defect, so neither is a finding.
  if (e.disabled) return { verdict: 'INERT', reason: 'disabled — cannot be operated by design' };
  if (e.simulated) return { verdict: 'INERT', reason: 'inside a simulated/inert region — a depiction, not a control' };
  // native affordance?
  const nativeInteractive = ['a','button','summary','label','input','select','textarea'].includes(e.tag)
    || e.role === 'button' || e.onclickAttr || e.onclickProp || e.dataJeeves;
  const looksClickable = nativeInteractive || e.cursorPointer || /\b(btn|cta|button|card)\b/.test(e.cls);

  // 1) real link with an href
  if (e.rawHref != null && e.rawHref !== '') {
    if (e.rawHref.startsWith('#')) {
      return e.anchorTargetOk ? { verdict: 'WIRED', reason: 'in-page anchor → existing target' }
                              : { verdict: 'DEAD', reason: `anchor "${e.rawHref}" has no matching target` };
    }
    if (/^(mailto:|tel:|javascript:)/i.test(e.rawHref)) {
      if (/^javascript:\s*(void\(0\)|;)?\s*$/i.test(e.rawHref) && !(e.onclickAttr || e.wired))
        return { verdict: 'DEAD', reason: 'javascript: void link with no handler' };
      return { verdict: 'WIRED', reason: 'protocol link' };
    }
    if (!sameOrigin(e.href)) return { verdict: 'EXTERNAL', reason: 'external link (reported, not failed)' };
    const st = targetStatus.get(stripHash(e.href));
    if (st == null) return { verdict: 'LINK', reason: 'internal link (unverified)' };
    if (st >= 200 && st < 400) return { verdict: 'WIRED', reason: `internal link → ${st}` };
    return { verdict: 'BROKEN', reason: `internal link → HTTP ${st}` };
  }

  // 2) no href — needs a handler
  if (e.onclickAttr) return { verdict: 'WIRED', reason: 'onclick attribute' };
  if (e.onclickProp) return { verdict: 'WIRED', reason: 'onclick property (el.onclick = fn)' };
  if (e.isSubmit) return { verdict: 'WIRED', reason: 'form submit' };
  if (e.wired) return { verdict: 'WIRED', reason: 'click/pointer listener attached' };
  if (e.tag === 'label' && e.labelTargetOk) return { verdict: 'WIRED', reason: 'label → control' };
  if (e.tag === 'label' && e.labelWraps) return { verdict: 'WIRED', reason: 'label wraps its control' };
  if (e.tag === 'summary') return { verdict: 'WIRED', reason: '<details> disclosure' };
  if (e.dataJeeves) return { verdict: 'DEAD', reason: 'data-jeeves-open but widget/handler absent' };

  // 3) looks clickable but nothing wires it
  if (looksClickable) {
    // covered by a wrapping control, or it's a container whose children are the buttons
    if (e.hasIntAncestor) return { verdict: 'INERT', reason: 'covered by a wrapping link/button' };
    if (e.hasIntDescendant) return { verdict: 'INERT', reason: 'container of nested controls' };
    if (delegation) return { verdict: 'DELEGATED?', reason: 'no direct handler; page uses event delegation — review' };
    return { verdict: 'DEAD', reason: 'clickable affordance with no link and no handler' };
  }
  return { verdict: 'INERT', reason: 'not interactive' };
}

// ---- crawl ------------------------------------------------------------------
async function main() {
  const launch = { headless: true, args: ['--no-sandbox'] };
  if (process.env.PW_EXECUTABLE_PATH) launch.executablePath = process.env.PW_EXECUTABLE_PATH;
  const browser = await chromium.launch(launch);
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: 'AiGovOps-InteractionCrawler/1' });
  if (COOKIE) {
    const host = new URL(BASE).hostname;
    const jar = COOKIE.split(';').map((c) => c.trim()).filter(Boolean).map((c) => {
      const i = c.indexOf('=');
      return { name: c.slice(0, i).trim(), value: c.slice(i + 1).trim(), domain: host, path: '/' };
    });
    await context.addCookies(jar);
    console.log(`  consent cookie(s) set for ${host}: ${jar.map((c) => c.name).join(', ')}`);
  }
  await context.addInitScript(INIT_SCRIPT);
  // Optionally keep the render on-origin (used when proving locally behind an egress
  // proxy): third-party analytics/fonts are aborted so they can't masquerade as errors.
  if (process.env.BLOCK_EXTERNAL === '1') {
    await context.route('**/*', (route) => (sameOrigin(route.request().url()) ? route.continue() : route.abort()));
  }

  const queue = [stripHash(BASE)];
  const seen = new Set(queue);
  const pages = [];
  const internalTargets = new Set();

  // seed from sitemap.xml if present
  try {
    const res = await context.request.get(new URL('/sitemap.xml', ORIGIN).href, { timeout: 10000 });
    if (res.ok()) {
      const xml = await res.text();
      for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
        const u = stripHash(m[1].trim());
        if (sameOrigin(u) && isHtmlPath(u) && !seen.has(u)) { seen.add(u); queue.push(u); }
      }
    }
  } catch { /* no sitemap — fine */ }

  const page = await context.newPage();
  while (queue.length && pages.length < MAX_PAGES) {
    const url = queue.shift();
    const consoleErrors = [];
    // Count genuine app errors, not third-party resource-load blips (link-check owns those).
    const isResourceNoise = (t) => /Failed to load resource|net::ERR|ERR_BLOCKED|Refused to (load|connect|apply)|content security policy|favicon/i.test(t);
    const onMsg = (m) => { if (m.type() === 'error' && !isResourceNoise(m.text())) consoleErrors.push(m.text().slice(0, 300)); };
    const onErr = (err) => consoleErrors.push('pageerror: ' + String(err).slice(0, 300));
    page.on('console', onMsg); page.on('pageerror', onErr);
    let status = null, loadError = null;
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      status = resp ? resp.status() : null;
      await page.waitForTimeout(1200); // let deferred scripts wire handlers
    } catch (err) { loadError = String(err).slice(0, 200); }
    let collected = { delegation: false, elements: [] };
    if (!loadError) { try { collected = await page.evaluate(COLLECT); } catch (err) { loadError = 'collect: ' + String(err).slice(0,150); } }

    // enqueue same-origin html links; remember internal targets to verify
    for (const el of collected.elements) {
      if (el.rawHref && !el.rawHref.startsWith('#') && !/^(mailto:|tel:|javascript:)/i.test(el.rawHref) && sameOrigin(el.href)) {
        const clean = stripHash(el.href);
        internalTargets.add(clean);
        if (isHtmlPath(clean) && !seen.has(clean) && pages.length + queue.length < MAX_PAGES) { seen.add(clean); queue.push(clean); }
      }
    }
    pages.push({ url, status, loadError, delegation: collected.delegation, consoleErrors, elements: collected.elements });
    page.off('console', onMsg); page.off('pageerror', onErr);
  }

  // verify internal link targets (dedup) with real requests
  const targetStatus = new Map();
  for (const t of internalTargets) {
    try { const r = await context.request.get(t, { timeout: 15000, maxRedirects: 5 }); targetStatus.set(t, r.status()); }
    catch { targetStatus.set(t, 0); }
  }

  // classify
  let ok = 0, dead = 0, broken = 0, external = 0, delegated = 0, consoleErrPages = 0;
  const deadList = [], brokenList = [];
  const pageHealth = []; // per-page red/green — the goal is green for every page
  for (const pg of pages) {
    if (pg.consoleErrors.length) consoleErrPages++;
    let pDead = 0, pBroken = 0;
    for (const el of pg.elements) {
      const c = classify(el, pg.delegation, targetStatus);
      el.verdict = c.verdict; el.reason = c.reason;
      if (c.verdict === 'WIRED' || c.verdict === 'LINK') ok++;
      else if (c.verdict === 'EXTERNAL') external++;
      else if (c.verdict === 'DELEGATED?') delegated++;
      else if (c.verdict === 'DEAD') { dead++; pDead += el.visible ? 1 : 0; if (el.visible) deadList.push({ page: pg.url, tag: el.tag, text: el.text, cls: el.cls, reason: c.reason }); }
      else if (c.verdict === 'BROKEN') { broken++; pBroken++; brokenList.push({ page: pg.url, text: el.text, href: el.href, reason: c.reason }); }
    }
    const jsErr = pg.consoleErrors.length;
    pageHealth.push({
      path: (() => { try { return new URL(pg.url).pathname; } catch { return pg.url; } })(),
      dead: pDead, broken: pBroken, jsErrors: jsErr,
      status: (pDead === 0 && pBroken === 0 && jsErr === 0 && !pg.loadError) ? 'green' : 'red',
      loadError: pg.loadError || null,
    });
  }
  pageHealth.sort((a, b) => (a.status === b.status ? a.path.localeCompare(b.path) : a.status === 'red' ? -1 : 1));

  await browser.close();

  const report = {
    site: SITE_NAME, base: BASE, generatedAt: new Date().toISOString(),
    summary: {
      pages: pages.length,
      greenPages: pageHealth.filter(p => p.status === 'green').length,
      redPages: pageHealth.filter(p => p.status === 'red').length,
      ok, dead, broken, external, delegated,
      consoleErrorPages: consoleErrPages,
      healthy: dead === 0 && broken === 0 && consoleErrPages === 0,
    },
    pageHealth,
    dead: deadList.filter(d => d.visible !== false), broken: brokenList,
    consoleErrors: pages.filter(p => p.consoleErrors.length).map(p => ({ page: p.url, errors: p.consoleErrors })),
    pages,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));

  // human summary
  console.log(`\n  Interaction crawl — ${SITE_NAME} (${BASE})`);
  console.log(`  pages ${pages.length} · wired/ok ${ok} · external ${external} · delegated? ${delegated}`);
  console.log(`  DEAD ${dead} · BROKEN ${broken} · pages with console errors ${consoleErrPages}\n`);
  for (const d of deadList.slice(0, 40)) console.log(`  ✗ DEAD   ${d.page}\n           <${d.tag}> "${d.text || d.cls}" — ${d.reason}`);
  for (const b of brokenList.slice(0, 40)) console.log(`  ✗ BROKEN ${b.page}\n           "${b.text}" → ${b.href} — ${b.reason}`);
  for (const c of report.consoleErrors.slice(0, 20)) console.log(`  ! JSERR  ${c.page}\n           ${c.errors[0]}`);
  console.log(`\n  → wrote ${OUT}`);

  const failing = broken > 0 || consoleErrPages > 0 || (FAIL_ON_DEAD && dead > 0);
  process.exit(failing ? 1 : 0);
}

main().catch((e) => { console.error('interaction-crawl fatal:', e); process.exit(2); });
