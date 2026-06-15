// test/metrics.test.mjs
// #5 — the dependency-free Prometheus registry: counters add up, gauges set,
// labels are escaped, and the exposition format carries HELP/TYPE.

import { test } from 'node:test';
import assert from 'node:assert';

const metrics = await import('../src/core/metrics.js');

test('counters accumulate per label set; render emits HELP/TYPE', () => {
  metrics.reset();
  metrics.inc('aigov_http_requests_total', { method: 'GET' }, 1, 'HTTP requests by method');
  metrics.inc('aigov_http_requests_total', { method: 'GET' });
  metrics.inc('aigov_http_requests_total', { method: 'POST' });
  const out = metrics.render();
  assert.match(out, /# HELP aigov_http_requests_total HTTP requests by method/);
  assert.match(out, /# TYPE aigov_http_requests_total counter/);
  assert.match(out, /aigov_http_requests_total\{method="GET"\} 2/);
  assert.match(out, /aigov_http_requests_total\{method="POST"\} 1/);
});

test('gauges set and overwrite; extraGauges render inline', () => {
  metrics.reset();
  metrics.setGauge('aigov_loop_halted', 0);
  metrics.setGauge('aigov_loop_halted', 1);
  const out = metrics.render({ aigov_ledger_entries: 42 });
  assert.match(out, /# TYPE aigov_loop_halted gauge/);
  assert.match(out, /aigov_loop_halted 1/);
  assert.match(out, /aigov_ledger_entries 42/);
});

test('label values are escaped', () => {
  metrics.reset();
  metrics.inc('x', { path: 'a"b\\c' });
  assert.match(metrics.render(), /x\{path="a\\"b\\\\c"\} 1/);
});
