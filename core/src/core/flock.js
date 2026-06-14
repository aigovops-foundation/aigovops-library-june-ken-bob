// src/core/flock.js
// CROSS-PROCESS FILE LOCK (#2) — dependency-free, synchronous.
// The Beacon ledger's append is a read-modify-write: read the last hash, sign a
// record carrying it as `prev`, append. Two processes (or instances) doing that
// at once would interleave and BREAK the hash chain. This serializes that
// critical section across processes using an O_EXCL lockfile — no `pg`, no
// flock(2) binding, just Node's fs + a non-spinning sync sleep.

import fs from 'node:fs';

// Sleep without burning CPU: Atomics.wait blocks the thread for `ms` on a
// throwaway buffer. Works in the sync Beacon path (the critical section is tiny).
function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
  catch { const end = Date.now() + ms; while (Date.now() < end) { /* fallback spin */ } }
}

/**
 * Acquire an exclusive lock. Spins (with backoff sleep) until acquired or
 * timeout; steals a lock older than staleMs (a crashed holder). Returns a
 * release function.
 */
export function acquireLock(lockPath, { timeoutMs = 5000, staleMs = 30_000, retryMs = 5 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const fd = fs.openSync(lockPath, 'wx');     // exclusive create — EEXIST if held
      try { fs.writeSync(fd, `${process.pid}:${Date.now()}`); } finally { fs.closeSync(fd); }
      let released = false;
      return () => { if (released) return; released = true; try { fs.unlinkSync(lockPath); } catch { /* already gone */ } };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // Steal a stale lock (holder crashed without releasing).
      try {
        const st = fs.statSync(lockPath);
        if (Date.now() - st.mtimeMs > staleMs) { try { fs.unlinkSync(lockPath); } catch { /* race: someone else stole it */ } continue; }
      } catch { /* lock vanished between EEXIST and stat — retry immediately */ continue; }
      if (Date.now() > deadline) throw new Error(`flock: timed out acquiring ${lockPath}`);
      sleepSync(retryMs);
    }
  }
}

// Run fn() while holding the lock; always release.
export function withLock(lockPath, fn, opts) {
  const release = acquireLock(lockPath, opts);
  try { return fn(); } finally { release(); }
}
