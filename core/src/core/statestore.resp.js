// src/core/statestore.resp.js
// DEPENDENCY-FREE REDIS CLIENT (RESP2 over node:net). The shared-state seam
// (statestore.js) defines get/set/del/incr; this implements them against a real
// Redis WITHOUT the `redis` npm package — preserving the core's "zero third-party
// runtime components" guarantee (the SBOM/enclave claim) while unlocking durable,
// cluster-wide state (workflows, quotas, the kill switch). Same spirit as the
// hand-rolled JCS canonicalizer in beacon.js: we implement the wire protocol.
//
// Scope is deliberately small — single connection, in-order request/response,
// the five verbs the store needs. The socket is injectable so it's proven without
// a live server.

import net from 'node:net';

// Encode a command as a RESP2 array of bulk strings (the universal request form).
export function encodeCommand(args) {
  const parts = [Buffer.from(`*${args.length}\r\n`)];
  for (const a of args) { const b = Buffer.from(String(a)); parts.push(Buffer.from(`$${b.length}\r\n`), b, Buffer.from('\r\n')); }
  return Buffer.concat(parts);
}

// Parse ONE reply from a Buffer. Returns { value, rest, error? } or null if the
// buffer doesn't yet hold a complete reply. Byte-correct (handles multibyte JSON).
export function parseReply(buf) {
  if (buf.length < 1) return null;
  const type = String.fromCharCode(buf[0]);
  const nl = buf.indexOf('\r\n');
  if (nl === -1) return null;
  const line = buf.slice(1, nl).toString('utf8');
  const after = buf.slice(nl + 2);
  switch (type) {
    case '+': return { value: line, rest: after };
    case '-': return { value: new Error(line), rest: after, error: true };
    case ':': return { value: Number(line), rest: after };
    case '$': {
      const len = Number(line);
      if (len === -1) return { value: null, rest: after };
      if (after.length < len + 2) return null;                 // bulk body not fully arrived
      return { value: after.slice(0, len).toString('utf8'), rest: after.slice(len + 2) };
    }
    case '*': {
      const n = Number(line);
      if (n === -1) return { value: null, rest: after };
      let rest = after; const arr = [];
      for (let i = 0; i < n; i++) { const r = parseReply(rest); if (!r) return null; arr.push(r.value); rest = r.rest; }
      return { value: arr, rest };
    }
    default: return { value: line, rest: after };
  }
}

export class RespClient {
  constructor(opts = {}) {
    this.url = opts.url || process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    this.socket = opts.socket || null;          // injectable for tests
    this.connectTimeoutMs = opts.connectTimeoutMs || 3000;
    this._buf = Buffer.alloc(0);
    this._queue = [];                            // FIFO of pending { resolve, reject } — Redis replies in order
    this._connected = false;
  }

  async connect() {
    if (this._connected) return this;
    const injected = !!this.socket;
    const u = new URL(this.url);
    if (!injected) {
      this.socket = net.createConnection({ host: u.hostname, port: Number(u.port || 6379) });
      await new Promise((resolve, reject) => {
        const to = setTimeout(() => { this.socket.destroy(); reject(new Error(`redis connect timeout (${this.connectTimeoutMs}ms)`)); }, this.connectTimeoutMs);
        this.socket.once('connect', () => { clearTimeout(to); resolve(); });
        this.socket.once('error', (e) => { clearTimeout(to); reject(e); });
      });
    }
    this.socket.on('data', (d) => this._onData(d));
    this.socket.on('error', (e) => this._failAll(e));
    this.socket.on('close', () => { this._connected = false; this._failAll(new Error('redis connection closed')); });
    this._connected = true;
    if (u.password) await this.command(['AUTH', u.password]);
    return this;
  }

  _onData(d) { this._buf = Buffer.concat([this._buf, d]); this._drain(); }
  _drain() {
    while (this._queue.length) {
      const r = parseReply(this._buf);
      if (!r) break;
      this._buf = r.rest;
      const { resolve, reject } = this._queue.shift();
      if (r.error) reject(r.value); else resolve(r.value);
    }
  }
  _failAll(e) { while (this._queue.length) this._queue.shift().reject(e); }

  command(args) {
    if (!this.socket) return Promise.reject(new Error('not connected'));
    return new Promise((resolve, reject) => { this._queue.push({ resolve, reject }); this.socket.write(encodeCommand(args)); });
  }

  async quit() { try { await this.command(['QUIT']); } catch { /* closing */ } try { this.socket && this.socket.end(); } catch { /* already gone */ } }
}

// The store adapter — same surface as MemoryStore/RedisStore (get/set/del/incr/close).
export class RespStore {
  constructor(client) { this.client = client; }
  static async connect(url = process.env.REDIS_URL, { socket } = {}) { return new RespStore(await new RespClient({ url, socket }).connect()); }

  async get(k) { const v = await this.client.command(['GET', k]); if (v == null) return null; try { return JSON.parse(v); } catch { return v; } }
  async set(k, v, ttlMs) { const s = typeof v === 'string' ? v : JSON.stringify(v); const args = ['SET', k, s]; if (ttlMs) args.push('PX', Math.ceil(ttlMs)); await this.client.command(args); return v; }
  async del(k) { await this.client.command(['DEL', k]); }
  async incr(k, by = 1, ttlMs) { const v = await this.client.command(['INCRBY', k, by]); if (ttlMs && v === by) await this.client.command(['EXPIRE', k, Math.ceil(ttlMs / 1000)]); return v; }
  async close() { await this.client.quit(); }
}
