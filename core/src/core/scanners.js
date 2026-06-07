// src/core/scanners.js
// SECRET / PII SCANNERS — the executable backend for the Guardian skill
// `security-privacy-review`. Dependency-free. Returns METADATA ONLY (finding
// types + counts), NEVER the matched value — so a review receipt stays
// metadata-only, like every Beacon receipt.

const SECRET_PATTERNS = [
  { type: 'private-key-pem', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g },
  { type: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { type: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { type: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { type: '1password-sa-token', re: /\bops_[A-Za-z0-9_-]{24,}\b/g },
  { type: 'generic-secret-assignment', re: /\b(?:api[_-]?key|secret|token|passwd|password)\b\s*[:=]\s*['"]?[A-Za-z0-9_\-./+]{16,}['"]?/gi },
];

const PII_PATTERNS = [
  { type: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { type: 'us-ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: 'phone', re: /\b(?:\+?1[-.\s])?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g },
  { type: 'credit-card', re: /\b(?:\d{4}[- ]){3}\d{4}\b/g },
];

function scanWith(patterns, text) {
  const out = [];
  for (const { type, re } of patterns) {
    const m = text.match(re);
    if (m) out.push({ type, count: m.length }); // count only — never the matched string
  }
  return out;
}

export function scanSecrets(text) { return scanWith(SECRET_PATTERNS, String(text ?? '')); }
export function scanPII(text) { return scanWith(PII_PATTERNS, String(text ?? '')); }

// Conservative high-entropy heuristic for unlabelled credential blobs.
function shannon(s) {
  const f = Object.create(null);
  for (const c of s) f[c] = (f[c] || 0) + 1;
  let h = 0;
  for (const k in f) { const p = f[k] / s.length; h -= p * Math.log2(p); }
  return h;
}
export function scanEntropy(text, { minLen = 40, minBits = 4.2 } = {}) {
  const out = [];
  const tokens = String(text ?? '').match(new RegExp(`[A-Za-z0-9+/_-]{${minLen},}`, 'g')) || [];
  for (const tok of tokens) {
    if (shannon(tok) >= minBits) out.push({ type: 'high-entropy-string', len: tok.length });
  }
  return out;
}

// The mandatory secret + PII gate. clean === safe to expose (before the human's
// own approval of anything sensitive).
export function review(text) {
  const secrets = scanSecrets(text);
  const pii = scanPII(text);
  const entropy = scanEntropy(text);
  const findings = [...secrets, ...pii, ...entropy];
  return { clean: findings.length === 0, secrets, pii, entropy, findings };
}
