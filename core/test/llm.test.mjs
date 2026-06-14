// test/llm.test.mjs
// #1 — the model in the loop. Tiered local-first routing with cloud OFF by
// default. Proven with an injected fetch (no Ollama, no cloud account needed):
//   • Ollama when reachable, • stub when nothing is, • cloud ONLY when both
//   ALLOW_CLOUD=true AND a provider are set — fail-closed otherwise.

import { test } from 'node:test';
import assert from 'node:assert';

const llm = await import('../src/core/llm.js');

// A fetch that pretends Ollama and/or a cloud endpoint exist.
function fakeFetch({ ollama = false, cloud = false } = {}) {
  return async (url) => {
    const u = String(url);
    if (u.includes('/api/generate')) {
      if (!ollama) return { ok: false, status: 502, json: async () => ({}) };
      return { ok: true, json: async () => ({ response: 'ollama-said-hi' }) };
    }
    if (u.includes('/chat/completions')) {
      if (!cloud) return { ok: false, status: 502, json: async () => ({}) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'cloud-said-hi' } }] }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

function resetEnv() {
  delete process.env.ALLOW_CLOUD; delete process.env.LLM_CLOUD_URL;
  delete process.env.LLM_CLOUD_MODEL; delete process.env.LLM_CLOUD_KEY;
  llm._clearCache();
}

test('local-first: uses Ollama when reachable', async () => {
  resetEnv();
  const out = await llm.complete({ prompt: 'p-ollama', fetchImpl: fakeFetch({ ollama: true }) });
  assert.strictEqual(out.model.provider, 'ollama');
  assert.strictEqual(out.text, 'ollama-said-hi');
});

test('falls back to the deterministic stub when nothing is reachable', async () => {
  resetEnv();
  const out = await llm.complete({ prompt: 'p-stub', fetchImpl: fakeFetch({}) });
  assert.strictEqual(out.model.provider, 'local');
  assert.ok(out.text.length > 0);
});

test('cloud is OFF by default — never called even if configured', async () => {
  resetEnv();
  process.env.LLM_CLOUD_URL = 'https://cloud.example/v1';
  process.env.LLM_CLOUD_MODEL = 'gpt-x';
  process.env.LLM_CLOUD_KEY = 'sk-test';
  // ALLOW_CLOUD unset -> deny. Ollama down + cloud blocked -> stub.
  const out = await llm.complete({ prompt: 'p-noallow', fetchImpl: fakeFetch({ cloud: true }) });
  assert.strictEqual(out.model.provider, 'local', 'cloud must not be used when ALLOW_CLOUD!=true');
  assert.strictEqual(llm.cloudAllowed(), false);
});

test('cloud is used only when ALLOW_CLOUD=true AND configured', async () => {
  resetEnv();
  process.env.ALLOW_CLOUD = 'true';
  process.env.LLM_CLOUD_URL = 'https://cloud.example/v1';
  process.env.LLM_CLOUD_MODEL = 'gpt-x';
  process.env.LLM_CLOUD_KEY = 'sk-test';
  // Ollama down, cloud reachable+allowed -> cloud.
  const out = await llm.complete({ prompt: 'p-cloud', fetchImpl: fakeFetch({ ollama: false, cloud: true }) });
  assert.strictEqual(out.model.provider, 'cloud');
  assert.strictEqual(out.model.name, 'gpt-x');
});

test('ALLOW_CLOUD=true but no provider configured -> still stub (fail closed)', async () => {
  resetEnv();
  process.env.ALLOW_CLOUD = 'true';   // switch on, but nothing configured
  const out = await llm.complete({ prompt: 'p-allow-noconfig', fetchImpl: fakeFetch({ cloud: true }) });
  assert.strictEqual(out.model.provider, 'local');
  assert.strictEqual(llm.cloudConfigured(), false);
});

test('modelPosture reports the tier without any network call', () => {
  resetEnv();
  const p = llm.modelPosture();
  assert.strictEqual(p.localFirst, true);
  assert.strictEqual(p.cloud, 'off');
  process.env.LLM_CLOUD_URL = 'x'; process.env.LLM_CLOUD_MODEL = 'y'; process.env.LLM_CLOUD_KEY = 'z';
  assert.match(llm.modelPosture().cloud, /blocked/);   // configured but ALLOW_CLOUD=false
});
