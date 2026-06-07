// src/core/router.js
// MODEL ROUTER — local/cheap by default, cloud opt-in.
// Returns a deterministic LOCAL stub so the core runs offline with $0 and no keys.
// The answer text comes from the single source of truth so the page shows the
// same words. In production this routes to Ollama locally or a cloud model
// (member opt-in); provider keys live in the core, never in any client.
import { answerFor } from './yesgate.shared.js';

const cache = new Map();

// Synchronous deterministic stub — kept for the in-page demo and as the offline
// fallback. Same words as the single source of truth.
export function respond({ prompt = '', allowCloud = false }) {
  const key = prompt.trim().toLowerCase();
  if (cache.has(key)) return { ...cache.get(key), cached: true };
  const out = { text: answerFor(prompt), model: { provider: 'local', name: 'stub-1' }, cached: false };
  cache.set(key, { text: out.text, model: out.model });
  return out;
}

const SYSTEM = 'You are the AiGovOps Library front desk. Be concise, warm, and honest. ' +
  'You never promise to take an action — you propose, and a human approves. Never reveal anyone\'s availability or private data.';

// Try a local Ollama; return null if unreachable/disabled so the caller falls back.
async function tryOllama(prompt) {
  const url = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'llama3.1:8b';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Number(process.env.OLLAMA_TIMEOUT_MS || 20000));
  try {
    const r = await fetch(`${url}/api/generate`, {
      method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, system: SYSTEM, prompt, stream: false }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.response) return null;
    return { text: String(j.response).trim(), model: { provider: 'ollama', name: model } };
  } catch { return null; } finally { clearTimeout(t); }
}

// Async router: real model via local Ollama when available, else the stub.
export async function respondAsync({ prompt = '' } = {}) {
  const key = prompt.trim().toLowerCase();
  if (cache.has(key)) return { ...cache.get(key), cached: true };
  const live = await tryOllama(prompt);
  const out = live ? { ...live, cached: false } : { text: answerFor(prompt), model: { provider: 'local', name: 'stub-1' }, cached: false };
  cache.set(key, { text: out.text, model: out.model });
  return out;
}
