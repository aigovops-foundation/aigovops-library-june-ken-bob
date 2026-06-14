// src/core/storage.js
// PLUGGABLE LEDGER STORAGE (Phase 1, dual storage).
//   • FileStore — default, dependency-free, append-only NDJSON (matches today's
//     beacon ledger file; persists on a mounted volume).
//   • PgStore  — opt-in for multi-instance / query at scale. Requires the one
//     dependency `pg` (`npm i pg`) and DATABASE_URL. Kept off the default path so
//     the core stays dependency-free unless you choose Postgres.
//
// NOTE: this is the storage SEAM. Wiring beacon.js to read/write through it is a
// deliberate follow-up (it touches the signature + hash-chain core), so it is not
// yet the live path — FileStore here mirrors the current file behaviour exactly.

import fs from 'node:fs';
import path from 'node:path';
import { withLock } from './flock.js';
import { canonicalize, sha256 } from './beacon.js';

const chainHash = (signed) => sha256(canonicalize(signed.record));

export class FileStore {
  constructor({ dir } = {}) {
    this.dir = dir || process.env.LEDGER_DIR || path.resolve('ledger');
    this.file = path.join(this.dir, 'beacons.ndjson');
  }
  append(signed) {
    fs.mkdirSync(this.dir, { recursive: true });
    // Lock-protected so concurrent processes don't interleave appends (#2).
    return withLock(this.file + '.lock', () => { fs.appendFileSync(this.file, JSON.stringify(signed) + '\n'); return signed; });
  }
  readAll() {
    if (!fs.existsSync(this.file)) return [];
    return fs.readFileSync(this.file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }
  lastHash() { const a = this.readAll(); return a.length ? chainHash(a[a.length - 1]) : null; }
  count() { return this.readAll().length; }
  async close() {}
}

// Postgres adapter — a genuine MULTI-WRITER durable ledger (#2). Activated only
// when DATABASE_URL is set AND `pg` is installed (opt-in, preserving the
// dependency-free default). `client` is injectable so the transactional chaining
// is proven against a fake in-memory client without a live database.
export class PgStore {
  static async connect(url = process.env.DATABASE_URL) {
    let pg;
    try { pg = (await import('pg')).default || (await import('pg')); }
    catch { throw new Error('PgStore needs the `pg` package — run `npm i pg` (kept optional to preserve the dependency-free default)'); }
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    const store = new PgStore(client);
    await store.init();
    return store;
  }
  constructor(client) { this.client = client; }
  async init() {
    await this.client.query('CREATE TABLE IF NOT EXISTS aigov_ledger (seq BIGSERIAL PRIMARY KEY, signed JSONB NOT NULL, ts TIMESTAMPTZ DEFAULT now())');
  }

  // Transactionally append a SIGNED record whose `prev` is computed UNDER LOCK,
  // so concurrent writers across instances produce one correct chain. The caller
  // passes buildAndSign(prevHash) so the signature covers the in-transaction prev.
  async emitSigned(buildAndSign) {
    const c = this.client;
    await c.query('BEGIN');
    try {
      await c.query('SELECT pg_advisory_xact_lock($1)', [424242]);          // serialize appenders
      const last = await c.query('SELECT signed FROM aigov_ledger ORDER BY seq DESC LIMIT 1');
      const prev = last.rows[0] ? chainHash(last.rows[0].signed) : null;
      const signed = buildAndSign(prev);
      await c.query('INSERT INTO aigov_ledger(signed) VALUES ($1)', [signed]);
      await c.query('COMMIT');
      return signed;
    } catch (e) { await c.query('ROLLBACK'); throw e; }
  }

  async append(signed) { await this.client.query('INSERT INTO aigov_ledger(signed) VALUES ($1)', [signed]); return signed; }
  async readAll() { const r = await this.client.query('SELECT signed FROM aigov_ledger ORDER BY seq ASC'); return r.rows.map((x) => x.signed); }
  async count() { const r = await this.client.query('SELECT count(*)::int AS n FROM aigov_ledger'); return r.rows[0].n; }
  async lastHash() { const r = await this.client.query('SELECT signed FROM aigov_ledger ORDER BY seq DESC LIMIT 1'); return r.rows[0] ? chainHash(r.rows[0].signed) : null; }

  // Verify the prev-hash chain over the whole ledger (signature verification is
  // beacon.verifySigned — storage owns only the chain links).
  async verifyChain() {
    const all = await this.readAll();
    let prev = null;
    for (let i = 0; i < all.length; i++) {
      if (all[i].record.prev !== prev) return { valid: false, brokenAt: i };
      prev = chainHash(all[i]);
    }
    return { valid: true, entries: all.length };
  }
  async close() { await this.client.end(); }
}

// Pick a store: Postgres when DATABASE_URL is set, else the file ledger.
export async function createStore() {
  if (process.env.DATABASE_URL) return PgStore.connect();
  return new FileStore();
}
