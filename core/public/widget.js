// public/widget.js — embeddable "Ask the Library" widget (Phase 4 channel).
// Drop onto any page:  <script src="https://<host>/widget.js"></script>
// Calls the host's public /api/ask (read-only, rate-limited, returns a signed,
// metadata-only receipt). Dependency-free, no build step.
// (Cross-origin embedding needs the page's origin in the core's ALLOWED_ORIGINS.)
(function () {
  var s = document.currentScript;
  var base = (s && s.dataset && s.dataset.aigov) || (s && new URL(s.src).origin) || '';
  var css = '\
.aigovw-btn{position:fixed;right:18px;bottom:18px;z-index:99999;background:#2ecc71;color:#06241a;font:600 14px system-ui;border:none;border-radius:99px;padding:12px 16px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25)}\
.aigovw-panel{position:fixed;right:18px;bottom:70px;z-index:99999;width:320px;max-width:92vw;background:#04181a;color:#e7f3f1;border:1px solid rgba(120,200,190,.3);border-radius:14px;padding:14px;font:14px system-ui;display:none}\
.aigovw-panel h4{margin:0 0 8px;font:600 14px system-ui;color:#fff}\
.aigovw-panel input{width:100%;background:rgba(0,0,0,.3);border:1px solid rgba(120,200,190,.3);border-radius:8px;color:#fff;font:inherit;padding:9px;outline:none}\
.aigovw-panel button{margin-top:8px;background:#2ecc71;color:#06241a;font-weight:700;border:none;border-radius:8px;padding:8px 12px;cursor:pointer}\
.aigovw-ans{margin-top:10px;font-size:13.5px;line-height:1.5;white-space:pre-wrap}\
.aigovw-sig{margin-top:8px;font:11px ui-monospace,monospace;color:#6fe6a3}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var btn = document.createElement('button'); btn.className = 'aigovw-btn'; btn.textContent = '☁ Ask the Library';
  var panel = document.createElement('div'); panel.className = 'aigovw-panel';
  panel.innerHTML = '<h4>AiGovOps Library — front desk</h4>' +
    '<input class="aigovw-q" placeholder="Ask about AI governance…" value="What applies to an AI hiring tool?"/>' +
    '<button class="aigovw-go">Ask &amp; sign</button><div class="aigovw-ans"></div><div class="aigovw-sig"></div>';
  document.body.appendChild(btn); document.body.appendChild(panel);
  btn.onclick = function () { panel.style.display = panel.style.display === 'block' ? 'none' : 'block'; };
  var q = panel.querySelector('.aigovw-q'), go = panel.querySelector('.aigovw-go');
  var ans = panel.querySelector('.aigovw-ans'), sig = panel.querySelector('.aigovw-sig');
  go.onclick = function () {
    ans.textContent = 'thinking…'; sig.textContent = '';
    fetch(base + '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: q.value }) })
      .then(function (r) { return r.json(); })
      .then(function (d) { ans.textContent = d.answer || d.error || '(no answer)'; if (d.signed) sig.textContent = 'signed ✓ kid ' + d.signed.kid + ' · ' + (d.signed.ts || ''); })
      .catch(function (e) { ans.textContent = 'error: ' + e.message; });
  };
})();
