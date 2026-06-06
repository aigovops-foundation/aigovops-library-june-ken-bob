// src/core/yesgate.shared.js
// SINGLE SOURCE OF TRUTH for the Yes-Gate logic.
// Environment-neutral (no Node or browser APIs) so BOTH run from one copy:
//   • the Node core imports it (policy.js / lantern.js / router.js re-export it),
//   • the GitHub Pages "See it run" demo inlines it at build time
//     (scripts/build-docs.mjs strips `export` and injects it between markers).
// Edit the logic HERE and nowhere else; run `npm run build:docs` to sync the page.

// --- framework library (Lantern, v1 built-in) ---
export const LIBRARY = {
  'eu-ai-act':   { name: 'EU AI Act',            gateQuestion: 'Is this high-risk system risk-managed, logged, and human-overseen per Art. 9–15?', pathToYes: ['Classify risk tier', 'Run risk-management process (Art. 9)', 'Enable logging & human oversight', 'Sign conformity evidence'] },
  'nyc-ll144':   { name: 'NYC Local Law 144',     gateQuestion: 'Has the automated employment tool passed an independent bias audit in the last 12 months?', pathToYes: ['Commission independent bias audit', 'Publish results', 'Notify candidates', 'Sign the audit receipt'] },
  'eeoc':        { name: 'EEOC adverse-impact',   gateQuestion: 'Is adverse impact across protected groups within accepted thresholds?', pathToYes: ['Measure selection rates by group', 'Remove proxy features', 'Re-test', 'Sign the fairness check'] },
  'gdpr':        { name: 'GDPR',                  gateQuestion: 'Is there a lawful basis, data minimization, and honored data-subject rights?', pathToYes: ['Define lawful basis', 'Minimize collected data', 'Wire export & delete', 'Sign the DPIA'] },
  'india-dpdp':  { name: 'India DPDP',            gateQuestion: 'Is consent captured and are data-principal rights honored?', pathToYes: ['Capture consent', 'Localize notice', 'Honor rights requests', 'Sign the record'] },
  'hipaa':       { name: 'HIPAA',                 gateQuestion: 'Is PHI safeguarded with access controls, audit, and a BAA in place?', pathToYes: ['Map PHI flows', 'Apply safeguards', 'Sign BAAs', 'Sign the security review'] },
  'nist-ai-rmf': { name: 'NIST AI RMF',           gateQuestion: 'Are Govern / Map / Measure / Manage functions evidenced?', pathToYes: ['Govern: assign accountability', 'Map: context & risk', 'Measure: test', 'Manage: monitor & sign'] },
  'ecoa':        { name: 'ECOA',                  gateQuestion: 'Is the credit model free of prohibited-basis disparate impact?', pathToYes: ['Test disparate impact', 'Document adverse-action reasons', 'Sign the model review'] },
  'coppa':       { name: 'COPPA',                 gateQuestion: 'Is verifiable parental consent obtained for users under 13?', pathToYes: ['Detect age', 'Obtain verifiable consent', 'Minimize data', 'Sign the consent record'] }
};

export function compile(frameworkId) {
  return LIBRARY[frameworkId] || { name: frameworkId, gateQuestion: 'Are this framework’s controls attested?', pathToYes: ['Map controls', 'Attest evidence', 'Sign'] };
}
export function frameworks() {
  return Object.keys(LIBRARY).map((id) => ({ id, name: LIBRARY[id].name }));
}

// --- signal detection → frameworks + coarse risk ---
export const SIGNALS = [
  { match: /(hir|recruit|candidate|resume|cv|employ|applicant)/i, frameworks: ['nyc-ll144', 'eu-ai-act', 'eeoc'], risk: 'high' },
  { match: /(health|patient|clinical|diagnos|medical)/i, frameworks: ['hipaa', 'eu-ai-act'], risk: 'high' },
  { match: /(credit|loan|lending|underwrit|insurance)/i, frameworks: ['eu-ai-act', 'ecoa'], risk: 'high' },
  { match: /(face|biometric|surveil|recogni)/i, frameworks: ['eu-ai-act', 'gdpr'], risk: 'high' },
  { match: /(child|minor|student|school)/i, frameworks: ['eu-ai-act', 'coppa', 'gdpr'], risk: 'high' },
  { match: /(personal data|pii|profil|tracking)/i, frameworks: ['gdpr', 'india-dpdp'], risk: 'med' },
  { match: /(chatbot|assistant|content|summar|generat)/i, frameworks: ['nist-ai-rmf', 'eu-ai-act'], risk: 'med' }
];
export const RISK_SCORE = { high: 86, med: 54, low: 22 };
export const RISK_TIER = { high: 'Gap', med: 'Watch', low: 'Strong' };

export function evaluate(problem = '') {
  const text = String(problem);
  const matched = SIGNALS.filter((s) => s.match.test(text));
  const frameworks = [];
  matched.forEach((s) => s.frameworks.forEach((f) => { if (frameworks.indexOf(f) < 0) frameworks.push(f); }));
  if (!frameworks.length) frameworks.push('nist-ai-rmf');
  const risk = matched.some((s) => s.risk === 'high') ? 'high' : matched.some((s) => s.risk === 'med') ? 'med' : 'low';
  const gates = frameworks.map((fw) => {
    const c = compile(fw);
    return { id: 'gate:' + fw, framework: c.name, question: c.gateQuestion, decision: 'no', act: 'get', path: c.pathToYes };
  });
  return { risk, riskIndex: RISK_SCORE[risk], tier: RISK_TIER[risk], gates };
}

// pure lifecycle transition (Get → Stay → Recover to Yes)
export function transition(gate, event) {
  const g = Object.assign({}, gate);
  if (event === 'attested') { g.decision = 'yes'; g.act = 'stay'; }
  else if (event === 'drift') { g.decision = 'no'; g.act = 'stay'; }
  else if (event === 'incident') { g.decision = 'no'; g.act = 'recover'; }
  else if (event === 'remediated') { g.decision = 'yes'; g.act = 'stay'; }
  return g;
}

// the local model stub's answer text (also reused by the page)
export function answerFor(prompt = '') {
  const p = String(prompt).toLowerCase();
  if (/eu ai act/.test(p)) return 'Map each high-risk obligation (Art. 9–15) to a CI check, then have Beacon sign the conformity evidence. Open the Reading Room to see your gates.';
  if (/hir|recruit|candidate/.test(p)) return 'Hiring AI is high-risk: NYC LL144 bias audit, EU AI Act risk-management, and EEOC adverse-impact gates apply. The Reading Room will lay out your path to Yes.';
  return 'I can map this to the frameworks that apply and show you the path to Yes. Tell me more in the Reading Room, or ask a specific regulation.';
}
