// src/core/a11y.js
// ACCESSIBILITY AUDIT (static subset) — the dependency-free backend for the
// Aperture skill `accessibility-audit`. Runs the automatable, no-browser checks
// (the same ones the library site suite enforces). It is NOT a full WCAG 2.2 AA
// audit — contrast, focus order, and screen-reader behaviour still need axe/pa11y
// and a manual pass. Honest by design: it reports the subset it can prove.

export function audit(html) {
  const h = String(html ?? '');
  const findings = [];
  const add = (type, count) => { if (count > 0) findings.push({ type, count }); };

  const imgs = h.match(/<img\b[^>]*>/gi) || [];
  const noAlt = imgs.filter((t) => { const m = t.match(/alt\s*=\s*"([^"]*)"/i); return !m || m[1].trim() === ''; }).length;
  add('img-missing-alt', noAlt);

  add('missing-lang', /<html\b[^>]*\blang=/i.test(h) ? 0 : 1);
  add('missing-title', /<title>\s*\S[\s\S]*?<\/title>/i.test(h) ? 0 : 1);
  add('missing-viewport', /name=["']viewport["']/i.test(h) ? 0 : 1);

  const h1 = (h.match(/<h1\b/gi) || []).length;
  add('no-h1', h1 === 0 ? 1 : 0);
  add('multiple-h1', h1 > 1 ? h1 - 1 : 0);

  add('empty-link', (h.match(/<a\b[^>]*>\s*<\/a>/gi) || []).length);

  const total = findings.reduce((s, f) => s + f.count, 0);
  const score = Math.max(0, 100 - total * 10);
  return { pass: total === 0, score, findings, standard: 'WCAG2.2-AA-subset' };
}
