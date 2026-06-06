// scripts/keygen.mjs — generate an Ed25519 signing keypair into ./keys
// In production these come from a KMS/secret store via env; this is for local dev.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const dir = process.env.KEYS_DIR || path.resolve('keys');
fs.mkdirSync(dir, { recursive: true });
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
fs.writeFileSync(path.join(dir, 'private.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
fs.writeFileSync(path.join(dir, 'public.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
console.log('Wrote keys/private.pem (keep secret, gitignored) and keys/public.pem (publishable).');
