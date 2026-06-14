// test/secrets.contract.test.mjs
// Ticket 2 acceptance: the IDENTICAL contract suite runs against BOTH backends
// (FileProvider and VaultProvider) and both pass — proving the swap is
// config-only and the gate never changes. The Vault backend uses an in-process
// fake transport (no running Vault needed); a live Vault is wired by the same
// VaultProvider with VAULT_ADDR/VAULT_TOKEN and the default curl transport.

import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MASTER_FILE = 'MASTER-SECRET-DO-NOT-LEAK-7f3a9c2b';
const ADMIN_TOKEN = 's.ADMIN-ROOT-TOKEN-DO-NOT-LEAK-9q2'; // Vault "master" analog
const SCOPE = 'github-deploy';

// Hermetic temp dirs. Set BEFORE importing beacon so its keys/ledger are isolated.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-secrets-contract-'));
process.env.KEYS_DIR = path.join(TMP, 'keys');
process.env.LEDGER_DIR = path.join(TMP, 'ledger');

const beacon = await import('../src/core/beacon.js');
const { FileProvider } = await import('../src/core/secrets.fileprovider.js');
const { VaultProvider } = await import('../src/core/secrets.vaultprovider.js');
const { runContract } = await import('./secrets-contract.shared.mjs');

// --- FileProvider factory ----------------------------------------------------
function writeStore() {
  const p = path.join(TMP, `store-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(p, JSON.stringify({ owner: 'lab', scopes: { [SCOPE]: MASTER_FILE }, rotated: { [SCOPE]: '2026-06-06' } }));
  return p;
}
const makeFile = (overrides = {}) => new FileProvider({ storePath: writeStore(), ...overrides });

// --- VaultProvider factory (in-process fake Vault) ---------------------------
// A minimal, stateful stand-in for the Vault HTTP API exercising exactly the
// endpoints VaultProvider uses. Each provider gets its own fake so state is
// isolated across tests.
function fakeVault() {
  const tokens = new Map(); // accessor -> { token, revoked }
  let n = 0;
  const rand = (p) => `${p}.${(++n).toString(16)}-${Math.random().toString(16).slice(2)}`;
  return ({ method = 'GET', path: p, body = null, token = ADMIN_TOKEN }) => {
    // scope registry
    if (p === `secret/metadata/${SCOPE}`) {
      return { status: 200, json: { data: { updated_time: '2026-06-06T00:00:00Z', custom_metadata: { owner: 'community', lastRotated: '2026-06-06' } } } };
    }
    if (p.startsWith('secret/metadata/')) return { status: 404, json: { errors: [] } };
    // mint child token
    if (method === 'POST' && p === 'auth/token/create') {
      const accessor = rand('accessor');
      const client_token = rand('s.child');
      tokens.set(accessor, { token: client_token, revoked: false });
      return { status: 200, json: { auth: { client_token, accessor, lease_duration: 60 } } };
    }
    if (method === 'POST' && p === 'auth/token/renew-accessor') {
      const e = tokens.get(body.accessor);
      return e && !e.revoked ? { status: 200, json: {} } : { status: 400, json: { errors: ['invalid accessor'] } };
    }
    if (method === 'POST' && p === 'auth/token/revoke-accessor') {
      const e = tokens.get(body.accessor);
      if (e) e.revoked = true;
      return { status: 204, json: null };
    }
    if (method === 'GET' && p === 'auth/token/lookup-self') {
      const entry = [...tokens.values()].find((e) => e.token === token);
      return entry && !entry.revoked ? { status: 200, json: { data: { ttl: 60 } } } : { status: 403, json: { errors: ['permission denied'] } };
    }
    return { status: 404, json: { errors: ['unmapped: ' + method + ' ' + p] } };
  };
}
const makeVault = (overrides = {}) => new VaultProvider({ request: fakeVault(), addr: 'http://fake', token: ADMIN_TOKEN, ...overrides });

// --- run the SAME contract against both --------------------------------------
runContract({ test, label: 'FileProvider', makeProvider: makeFile, master: MASTER_FILE, scope: SCOPE, beacon });
runContract({ test, label: 'VaultProvider', makeProvider: makeVault, master: ADMIN_TOKEN, scope: SCOPE, beacon });
