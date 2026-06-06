// src/core/router.js
// MODEL ROUTER — local/cheap by default, cloud opt-in.
// Returns a deterministic LOCAL stub so the core runs offline with $0 and no keys.
// The answer text comes from the single source of truth so the page shows the
// same words. In production this routes to Ollama locally or a cloud model
// (member opt-in); provider keys live in the core, never in any client.
import { answerFor } from './yesgate.shared.js';

const cache = new Map();
export function respond({ prompt = '', allowCloud = false }) {
  const key = prompt.trim().toLowerCase();
  if (cache.has(key)) return { ...cache.get(key), cached: true };
  const out = {
    text: answerFor(prompt),
    model: { provider: allowCloud ? 'cloud:opt-in (stub→local in v1)' : 'local', name: 'stub-1' },
    cached: false
  };
  cache.set(key, { text: out.text, model: out.model });
  return out;
}
