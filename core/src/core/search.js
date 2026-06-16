// src/core/search.js
// SEARCH + INDEXING (#8). Dependency-free, in-process inverted index with TF·IDF
// ranking over the things a member or steward needs to find: frameworks, skills,
// members, and ledger receipts (metadata only — never payloads). The corpus is
// small enough to index per query at this scale; the SAME shape maps onto Postgres
// FTS / OpenSearch when the ledger outgrows memory (the documented scale backend).
//
// Role-scoping is the caller's job: pass only the receipts/members the identity may
// see (the server builds the corpus from the already-scoped oversight view).

export function tokenize(s) { return String(s || '').toLowerCase().match(/[a-z0-9]+/g) || []; }

// Build an inverted index from documents: [{ id, type, text, meta }].
export function buildIndex(docs) {
  const postings = new Map();   // term -> Map(docId -> term frequency)
  const byId = new Map();
  for (const d of docs) {
    byId.set(d.id, d);
    const tf = new Map();
    for (const t of tokenize(d.text)) tf.set(t, (tf.get(t) || 0) + 1);
    for (const [t, f] of tf) { if (!postings.has(t)) postings.set(t, new Map()); postings.get(t).set(d.id, f); }
  }
  return { postings, byId, n: docs.length };
}

// Ranked query. Rarer terms weigh more (idf); a doc matching more query terms
// scores higher (tf). Returns metadata only — never the raw indexed text.
export function query(index, q, { types = null, limit = 20 } = {}) {
  const terms = tokenize(q);
  if (!terms.length || !index.n) return [];
  const scores = new Map();
  for (const t of terms) {
    const p = index.postings.get(t);
    if (!p) continue;
    const idf = Math.log(1 + index.n / p.size);
    for (const [id, f] of p) scores.set(id, (scores.get(id) || 0) + f * idf);
  }
  let results = [...scores.entries()].map(([id, score]) => { const d = index.byId.get(id); return { id: d.id, type: d.type, meta: d.meta, score: Number(score.toFixed(4)) }; });
  if (types && types.length) results = results.filter((r) => types.includes(r.type));
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// Assemble searchable documents from the live (already role-scoped) sources.
export function coreCorpus({ frameworks = [], skills = [], members = [], receipts = [] } = {}) {
  const docs = [];
  for (const f of frameworks) docs.push({ id: `framework:${f.id || f.name}`, type: 'framework', text: `${f.name || ''} ${f.summary || ''} ${(f.tags || []).join(' ')} ${(f.gates || []).join(' ')}`, meta: { name: f.name, id: f.id } });
  for (const s of skills) docs.push({ id: `skill:${s.name}`, type: 'skill', text: `${s.name} ${s.title || ''}`, meta: { name: s.name, title: s.title } });
  for (const m of members) docs.push({ id: `member:${m.id}`, type: 'member', text: `${m.id} ${m.role || ''} ${m.level || ''}`, meta: { id: m.id, role: m.role, level: m.level } });
  for (const r of receipts) docs.push({ id: `receipt:${r.ts}:${r.action}`, type: 'receipt', text: `${r.kind || ''} ${r.action || ''} ${r.actor || ''}`, meta: { kind: r.kind, action: r.action, actor: r.actor, ts: r.ts } });
  return docs;
}

// Convenience: build + query in one call over a corpus spec.
export function searchCorpus(sources, q, opts) { return query(buildIndex(coreCorpus(sources)), q, opts); }
