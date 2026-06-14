// src/core/router.js
// MODEL ROUTER — local/cheap by default, cloud opt-in.
// Thin compatibility wrapper over the unified model interface (llm.js, #1):
// local Ollama → cloud (opt-in, ALLOW_CLOUD) → deterministic stub. Kept as a
// stable import for callers (server.js /api/ask, agents.js) while the tiering,
// cloud gating, and injectable transport live in one place.
import { answerFor } from './yesgate.shared.js';
import { complete, modelPosture } from './llm.js';

// Synchronous deterministic stub — kept for the in-page demo and as the offline
// fallback. Same words as the single source of truth.
export function respond({ prompt = '' }) {
  return { text: answerFor(prompt), model: { provider: 'local', name: 'stub-1' }, cached: false };
}

// Async router: real model via local Ollama → cloud (opt-in) → stub.
export async function respondAsync({ prompt = '' } = {}) {
  return complete({ prompt });
}

// Re-export the no-network posture so /status can show the active model tier.
export { modelPosture };
