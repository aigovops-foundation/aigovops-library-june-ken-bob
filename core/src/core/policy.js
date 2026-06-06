// src/core/policy.js
// POLICY / YES-GATE ENGINE — the heart.
// The evaluation + lifecycle now live in the single source of truth
// (yesgate.shared.js) so the same logic runs in the Node core AND inlined in the
// browser "See it run" demo. This file preserves the public API.
export { evaluate, transition, RISK_SCORE, RISK_TIER, SIGNALS } from './yesgate.shared.js';
