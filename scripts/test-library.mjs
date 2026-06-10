#!/usr/bin/env node
// scripts/test-library.mjs
// Read-only test suite for the AiGovOps Library site. Two modes:
//
//   node scripts/test-library.mjs                 # HTTP mode: test the deployed site
//   node scripts/test-library.mjs --base <url>    # HTTP mode against a custom origin
//   node scripts/test-library.mjs --dir docs      # DIR mode: test local files pre-deploy
//
// DIR mode is fast and offline — ideal as a push-time CI gate on docs/ before the
// Pages deploy. HTTP mode adds transport/SSL/external checks for scheduled drift runs.
//
// Dependency-free (Node 18+: global fetch, node:fs, node:tls).
// Exit 0 if no FAILs (WARNs allowed), 1 otherwise. See README / LIBRARY-TESTS.md.

import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";

// ── Config ──────────────────────────────────────────────────────────────────
const arg = (flag) => { const i = process.argv.indexOf(flag); return i !== -1 ? process.argv[i + 1] : null; };
const DIR = arg("--dir");
const MODE = DIR ? "dir" : "http";
const BASE = (arg("--base") || "https://aigovops-foundation.github.io/aigovops-library-june-ken-bob").replace(/\/$/, "");
const ORIGIN = new URL(BASE).origin;

const ARC_PAGES = ["blueprint", "control-plane", "demo", "design-book", "plan", "pulse"];
const BRAND = "AiGovOps";
const MAX_PAGE_BYTES = 500 * 1024;
const MAX_RESPONSE_MS = 3000;
const SSL_MIN_DAYS = 21;
const REQ_TIMEOUT_MS = 15000;

// Per-page content expectations (stable substrings; case-insensitive). FAIL on miss.
const PAGE_EXPECTATIONS = {
  "index.html":         { h1: ["library", "yes"],            body: ["six pieces", "running core"] },
  "demo.html":          { h1: ["engine"],                    body: ["yes-gate", "receipt"] },
  "design-book.html":   { h1: ["design book"],               body: ["design"] },
  "blueprint.html":     { h1: ["architecture blueprint"],    body: ["yes-gate"] },
  "control-plane.html": { h1: ["control plane"],             body: ["secrets", "sandbox"] },
  "plan.html":          { h1: ["agents", "humans"],          body: ["process"] },
  "pulse.html":         { h1: ["system pulse"],              body: ["receipt", "deploy"] },
  "build-tickets.html": { h1: ["build tickets"],             body: ["ticket 0"] },
};

// ── Result collection ─────────────────────────────────────────────────────────
let pass = 0, warn = 0, fail = 0, skip = 0;
const failures = [], warnings = [];
const C = { green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", dim: "\x1b[2m", reset: "\x1b[0m" };
const ok = (l) => { pass++; console.log(`  ${C.green}✅${C.reset} ${l}`); };
const warnC = (l, d) => { warn++; warnings.push(l); console.log(`  ${C.yellow}⚠️ ${C.reset} ${l}${d ? ` ${C.dim}— ${d}${C.reset}` : ""}`); };
const failC = (l, d) => { fail++; failures.push(l); console.log(`  ${C.red}❌${C.reset} ${l}${d ? ` ${C.dim}— ${d}${C.reset}` : ""}`); };
const skipC = (l) => { skip++; console.log(`  ${C.dim}⊘ ${l} (skipped — ${MODE} mode)${C.reset}`); };
function assert(cond, label, detail = "", sev = "fail") { return cond ? ok(label) : (sev === "warn" ? warnC(label, detail) : failC(label, detail)); }
const section = (t) => console.log(`\n  ${C.dim}→ ${t}${C.reset}`);

// ── HTML extractors (regex — fine for these static pages) ──────────────────────
const attr = (tag, n) => { const m = tag.match(new RegExp(`${n}\\s*=\\s*"([^"]*)"`, "i")); return m ? m[1] : null; };
const allTags = (h, t) => h.match(new RegExp(`<${t}\\b[^>]*>`, "gi")) || [];
const hrefs = (h) => [...h.replace(/<script[\s\S]*?<\/script>/gi,"").matchAll(/href\s*=\s*"([^"]+)"/gi)].map(m => m[1]);
const srcs  = (h) => [...h.replace(/<script[\s\S]*?<\/script>/gi,"").matchAll(/(?:src|href)\s*=\s*"([^"]+\.(?:css|js|png|jpe?g|svg|gif|webp|ico)(?:\?[^"]*)?)"/gi)].map(m => m[1]);
const idsOf = (h) => new Set([...h.matchAll(/\b(?:id|name)\s*=\s*"([^"]+)"/gi)].map(m => m[1]));
const titleOf = (h) => { const m = h.match(/<title>([\s\S]*?)<\/title>/i); return m ? m[1].trim() : ""; };
const metaDesc = (h) => { const m = h.match(/<meta\s+name="description"\s+content="([^"]*)"/i); return m ? m[1].trim() : ""; };
const hasOG = (h, p) => new RegExp(`<meta\\s+property="og:${p}"\\s+content="[^"]+"`, "i").test(h);
const h1Text = (h) => { const m = h.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i); return m ? m[1].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").trim() : ""; };
const isExternal = (u) => /^https?:\/\//i.test(u) && !u.startsWith(ORIGIN);
const isHttp = (u) => /^https?:\/\//i.test(u);
const baseName = (key) => { const m = key.match(/([^/]+\.html)$/); return m ? m[1] : "index.html"; };

// HTTP helpers
async function httpFetch(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS); const start = Date.now();
  try { const r = await fetch(url, { redirect: "follow", signal: ctrl.signal }); const body = await r.text();
    return { status: r.status, body, ms: Date.now() - start, bytes: Buffer.byteLength(body), url: r.url, ok: r.ok };
  } catch (e) { return { status: 0, body: "", ms: Date.now() - start, bytes: 0, url, ok: false, error: e.message }; }
  finally { clearTimeout(t); }
}
async function httpStatus(url, method = "GET") {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);
  try { return (await fetch(url, { method, redirect: "manual", signal: ctrl.signal })).status; } catch { return 0; } finally { clearTimeout(t); }
}
async function reachable(url) { let s = await httpStatus(url, "HEAD"); if (s === 0 || s === 405 || s === 501) s = await httpStatus(url, "GET"); return s; }
const resolveHttp = (base, href) => { try { return new URL(href, base).href; } catch { return null; } }
const keyHttp = (u) => u.split("#")[0].replace(/\/$/, "").replace(/\/index\.html$/, "");

// DIR helpers (flat site: all pages in one folder)
const localName = (href, current = "index.html") => { if ((href || "").startsWith("#")) return current; const p = (href || "").split("#")[0].split("?")[0]; if (!p || p === "/" || p === "./") return "index.html"; const b = p.replace(/^\.\//, "").replace(/^.*\//, ""); return b || "index.html"; };
const fragOf = (href) => href.includes("#") ? href.split("#")[1] : null;

function sslDaysLeft(host) {
  return new Promise((res) => {
    const s = tls.connect({ host, port: 443, servername: host, timeout: REQ_TIMEOUT_MS }, () => {
      const c = s.getPeerCertificate(); s.end();
      if (!c || !c.valid_to) return res(null);
      res({ days: Math.floor((new Date(c.valid_to) - new Date()) / 86400000), validTo: c.valid_to });
    });
    s.on("error", () => res(null)); s.on("timeout", () => { s.destroy(); res(null); });
  });
}

// ── Load pages (mode-specific) ─────────────────────────────────────────────────
async function loadPages() {
  const pages = new Map();           // key -> {key, html, bytes, ms, status, ok}
  const homeLinks = new Set();       // keys linked from the homepage
  let homeKey;

  if (MODE === "dir") {
    const root = path.resolve(DIR);
    if (!fs.existsSync(root)) { console.error(`  ${C.red}Runner error:${C.reset} dir not found: ${root}`); process.exit(1); }
    homeKey = "index.html";
    for (const f of fs.readdirSync(root).filter(f => f.endsWith(".html"))) {
      const html = fs.readFileSync(path.join(root, f), "utf8");
      pages.set(f, { key: f, html, bytes: Buffer.byteLength(html), ms: 0, status: 200, ok: true });
    }
    const home = pages.get(homeKey);
    if (home) hrefs(home.html).filter(h => !isHttp(h) && !h.startsWith("#")).forEach(h => homeLinks.add(localName(h, homeKey)));
    return { pages, homeLinks, homeKey };
  }

  // HTTP: BFS crawl from the homepage over internal .html links.
  homeKey = keyHttp(BASE + "/");
  const homeUrl = BASE + "/";
  const queue = [homeUrl], seen = new Set([homeKey]);
  while (queue.length) {
    const url = queue.shift(); const res = await httpFetch(url);
    pages.set(keyHttp(url), { key: keyHttp(url), html: res.body, bytes: res.bytes, ms: res.ms, status: res.status, ok: res.ok, url: res.url });
    if (!res.ok) continue;
    const internal = hrefs(res.body).map(h => resolveHttp(url, h)).filter(u => u && u.startsWith(ORIGIN))
      .filter(u => /\.html(\?|#|$)/.test(u) || keyHttp(u) === homeKey);
    if (keyHttp(url) === homeKey) internal.forEach(u => homeLinks.add(keyHttp(u)));
    for (const u of internal) { const k = keyHttp(u); if (!seen.has(k)) { seen.add(k); queue.push(u.split("#")[0]); } }
  }
  return { pages, homeLinks, homeKey };
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📚 Cloud-Mary — AiGovOps Library full suite  ${C.dim}[${MODE} mode]${C.reset}`);
  console.log(`   ${MODE === "dir" ? path.resolve(DIR) : BASE}\n`);

  const { pages, homeLinks, homeKey } = await loadPages();
  console.log(`  ${C.dim}Loaded ${pages.size} page(s)${MODE === "http" ? " by crawling from homepage" : ` from ${DIR}/`}.${C.reset}`);
  const rel = (k) => MODE === "dir" ? k : (k.replace(ORIGIN, "") || "/");

  // ── 1. Availability & transport ──────────────────────────────────────────
  section("1. Availability & transport");
  for (const p of ["", ...ARC_PAGES.map(p => p + ".html")]) {
    if (MODE === "dir") {
      const name = p === "" ? "index.html" : p;
      assert(pages.has(name), `File exists: ${name}`, "not found in dir");
    } else {
      const k = keyHttp(BASE + "/" + p);
      const rec = pages.get(k) || { status: (await httpFetch(BASE + "/" + p)).status };
      assert(rec.status === 200, `GET /${p} → 200`, `got ${rec.status}`);
    }
  }
  if (MODE === "http") {
    assert([301, 308].includes(await httpStatus(BASE.replace("https://", "http://") + "/", "GET")), "HTTP → HTTPS redirect (30x)");
    assert(await httpStatus(BASE + "/__missing__.html", "GET") === 404, "Unknown path → 404");
    const ssl = await sslDaysLeft(new URL(BASE).host);
    if (!ssl) warnC("SSL certificate check", "could not read cert");
    else assert(ssl.days >= SSL_MIN_DAYS, `SSL valid ≥ ${SSL_MIN_DAYS}d (${ssl.days}d left, exp ${ssl.validTo})`, `only ${ssl.days}d`, "warn");
  } else { skipC("HTTP→HTTPS redirect, 404 handling, SSL"); }

  // ── 2. Link integrity ────────────────────────────────────────────────────
  section("2. Link integrity");
  let broken = 0, brokenAnchor = 0; const checked = new Set(); const external = new Set();
  for (const [, pg] of pages) {
    if (!pg.ok) continue;
    for (const h of hrefs(pg.html)) {
      if (h.startsWith("mailto:") || h.startsWith("tel:")) continue;
      if (isHttp(h) && (MODE === "dir" || isExternal(h))) { external.add(h); continue; }
      // internal
      const targetKey = MODE === "dir" ? localName(h, pg.key) : keyHttp(resolveHttp(pg.url || pg.key, h) || "");
      const frag = fragOf(h);
      if (!checked.has(targetKey)) {
        checked.add(targetKey);
        const exists = MODE === "dir" ? pages.has(targetKey) : (pages.has(targetKey) ? pages.get(targetKey).status === 200 : await reachable(targetKey) === 200);
        if (!exists) { broken++; failC(`Internal link resolves: ${MODE === "dir" ? targetKey : targetKey.replace(ORIGIN, "")}`, `from ${rel(pg.key)}`); }
      }
      if (frag) { const tgt = pages.get(targetKey); if (tgt && tgt.ok && !idsOf(tgt.html).has(frag)) { brokenAnchor++; failC(`Anchor #${frag} exists on ${MODE === "dir" ? targetKey : targetKey.replace(ORIGIN, "")}`, `from ${rel(pg.key)}`); } }
    }
  }
  if (!broken) ok(`All internal links resolve (${checked.size} unique targets)`);
  if (!brokenAnchor) ok(`All in-page anchor targets exist`);
  for (const k of pages.keys()) { if (k === homeKey) continue; assert(homeLinks.has(k), `Page linked from homepage: ${rel(k)}`, "orphaned — not in homepage nav", "warn"); }
  if (MODE === "dir") { if (external.size) skipC(`${external.size} external link(s)`); }
  else for (const u of external) { const s = await reachable(u); assert(s >= 200 && s < 400, `External link OK: ${u.slice(0, 70)}`, `got ${s}`, "warn"); }

  // ── 3. Asset integrity ────────────────────────────────────────────────────
  section("3. Asset integrity");
  const assetSeen = new Set(); let assetN = 0, mixed = 0, extAssets = 0;
  for (const [, pg] of pages) {
    if (!pg.ok) continue;
    for (const s of srcs(pg.html)) {
      if (s.startsWith("http://")) { mixed++; failC("No mixed content", `${s} on ${rel(pg.key)}`); }
      if (isExternal(s) || (MODE === "dir" && isHttp(s))) { extAssets++; continue; }
      const name = MODE === "dir" ? localName(s) : (resolveHttp(pg.url || pg.key, s) || s);
      if (assetSeen.has(name)) continue; assetSeen.add(name); assetN++;
      const exists = MODE === "dir" ? fs.existsSync(path.join(path.resolve(DIR), name)) : await reachable(name) === 200;
      assert(exists, `Asset present: ${MODE === "dir" ? name : name.slice(0, 70)}`, "missing");
    }
  }
  if (!assetN) ok("No local file assets referenced (inline styles/scripts)");
  if (!mixed) ok("No mixed (http://) content");
  if (extAssets) skipC(`${extAssets} external/CDN asset(s)`);

  // ── 4. HTML structure ─────────────────────────────────────────────────────
  section("4. HTML structure");
  for (const [k, pg] of pages) {
    if (!pg.ok) continue; const h = pg.html, r = rel(k);
    assert(/<!DOCTYPE html>/i.test(h), `${r}: <!DOCTYPE html>`);
    assert(/<html[^>]*\blang=/i.test(h), `${r}: <html lang>`);
    assert(/charset/i.test(h), `${r}: charset`);
    assert(/name="viewport"/i.test(h), `${r}: viewport`);
    assert(titleOf(h).length > 0, `${r}: non-empty <title>`);
    const n = allTags(h, "h1").length; assert(n === 1, `${r}: exactly one <h1>`, `found ${n}`);
  }

  // ── 5. SEO & social (WARN) ────────────────────────────────────────────────
  section("5. SEO & social");
  for (const [k, pg] of pages) {
    if (!pg.ok) continue; const h = pg.html, r = rel(k); const d = metaDesc(h), t = titleOf(h);
    assert(d.length > 0, `${r}: meta description present`, "missing/empty", "warn");
    if (d) assert(d.length <= 160, `${r}: meta description ≤160 (${d.length})`, `${d.length} chars`, "warn");
    assert(t.length >= 10 && t.length <= 70, `${r}: title length 10–70 (${t.length})`, `"${t}"`, "warn");
    assert(hasOG(h, "title") && hasOG(h, "description"), `${r}: Open Graph title+description`, "missing og: tags", "warn");
  }

  // ── 6. Accessibility ──────────────────────────────────────────────────────
  section("6. Accessibility");
  for (const [k, pg] of pages) {
    if (!pg.ok) continue; const imgs = allTags(pg.html, "img");
    const noAlt = imgs.filter(t => { const a = attr(t, "alt"); return a === null || a.trim() === ""; });
    assert(noAlt.length === 0, `${rel(k)}: all <img> have alt (${imgs.length})`, `${noAlt.length} missing`);
  }

  // ── 7. Content invariants ─────────────────────────────────────────────────
  section("7. Content invariants");
  for (const [k, pg] of pages) { if (pg.ok) assert(pg.html.includes(BRAND), `${rel(k)}: brand "${BRAND}" present`); }
  for (const [k, pg] of pages) {
    if (k === homeKey || !pg.ok) continue;
    const back = hrefs(pg.html).some(h => !h.startsWith("#") && (MODE === "dir" ? localName(h, pg.key) : keyHttp(resolveHttp(pg.url || pg.key, h) || "")) === homeKey);
    assert(back, `${rel(k)}: links back to library index`);
  }
  for (const p of ARC_PAGES) { const key = MODE === "dir" ? p + ".html" : keyHttp(BASE + "/" + p + ".html"); assert(homeLinks.has(key), `Homepage links to /${p}.html`); }

  // ── 8. Per-page content expectations ──────────────────────────────────────
  section("8. Page content expectations");
  for (const [k, pg] of pages) {
    if (!pg.ok) continue; const exp = PAGE_EXPECTATIONS[baseName(k)]; if (!exp) continue;
    const r = rel(k), h1 = h1Text(pg.html).toLowerCase(), body = pg.html.toLowerCase();
    for (const tok of exp.h1) assert(h1.includes(tok.toLowerCase()), `${r}: <h1> mentions "${tok}"`, `h1="${h1Text(pg.html)}"`);
    for (const tok of exp.body) assert(body.includes(tok.toLowerCase()), `${r}: contains "${tok}"`);
  }

  // ── 9. Hygiene / perf (WARN) ──────────────────────────────────────────────
  section("9. Hygiene & performance");
  for (const [k, pg] of pages) {
    if (!pg.ok) continue;
    assert(pg.bytes <= MAX_PAGE_BYTES, `${rel(k)}: size ≤ ${(MAX_PAGE_BYTES / 1024) | 0}KB (${(pg.bytes / 1024).toFixed(1)}KB)`, "", "warn");
    if (MODE === "http") assert(pg.ms <= MAX_RESPONSE_MS, `${rel(k)}: response ≤ ${MAX_RESPONSE_MS}ms (${pg.ms}ms)`, "", "warn");
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n  ${C.dim}────────────────────────────────────────${C.reset}`);
  console.log(`  ${C.green}${pass} passed${C.reset}, ${C.yellow}${warn} warnings${C.reset}, ${C.red}${fail} failed${C.reset}${skip ? `, ${C.dim}${skip} skipped${C.reset}` : ""}  (${pass + warn + fail} checks)`);
  if (fail) console.log(`\n  ${C.red}Failures:${C.reset}\n${failures.map(f => `   • ${f}`).join("\n")}`);
  if (warn) console.log(`\n  ${C.yellow}Warnings:${C.reset}\n${warnings.map(w => `   • ${w}`).join("\n")}`);
  console.log(`\n  ${fail ? C.red + "❌ FAIL" : C.green + "✅ PASS"}${C.reset} (WARNs are non-blocking)\n`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error(`\n  ${C.red}Runner error:${C.reset}`, e); process.exit(1); });
