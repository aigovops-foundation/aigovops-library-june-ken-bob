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

const PROFILE = 'aigovops-beacon.v1';

// --- Canonicalization -------------------------------------------------------
// Deterministic JSON so a signature is reproducible byte-for-byte.
// NOTE: this is a SIMPLIFIED stand-in for RFC 8785 (JCS). It sorts object keys
// recursively. Before production, replace with a vetted JCS implementation so
// number formatting and unicode escaping match the spec exactly.
export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
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
const LEDGER_DIR = process.env.LEDGER_DIR || path.resolve('ledger');
const LEDGER_FILE = path.join(LEDGER_DIR, 'beacons.ndjson');

function lastRecordHash() {
  if (!fs.existsSync(LEDGER_FILE)) return null;
  const lines = fs.readFileSync(LEDGER_FILE, 'utf8').trim().split('\n').filter(Boolean);
  if (!lines.length) return null;
  const last = JSON.parse(lines[lines.length - 1]);
  return sha256(canonicalize(last.record));
}

// Build a metadata-only receipt. Caller passes the SHAPE of the action, never
// its content. `contentHash` (optional) is a hash the caller computed locally;
// the raw content is never handed to Beacon.
export function buildReceipt({ kind, actor, action, gate = null, model = null, locale = 'en', contentHash = null }) {
  loadOrCreateKeys();
  return {
    profile: PROFILE,
    ts: new Date().toISOString(),
    kind,                 // 'prompt' | 'model' | 'artifact'
    actor,                // e.g. 'member:anon' | 'agent:intake'
    action,               // short verb, e.g. 'ask' | 'assess' | 'propose'
    gate,                 // { id, framework, act, decision } or null
    model,                // { provider, name } or null  (no keys, no payload)
    locale,
    contentHash,          // hex sha256 of the *member's* content, computed client/core-side; payload itself not stored
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
  fs.mkdirSync(LEDGER_DIR, { recursive: true });
  fs.appendFileSync(LEDGER_FILE, JSON.stringify(signed) + '\n');
  return signed;
}

// Convenience: build → sign → append in one call.
export function emit(meta) {
  return append(sign(buildReceipt(meta)));
}

export function verifySigned(signed, publicKey = _pub) {
  loadOrCreateKeys();
  const msg = Buffer.from(canonicalize(signed.record), 'utf8');
  return crypto.verify(null, msg, publicKey, Buffer.from(signed.sig, 'base64'));
}

// Walk the whole ledger: check every signature AND the prev-hash chain.
export function verifyLedger() {
  loadOrCreateKeys();
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
  if (!fs.existsSync(LEDGER_FILE)) return 0;
  return fs.readFileSync(LEDGER_FILE, 'utf8').trim().split('\n').filter(Boolean).length;
}

export { sha256, LEDGER_FILE };
