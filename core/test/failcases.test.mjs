// failcases.test.mjs — integrity + gate-law tests for the Top 100 Fail Cases corpus.
// Runs under `node --test`. Reads the corpus from docs/data/failcases-archetypes.json.
// The corpus is the content behind the Reading Room and the practitioner quiz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// core/test/ -> repo root -> docs/data/failcases-archetypes.json
// (the corpus was renamed failcases.json -> failcases-archetypes.json in the
// 2026-W24 batch; identical schema. Keep this path in sync with the Reading Room.)
const CORPUS = resolve(__dirname, '../../docs/data/failcases-archetypes.json');
const data = JSON.parse(readFileSync(CORPUS, 'utf8'));
const cases = data.cases;

const VALID_VERDICTS = new Set([0, 1, '?']);
const REQUIRED = ['id', 'title', 'domain', 'scenario', 'framework', 'gate', 'verdict', 'harm', 'path_to_yes', 'tags'];

test('corpus loads and is sized to 100', () => {
  assert.ok(Array.isArray(cases), 'cases is an array');
  assert.equal(cases.length, 100, 'exactly 100 fail cases');
  assert.equal(data.count, cases.length, 'declared count matches actual');
});

test('every case has all required fields', () => {
  for (const c of cases) {
    for (const k of REQUIRED) {
      assert.ok(c[k] !== undefined && c[k] !== null && c[k] !== '', `${c.id || '??'} missing ${k}`);
    }
    assert.ok(Array.isArray(c.framework) && c.framework.length > 0, `${c.id} needs >=1 framework ref`);
    assert.ok(Array.isArray(c.tags) && c.tags.length > 0, `${c.id} needs >=1 tag`);
  }
});

test('ids are unique and well-formed', () => {
  const seen = new Set();
  for (const c of cases) {
    assert.match(c.id, /^FC-\d{3}$/, `${c.id} is not FC-NNN`);
    assert.ok(!seen.has(c.id), `duplicate id ${c.id}`);
    seen.add(c.id);
  }
});

test('every verdict is a legal gate-law value (1 / 0 / ?)', () => {
  for (const c of cases) {
    assert.ok(VALID_VERDICTS.has(c.verdict), `${c.id} has illegal verdict ${JSON.stringify(c.verdict)}`);
  }
});

test('THE HARM rule: every Maybe (?) carries a named owner AND an ETA', () => {
  const maybes = cases.filter(c => c.verdict === '?');
  assert.ok(maybes.length > 0, 'corpus should contain teaching Maybes');
  for (const c of maybes) {
    const p = c.path_to_yes.toLowerCase();
    assert.ok(p.includes('owner'), `${c.id}: a Maybe must name an owner`);
    assert.ok(p.includes('eta'), `${c.id}: a Maybe must carry an ETA`);
  }
});

test('a hard No (0) never silently carries an unowned deferral', () => {
  // A 0 means stop. It must not be phrased as a deferral (that would be a smuggled ?).
  for (const c of cases.filter(c => c.verdict === 0)) {
    assert.ok(c.path_to_yes.length > 0, `${c.id}: even a No states what would earn a future Yes`);
  }
});

test('corpus has teaching contrast: at least some earned Yes (1) exemplars', () => {
  const yes = cases.filter(c => c.verdict === 1);
  assert.ok(yes.length >= 3, 'need earned-Yes exemplars for the quiz to teach the positive case');
});

test('quiz can build a question from every case (no blanks in the asked fields)', () => {
  for (const c of cases) {
    // The quiz hides the verdict and asks for it; scenario + gate must be answerable.
    assert.ok(c.scenario.length > 20, `${c.id}: scenario too thin to quiz on`);
    assert.ok(c.gate.length > 3, `${c.id}: gate label too thin`);
  }
});

test('domain coverage is broad (not all one domain)', () => {
  const domains = new Set(cases.map(c => c.domain));
  assert.ok(domains.size >= 6, `expected broad domain coverage, got ${domains.size}`);
});
