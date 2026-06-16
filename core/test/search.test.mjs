// test/search.test.mjs
// #8 — dependency-free inverted index: TF·IDF ranking, type filter, metadata-only
// output (no raw indexed text leaks).

import { test } from 'node:test';
import assert from 'node:assert';
import { tokenize, buildIndex, query, coreCorpus, searchCorpus } from '../src/core/search.js';

test('tokenize splits on non-alphanumerics, lowercases', () => {
  assert.deepStrictEqual(tokenize('EU AI-Act: high_risk!'), ['eu', 'ai', 'act', 'high', 'risk']);
});

test('ranks by relevance, filters by type, leaks no raw text', () => {
  const corpus = coreCorpus({
    frameworks: [{ name: 'EU AI Act', summary: 'high risk hiring screening', id: 'euaiact' }, { name: 'GDPR', summary: 'data protection', id: 'gdpr' }],
    skills: [{ name: 'framework-map', title: 'map a problem to frameworks' }],
    members: [{ id: 'oidc:ken', role: 'steward', level: 'auto' }],
    receipts: [{ kind: 'prompt', action: 'ask', actor: 'member:anon', ts: '2026-06-15T00:00:00Z' }],
  });
  const idx = buildIndex(corpus);

  const hits = query(idx, 'hiring risk');
  assert.equal(hits[0].type, 'framework');
  assert.equal(hits[0].meta.name, 'EU AI Act');
  assert.ok(!('text' in hits[0]), 'output is metadata-only');

  const skillsOnly = query(idx, 'map', { types: ['skill'] });
  assert.ok(skillsOnly.length && skillsOnly.every((r) => r.type === 'skill'));

  assert.deepStrictEqual(query(idx, ''), [], 'empty query → no results');
  assert.deepStrictEqual(query(idx, 'zzzznomatch'), [], 'no match → empty');
});

test('searchCorpus convenience finds a member by id', () => {
  const r = searchCorpus({ members: [{ id: 'oidc:ken', role: 'steward' }] }, 'ken');
  assert.ok(r.some((x) => x.meta.id === 'oidc:ken' && x.type === 'member'));
});
