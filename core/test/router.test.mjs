// test/router.test.mjs
// Phase 1 — the model router uses a local Ollama when reachable, else falls back
// to the deterministic stub. Tested against a fake Ollama HTTP server (no real
// Ollama needed).

import { test } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';

const { respond, respondAsync } = await import('../src/core/router.js');

function fakeOllama() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
        const { model, prompt } = JSON.parse(b || '{}');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ response: `echo[${model}]: ${String(prompt).slice(0, 20)}` }));
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

test('respondAsync uses Ollama when reachable', async () => {
  const { srv, port } = await fakeOllama();
  process.env.OLLAMA_URL = `http://127.0.0.1:${port}`;
  process.env.OLLAMA_MODEL = 'test-model';
  try {
    const out = await respondAsync({ prompt: 'unique-prompt-ollama-1' });
    assert.equal(out.model.provider, 'ollama');
    assert.equal(out.model.name, 'test-model');
    assert.match(out.text, /echo\[test-model\]/);
  } finally { srv.close(); }
});

test('respondAsync falls back to the stub when Ollama is unreachable', async () => {
  process.env.OLLAMA_URL = 'http://127.0.0.1:1';   // nothing listening
  process.env.OLLAMA_TIMEOUT_MS = '500';
  const out = await respondAsync({ prompt: 'unique-prompt-fallback-2' });
  assert.equal(out.model.provider, 'local');
  assert.equal(out.model.name, 'stub-1');
  assert.ok(out.text.length > 0);
});

test('sync respond is always the deterministic stub', () => {
  const out = respond({ prompt: 'unique-prompt-sync-3' });
  assert.equal(out.model.provider, 'local');
  assert.ok(out.text.length > 0);
});
