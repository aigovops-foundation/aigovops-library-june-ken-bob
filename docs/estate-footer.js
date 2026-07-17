/* estate-footer.js — the shared AiGovOps ESTATE FOOTER, single-source injector.
 * Drop into any Library docs page with one line:
 *   <script src="estate-footer.js" defer></script>
 *
 * Renders ONE <footer role="contentinfo" class="aig-estate-footer"> carrying the
 * canonical cross-estate link set (identical labels + order on every property),
 * themed to whatever page palette is present (reuses the page's CSS vars, with
 * accessible fallbacks). Dependency-free, self-contained, idempotent.
 *
 * Governance: this is presentation only — no secrets, no payloads, no network.
 *
 * Accessibility contract (must hold — the repo gate + estate spec both assert it):
 *   • exactly ONE contentinfo/footer per page (we REPLACE any existing minimal
 *     footer in place, keeping its tagline/creed as the brand line);
 *   • each link column is its own <nav aria-label="…">;
 *   • column titles are styled <span> (class aig-ef-h), NEVER heading elements,
 *     so page h1→h2 order is untouched;
 *   • all text ≥ 4.5:1 on the footer background; tap targets ≥ 24px; visible focus;
 *   • on THIS site (Library) the Library estate link carries aria-current="page".
 */
(function () {
  // Idempotency: never inject twice, never add a second contentinfo.
  if (document.querySelector('footer.aig-estate-footer')) return;

  // Which estate property is this? Used to mark aria-current on that link.
  var CURRENT = 'library';

  // Group A — "Explore the estate" (same-tab; stay within the estate).
  var GROUP_A = [
    { id: 'foundation', label: 'Foundation',         href: 'https://www.aigovops-foundation.com' },
    { id: 'community',  label: 'Community platform',  href: 'https://community.aigovops-foundation.com' },
    { id: 'library',    label: 'Library',             href: 'https://aigovops-foundation.github.io/aigovops-library-june-ken-bob/' },
    { id: 'beacon',     label: 'Beacon',              href: 'https://aigovops-foundation.github.io/aigovops-beacon/' },
    { id: 'umbrella',   label: 'Umbrella',            href: 'https://aigovops-foundation.github.io/umbrella-govops/' },
    { id: 'ncw',        label: 'NCW AI Camp',         href: 'https://aigovops-foundation.github.io/aigovops-ncw-ai-camp/' }
  ];

  // Group B — "Connect" (new-tab: these leave the estate).
  var GROUP_B = [
    { label: 'Newsletter', href: 'https://aigovops.substack.com/' },
    { label: 'Events',     href: 'https://luma.com/aigovops' },
    { label: 'GitHub',     href: 'https://github.com/aigovops-foundation' },
    { label: 'LinkedIn',   href: 'https://www.linkedin.com/company/aigovops-foundation' }
  ];

  var LEGAL = '© 2026 AiGovOps Foundation — a 501(c)(3) nonprofit. Governance versioned like code.';
  // The estate creed — ONE sentence, identical on every property. Edit here only.
  var ESTATE_CREED = 'Ship safe AI — never unsafe AI: get to yes, stay at yes, recover to yes, and keep the garden of humanity growing.';
  var DEFAULT_TAGLINE = 'One governed library, run by agents, held by humans, warm in every language.';
  var DEFAULT_CREED = 'AGENTS DO THE BUREAUCRACY · HUMANS HOLD THE MEANING';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // One scoped stylesheet. Reuses page palette vars where present; the fallbacks
  // are chosen to clear 4.5:1 on both the hub (teal/near-black) and deep-doc
  // (navy) backgrounds. Text/link colors never depend on ambient page bg.
  function injectStyle() {
    if (document.getElementById('aig-estate-footer-css')) return;
    var css =
      '.aig-estate-footer{margin:64px 0 0;padding:34px 22px 40px;text-align:left;' +
        'border-top:1px solid var(--line,rgba(120,180,180,.22));' +
        'background:var(--card,rgba(255,255,255,.02));' +
        'color:var(--ink2,#9fc0bd);' +
        "font-family:'Inter',system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.5}" +
      '.aig-estate-footer .aig-ef-inner{max-width:1000px;margin:0 auto}' +
      '.aig-estate-footer .aig-ef-brand{margin-bottom:26px}' +
      '.aig-estate-footer .aig-ef-estate{font-family:Fraunces,Georgia,serif;font-style:italic;' +
        'font-size:16.5px;line-height:1.5;color:var(--ink,#e7f3f1);max-width:640px;margin-bottom:10px}' +
      '.aig-estate-footer .aig-ef-tagline{font-size:16px;color:var(--ink,#e7f3f1);max-width:640px}' +
      '.aig-estate-footer .aig-ef-creed{margin-top:8px;font-family:"DM Mono",ui-monospace,monospace;' +
        'letter-spacing:.14em;font-size:10.5px;color:var(--green2,var(--green,#6fe6a3))}' +
      '.aig-estate-footer .aig-ef-brand .tagline,.aig-estate-footer .aig-ef-brand .fcreed{margin:4px 0}' +
      '.aig-estate-footer .aig-ef-cols{display:flex;flex-wrap:wrap;gap:34px 56px}' +
      '.aig-estate-footer .aig-ef-col{display:flex;flex-direction:column;min-width:150px}' +
      '.aig-estate-footer .aig-ef-h{font-family:"DM Mono",ui-monospace,monospace;text-transform:uppercase;' +
        'letter-spacing:.16em;font-size:10.5px;color:var(--ink2,#9fc0bd);margin-bottom:10px;font-weight:600}' +
      '.aig-estate-footer .aig-ef-col a{display:inline-flex;align-items:center;min-height:24px;padding:5px 0;' +
        'text-decoration:none;color:var(--green2,var(--green,#6fe6a3));font-size:14px}' +
      '.aig-estate-footer .aig-ef-col a:hover{text-decoration:underline}' +
      '.aig-estate-footer .aig-ef-col a[aria-current="page"]{color:var(--ink,#e7f3f1);font-weight:600}' +
      '.aig-estate-footer .aig-ef-legal{margin-top:28px;padding-top:18px;font-size:12.5px;' +
        'color:var(--ink2,#9fc0bd);border-top:1px solid var(--line,rgba(120,180,180,.18))}' +
      '.aig-estate-footer a:focus-visible{outline:2px solid currentColor;outline-offset:2px;border-radius:2px}' +
      '@media(max-width:560px){.aig-estate-footer .aig-ef-cols{gap:24px 28px}}';
    var st = document.createElement('style');
    st.id = 'aig-estate-footer-css';
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  function colHtml(label, ariaLabel, items, group) {
    var links = items.map(function (it) {
      var current = (group === 'A' && it.id === CURRENT);
      var attrs = 'href="' + esc(it.href) + '"';
      if (group === 'B') attrs += ' target="_blank" rel="noopener"';
      if (current) attrs += ' aria-current="page"';
      return '<a ' + attrs + '>' + esc(it.label) + '</a>';
    }).join('');
    return '<nav class="aig-ef-col" aria-label="' + esc(ariaLabel) + '">' +
      '<span class="aig-ef-h">' + esc(label) + '</span>' + links + '</nav>';
  }

  function build() {
    if (document.querySelector('footer.aig-estate-footer')) return;

    var existing = document.querySelector('footer');
    var brandInner;
    if (existing) {
      // Keep the page's existing tagline/creed markup verbatim as the brand line.
      brandInner = existing.innerHTML;
    } else {
      brandInner = '<div class="aig-ef-tagline">' + esc(DEFAULT_TAGLINE) + '</div>' +
        '<div class="aig-ef-creed">' + esc(DEFAULT_CREED) + '</div>';
    }
    // The estate creed leads the brand block on every property, above any
    // page-local tagline — the one sentence a visitor meets everywhere.
    brandInner = '<div class="aig-ef-estate">' + esc(ESTATE_CREED) + '</div>' + brandInner;

    var html =
      '<div class="aig-ef-inner">' +
        '<div class="aig-ef-brand">' + brandInner + '</div>' +
        '<div class="aig-ef-cols">' +
          colHtml('Explore the estate', 'Explore the estate', GROUP_A, 'A') +
          colHtml('Connect', 'Connect', GROUP_B, 'B') +
        '</div>' +
        '<div class="aig-ef-legal">' + esc(LEGAL) + '</div>' +
      '</div>';

    var footer = document.createElement('footer');
    footer.setAttribute('role', 'contentinfo');
    footer.className = 'aig-estate-footer';
    footer.innerHTML = html;

    injectStyle();

    if (existing) {
      existing.replaceWith(footer);           // one footer in, one out
    } else {
      var host = document.querySelector('main') || document.querySelector('.wrap') || document.body;
      host.appendChild(footer);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
