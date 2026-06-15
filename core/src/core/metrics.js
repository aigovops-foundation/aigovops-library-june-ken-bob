// src/core/metrics.js
// OBSERVABILITY (#5) — a dependency-free Prometheus-format metrics registry.
// Counters and gauges only (what an operator needs at 100k scale: request rate,
// response codes, gate decisions, ledger growth, halted state). No client
// library, no npm — just an in-process registry rendered as text/plain that any
// Prometheus scraper reads at /metrics. Per-process; aggregate across instances
// at the scraper (one target per pod) — see deploy/prometheus.yml.

const counters = new Map();   // fully-qualified key -> number
const gauges = new Map();
const help = new Map();       // base name -> {help, type}

function keyOf(name, labels) {
  const l = Object.entries(labels || {}).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${String(v).replace(/(["\\\n])/g, '\\$1')}"`).join(',');
  return l ? `${name}{${l}}` : name;
}
function declare(name, type, helpText) { if (!help.has(name)) help.set(name, { type, help: helpText || name }); }

export function inc(name, labels = {}, by = 1, helpText) { declare(name, 'counter', helpText); const k = keyOf(name, labels); counters.set(k, (counters.get(k) || 0) + by); }
export function setGauge(name, value, labels = {}, helpText) { declare(name, 'gauge', helpText); gauges.set(keyOf(name, labels), value); }

const baseName = (k) => k.split('{')[0];

// Render the whole registry in Prometheus text exposition format.
export function render(extraGauges = {}) {
  for (const [name, v] of Object.entries(extraGauges)) setGauge(name, v);
  const lines = [];
  const emitted = new Set();
  const all = [...counters.entries(), ...gauges.entries()];
  for (const [k] of all) {
    const base = baseName(k);
    if (!emitted.has(base)) {
      const meta = help.get(base) || { type: 'untyped', help: base };
      lines.push(`# HELP ${base} ${meta.help}`);
      lines.push(`# TYPE ${base} ${meta.type}`);
      emitted.add(base);
    }
  }
  for (const [k, v] of counters) lines.push(`${k} ${v}`);
  for (const [k, v] of gauges) lines.push(`${k} ${v}`);
  return lines.join('\n') + '\n';
}

export function reset() { counters.clear(); gauges.clear(); help.clear(); }
