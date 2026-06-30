/* start-here.js — estate-wide "Start here" launcher.
 * Drop into any property with one line:
 *   <script src="https://.../start-here.js" data-estate-id="beacon" defer></script>
 * Renders a dismissible "▶ Start here" badge that opens the persona-narrated onboarding
 * tour in an overlay, deep-linked to this property's chapter (via data-estate-id) and
 * auto-playing. Dependency-free; self-contained; matches the AiGovOps teal/green look.
 *
 * data-estate-id : library | foundation | community | ncw | beacon | umbrella |
 *                  lantern | vendor-rfi | v4 | (any chapter slug). Default: tour start.
 * data-tour      : override the tour URL (default: the Library onboarding page).
 * data-position  : "left" (default) or "right".
 */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var TOUR = s.getAttribute('data-tour') ||
    'https://aigovops-foundation.github.io/aigovops-library-june-ken-bob/onboarding.html';
  var ID = (s.getAttribute('data-estate-id') || '').trim();
  var POS = (s.getAttribute('data-position') || 'left').trim();
  var KEY = 'aigov-start-here-dismissed';

  function tourUrl() {
    var u = TOUR + (TOUR.indexOf('?') < 0 ? '?' : '&') + 'play=1';
    if (ID) u += '&start=' + encodeURIComponent(ID);
    return u;
  }

  function el(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }

  function openTour() {
    // A CONTAINED corner panel — never a full-screen takeover. Bottom-right, capped, with margins
    // on small screens, matching Jeeves's corner-chat footprint.
    var ov = el('div', 'position:fixed;right:16px;bottom:16px;z-index:2147483646;' +
      'width:min(440px,calc(100vw - 24px));height:min(620px,calc(100vh - 32px));' +
      'background:#03100f;border:1px solid rgba(120,200,190,.25);border-radius:16px;box-shadow:0 14px 50px rgba(0,0,0,.5);' +
      'display:flex;flex-direction:column;padding:12px;box-sizing:border-box');
    var bar = el('div', 'display:flex;align-items:center;gap:10px;margin-bottom:12px;color:#cdeee4;' +
      "font:600 13px/1 'DM Mono',ui-monospace,monospace;letter-spacing:.04em");
    bar.appendChild(el('span', 'color:#6fe6a3', '▶ AiGovOps — Start here'));
    var close = el('button', 'margin-left:auto;cursor:pointer;background:rgba(255,255,255,.06);' +
      'border:1px solid rgba(120,200,190,.3);color:#e7f3f1;border-radius:8px;padding:7px 13px;font:inherit', 'Close ✕');
    bar.appendChild(close);
    var frame = el('iframe', 'flex:1;width:100%;border:0;border-radius:14px;background:#03100f;' +
      'box-shadow:0 10px 40px rgba(0,0,0,.5)');
    frame.setAttribute('title', 'AiGovOps guided onboarding');
    frame.setAttribute('allow', 'autoplay');
    frame.src = tourUrl();
    ov.appendChild(bar); ov.appendChild(frame);
    function shut() { ov.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') shut(); }
    close.addEventListener('click', shut);
    ov.addEventListener('click', function (e) { if (e.target === ov) shut(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
  }

  function mount() {
    if (localStorage.getItem(KEY) === '1') return;
    var side = POS === 'right' ? 'right:18px' : 'left:18px';
    var wrap = el('div', 'position:fixed;bottom:18px;' + side + ';z-index:2147483645;' +
      'display:flex;align-items:center;gap:6px');
    var btn = el('button', 'cursor:pointer;display:inline-flex;align-items:center;gap:8px;' +
      'background:#2ecc71;color:#04181a;border:0;border-radius:999px;padding:11px 16px;' +
      "font:600 14px/1 'DM Mono',ui-monospace,system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.35)",
      '▶ Start here');
    btn.setAttribute('aria-label', 'Start the AiGovOps guided tour');
    var x = el('button', 'cursor:pointer;background:rgba(2,12,11,.55);color:#cdeee4;border:1px solid rgba(120,200,190,.3);' +
      'border-radius:50%;width:24px;height:24px;font:700 12px/1 system-ui;padding:0', '✕');
    x.setAttribute('aria-label', 'Dismiss');
    btn.addEventListener('click', openTour);
    x.addEventListener('click', function () { localStorage.setItem(KEY, '1'); wrap.remove(); });
    wrap.appendChild(btn); wrap.appendChild(x);
    document.body.appendChild(wrap);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
