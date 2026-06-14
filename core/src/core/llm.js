// src/core/llm.js
// THE MODEL IN THE LOOP — unified, tiered, local-first (#1).
// One interface every agent and the router call. Tiers, in order:
//   1. Ollama (local)  — $0, private, no key leaves the box. The default.
//   2. Cloud (opt-in)  — only when ALLOW_CLOUD=true AND a provider is configured.
//                        OFF by default; an enclave (deny-all) never reaches it.
//   3. Stub (fallback) — the deterministic single-source answer, so the core
//                        always responds offline with zero setup.
//
// Dependency-free: Node's global fetch only — no SDKs, no npm. The model only ever
// PROPOSES language; the gate/caps/sandbox still hold every irreversible effect,
// so a hallucinated proposal is contained, never executed. Receipts that record a
// model call carry { provider, name } metadata only — never the prompt or output.

import { answerFor } from './yesgate.shared.js';

export const STUB_MODEL = { provider: 'local', name: 'stub-1' };
const DEFAULT_SYSTEM =
  'You are the AiGovOps Library front desk. Be concise, warm, and honest. You never ' +
  'promise to take an action — you propose, and a human approves. Never reveal anyone\'s ' +
  'availability or private data.';

const cache = new Map();

// Cloud is gated by TWO independent switches, both required — defense in depth:
//   ALLOW_CLOUD=true   (the policy switch; enclave keeps it false)
//   a configured provider (url + model + key)
export function cloudAllowed() { return String(process.env.ALLOW_CLOUD || 'false').toLowerCase() === 'true'; }
export function cloudConfigured() { return !!(process.env.LLM_CLOUD_URL && process.env.LLM_CLOUD_MODEL && process.env.LLM_CLOUD_KEY); }

// What posture is in force, WITHOUT making a network call — for /status and demos.
export function modelPosture() {
  return {
    localFirst: true,
    ollama: { url: process.env.OLLAMA_URL || 'http://localhost:11434', model: process.env.OLLAMA_MODEL || 'llama3.1:8b' },
    cloud: cloudAllowed() && cloudConfigured() ? 'opt-in available' : (cloudConfigured() ? 'configured but ALLOW_CLOUD=false (blocked)' : 'off'),
  };
}

async function tryOllama(prompt, system, fetchImpl) {
  const url = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'llama3.1:8b';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Number(process.env.OLLAMA_TIMEOUT_MS || 20000));
  try {
    const r = await fetchImpl(`${url}/api/generate`, {
      method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, system, prompt, stream: false }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.response) return null;
    return { text: String(j.response).trim(), model: { provider: 'ollama', name: model } };
  } catch { return null; } finally { clearTimeout(t); }
}

// Cloud tier — OpenAI-compatible /chat/completions (works for OpenAI, Together,
// vLLM, LiteLLM, etc.). FAILS CLOSED: returns null unless BOTH switches are on.
async function tryCloud(prompt, system, fetchImpl) {
  if (!cloudAllowed() || !cloudConfigured()) return null; // deny-all by default
  const url = process.env.LLM_CLOUD_URL.replace(/\/$/, '');
  const model = process.env.LLM_CLOUD_MODEL;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Number(process.env.LLM_CLOUD_TIMEOUT_MS || 30000));
  try {
    const r = await fetchImpl(`${url}/chat/completions`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.LLM_CLOUD_KEY}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], stream: false }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!text) return null;
    return { text: String(text).trim(), model: { provider: 'cloud', name: model } };
  } catch { return null; } finally { clearTimeout(t); }
}

/**
 * Complete a prompt through the tiered model. Local-first, cloud only when
 * explicitly allowed, deterministic stub as the floor.
 * @param {Object} opts
 * @param {string}   opts.prompt
 * @param {string}   [opts.system]     system prompt (default front-desk persona)
 * @param {Function} [opts.fetchImpl]  injectable transport for tests
 * @param {boolean}  [opts.cache]      cache by prompt (default true)
 * @returns {Promise<{text, model:{provider,name}, cached:boolean}>}
 */
export async function complete({ prompt = '', system = DEFAULT_SYSTEM, fetchImpl = fetch, cache: useCache = true } = {}) {
  const key = prompt.trim().toLowerCase();
  if (useCache && cache.has(key)) return { ...cache.get(key), cached: true };
  let live = await tryOllama(prompt, system, fetchImpl);
  if (!live) live = await tryCloud(prompt, system, fetchImpl);  // null unless allowed+configured
  const out = live ? { ...live, cached: false } : { text: answerFor(prompt), model: STUB_MODEL, cached: false };
  if (useCache) cache.set(key, { text: out.text, model: out.model });
  return out;
}

export function _clearCache() { cache.clear(); }
