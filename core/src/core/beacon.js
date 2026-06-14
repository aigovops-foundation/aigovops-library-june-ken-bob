// src/core/beacon.js
// BEACON — the unit of truth.
// Signs metadata-only receipts (Model / Prompt / Artifact) with Ed25519 and
// appends them to an append-only NDJSON ledger. NO PAYLOADS EVER: we record the
// fact and shape of an action, never the prompt, document, or PII.
//
// Profile: aigovops-beacon.v1  (steward: OVERT 1.0)
// Verification needs nothing but a public key — see scripts/verify-ledger.mjs
// and the openssl note in the README.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { withLock } from './flock.js';

const PROFILE = 'aigovops-beacon.v1';

// --- Canonicalization (RFC 8785 / JCS) --------------------------------------
// Deterministic JSON so a signature is reproducible byte-for-byte. Implements
// the JSON Canonicalization Scheme (RFC 8785):
//   • object property names sorted by UTF-16 code units (JS default string sort)
//     — RFC 8785 §3.2.3;
//   • numbers via ECMAScript Number::toString (shortest round-trip) — §3.2.2.3;
//   • strings via ECMAScript JSON quoting (minimal escapes, lowercase \uXXXX)
//     — §3.2.2.2.
// Rejects values JCS cannot represent (non-finite numbers, undefined, bigint,
// function, symbol) rather than silently coercing them.
//
// Note: for any valid JSON value this produces the same bytes as the previous
// implementation, so existing ledgers continue to verify — the change adds
// spec-conformance (test vectors) and strict rejection of invalid inputs.
export function canonicalize(value) {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean': return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('JCS: non-finite number not allowed');
      return String(value);                       // ES Number::toString === RFC 8785 §3.2.2.3
    case 'string': return JSON.stringify(value);  // ES JSON string quoting === RFC 8785 §3.2.2.2
    case 'object':
      if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
      return '{' + Object.keys(value).sort()      // sort by UTF-16 code units — §3.2.3
        .map(k => JSON.stringify(k) + ':' + canonicalize(value[k]))
        .join(',') + '}';
    default:
      throw new TypeError('JCS: unsupported type ' + typeof value);
  }
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// --- Key custody ------------------------------------------------------------
// Local dev: keys live in ./keys (gitignored). In the canonical cloud these
// come from a KMS/secret store via env. The private key NEVER leaves the core
// and is NEVER sent to any client.
const KEYS_DIR = process.env.KEYS_DIR || path.resolve('keys');
const PRIV_PEM = process.env.BEACON_PRIVATE_KEY_PEM || null; // optional: inline via env/secret store
const PUB_PEM = process.env.BEACON_PUBLIC_KEY_PEM || null;

let _priv = null, _pub = null, _kid = null;

export function loadOrCreateKeys() {
  if (_priv && _pub) return { kid: _kid };
  const privPath = path.join(KEYS_DIR, 'private.pem');
  const pubPath = path.join(KEYS_DIR, 'public.pem');

  if (PRIV_PEM && PUB_PEM) {
    _priv = crypto.createPrivateKey(PRIV_PEM);
    _pub = crypto.createPublicKey(PUB_PEM);
  } else if (fs.existsSync(privPath) && fs.existsSync(pubPath)) {
    _priv = crypto.createPrivateKey(fs.readFileSync(privPath));
    _pub = crypto.createPublicKey(fs.readFileSync(pubPath));
  } else {
    // First run with no keys: generate a dev keypair so the core boots.
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    fs.mkdirSync(KEYS_DIR, { recursive: true });
    fs.writeFileSync(privPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    fs.writeFileSync(pubPath, publicKey.export({ type: 'spki', format: 'pem' }));
    _priv = privateKey; _pub = publicKey;
    console.log('[beacon] generated a new dev Ed25519 keypair in', KEYS_DIR);
  }
  // key id = short hash of the public key (so a verifier can match kid → pubkey)
  const pubDer = _pub.export({ type: 'spki', format: 'der' });
  _kid = sha256(pubDer.toString('hex')).slice(0, 16);
  return { kid: _kid };
}

export function publicKeyPem() {
  loadOrCreateKeys();
  return _pub.export({ type: 'spki', format: 'pem' });
}

// --- Ledger -----------------------------------------------------------------
// Resolved per-call (not frozen at module load) so a test can point LEDGER_DIR
// at a temp dir, and so the runtime can set the ledger location via env.
function ledgerDir() { return process.env.LEDGER_DIR || path.resolve('ledger'); }
function ledgerFile() { return path.join(ledgerDir(), 'beacons.ndjson'); }

function lastRecordHash() {
  const LEDGER_FILE = ledgerFile();
  if (!fs.existsSync(LEDGER_FILE)) return null;
  const lines = fs.readFileSync(LEDGER_FILE, 'utf8').trim().split('\n').filter(Boolean);
  if (!lines.length) return null;
  const last = JSON.parse(lines[lines.length - 1]);
  return sha256(canonicalize(last.record));
}

// Build a metadata-only receipt. Caller passes the SHAPE of the action, never
// its content. `contentHash` (optional) is a hash the caller computed locally;
// the raw content is never handed to Beacon.
export function buildReceipt({ kind, actor, action, gate = null, model = null, locale = 'en', contentHash = null, detail = null }) {
  loadOrCreateKeys();
  return {
    profile: PROFILE,
    ts: new Date().toISOString(),
    kind,                 // 'prompt' | 'model' | 'artifact' | 'secret'
    actor,                // e.g. 'member:anon' | 'agent:intake' | 'gate'
    action,               // short verb, e.g. 'ask' | 'assess' | 'propose' | 'issue'
    gate,                 // { id, framework, act, decision } or null
    model,                // { provider, name } or null  (no keys, no payload)
    locale,
    contentHash,          // hex sha256 of the *member's* content, computed client/core-side; payload itself not stored
    // Optional domain metadata (e.g. a secret broker's { scope, ttl, expiresAt,
    // ref, decision }). METADATA ONLY — callers must never put secret material
    // here. Omitted entirely when null so non-secret receipts are unchanged.
    ...(detail ? { detail } : {}),
    prev: lastRecordHash()
  };
}

export function sign(record) {
  loadOrCreateKeys();
  const msg = Buffer.from(canonicalize(record), 'utf8');
  const sig = crypto.sign(null, msg, _priv); // Ed25519
  return { record, alg: 'ed25519', kid: _kid, sig: sig.toString('base64') };
}

export function append(signed) {
  fs.mkdirSync(ledgerDir(), { recursive: true });
  fs.appendFileSync(ledgerFile(), JSON.stringify(signed) + '\n');
  return signed;
}

// Convenience: build → sign → append in one call.
// MULTI-PROCESS SAFE (#2): the read-prev (buildReceipt) → append sequence runs
// under a cross-process lock so concurrent writers/instances can't interleave
// and break the hash chain. Single-process callers pay only an uncontended
// O_EXCL create/unlink; the default file behaviour is otherwise unchanged.
export function emit(meta) {
  fs.mkdirSync(ledgerDir(), { recursive: true });
  return withLock(ledgerFile() + '.lock', () => append(sign(buildReceipt(meta))));
}

export function verifySigned(signed, publicKey = _pub) {
  loadOrCreateKeys();
  const msg = Buffer.from(canonicalize(signed.record), 'utf8');
  return crypto.verify(null, msg, publicKey, Buffer.from(signed.sig, 'base64'));
}

// Stable content id of a receipt: the hash of its canonical record (the same
// value the chain uses for `prev`). Used to LINK one receipt to another — e.g.
// a secret grant back to the proposal that approved it — without mutating the
// chain. Accepts a signed envelope ({record}) or a bare record.
export function receiptId(signedOrRecord) {
  const record = signedOrRecord && signedOrRecord.record ? signedOrRecord.record : signedOrRecord;
  return sha256(canonicalize(record));
}

// Walk the whole ledger: check every signature AND the prev-hash chain.
export function verifyLedger() {
  loadOrCreateKeys();
  const LEDGER_FILE = ledgerFile();
  if (!fs.existsSync(LEDGER_FILE)) return { entries: 0, valid: true, broken: [] };
  const lines = fs.readFileSync(LEDGER_FILE, 'utf8').trim().split('\n').filter(Boolean);
  const broken = [];
  let prevHash = null;
  lines.forEach((line, i) => {
    const signed = JSON.parse(line);
    if (!verifySigned(signed)) broken.push({ index: i, reason: 'bad-signature' });
    if (signed.record.prev !== prevHash) broken.push({ index: i, reason: 'broken-chain' });
    prevHash = sha256(canonicalize(signed.record));
  });
  return { entries: lines.length, valid: broken.length === 0, broken };
}

export function ledgerCount() {
  const LEDGER_FILE = ledgerFile();
  if (!fs.existsSync(LEDGER_FILE)) return 0;
  return fs.readFileSync(LEDGER_FILE, 'utf8').trim().split('\n').filter(Boolean).length;
}

export { sha256, ledgerFile };
