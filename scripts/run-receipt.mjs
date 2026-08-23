#!/usr/bin/env node
// run-receipt — a metadata-only receipt for one automated run.
//
//   node scripts/run-receipt.mjs --verify            # check the committed chain
//   node scripts/run-receipt.mjs --verify --strict   # ... and fail if anything is unsigned
//
// WHY THIS DOES NOT CALL beacon.emit()
//
// The core's `emit()` is right for the running product and wrong for CI, for one reason:
// `loadOrCreateKeys()` GENERATES a keypair when it finds none. A GitHub Actions runner starts
// from a fresh checkout with no `core/keys/private.pem`, so every scheduled run would mint a
// throwaway Ed25519 key, sign with it, and discard it. Measured: two fresh key directories
// produced kids 648a8270d9247a2c and 9765996ed1c5c190.
//
// Those receipts would say `signed`. Nobody could verify one, and the signer would differ every
// hour. A signature from a key that existed for forty seconds is not evidence of anything — it
// is the APPEARANCE of evidence, which is worse than none, because it stops anyone looking.
//
// So this module never creates a key. With `BEACON_PRIVATE_KEY_PEM` and
// `BEACON_PUBLIC_KEY_PEM` in the environment — secrets a founder mints, which is a Red act — it
// signs, using the same Ed25519-over-JCS construction as the core so the two are compatible.
// Without them it writes `state: "unsigned"` and says so on every run. Unsigned is not signed,
// the way unknown is not green.
//
// An unsigned receipt is still worth having, and it is worth being exact about how much. The
// chain catches an edit made IN PLACE: change a record and its own hash stops matching; fix
// that hash too and the next entry's `prev` stops matching. What it does NOT catch is someone
// who rewrites the file end to end and re-chains it — that verifies, and there is a test
// asserting so rather than an assumption hoping otherwise.
//
// So: the chain proves nobody edited the file in place. Only a signature proves who wrote it.
// The check prints the split so nobody mistakes the first for the second.

import crypto from "node:crypto";
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalize } from "../core/src/core/beacon.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const LEDGER = join(ROOT, "ops", "receipts", "runs.ndjson");
export const PROFILE = "aigovops-run.v1";

// NO PAYLOADS, EVER — made executable rather than remembered. A receipt records the fact and
// shape of a run: which workflow, which run, how it ended. Anything else is refused at the
// door, including a nested object, which is the shape a payload arrives in.
export const ALLOWED = [
  "profile", "ts", "kind", "actor", "action",
  "workflow", "runId", "runAttempt", "event", "conclusion", "sha",
  "startedAt", "endedAt", "prev",
];

export class ReceiptError extends Error {}

export function buildRunReceipt(input, prev = null) {
  const rec = { profile: PROFILE, kind: "run", prev, ...input };

  for (const k of Object.keys(rec)) {
    if (!ALLOWED.includes(k)) {
      throw new ReceiptError(`"${k}" is not a receipt field — receipts are metadata only, and an unexpected field is how a payload gets in`);
    }
    const v = rec[k];
    if (v !== null && typeof v === "object") {
      throw new ReceiptError(`"${k}" is an object — a receipt carries scalars only, so there is nowhere for a payload to hide`);
    }
    if (typeof v === "string" && v.length > 200) {
      throw new ReceiptError(`"${k}" is ${v.length} characters — too long to be metadata`);
    }
  }
  for (const k of ["ts", "actor", "action", "workflow", "runId", "conclusion"]) {
    if (rec[k] === undefined || rec[k] === null || rec[k] === "") throw new ReceiptError(`"${k}" is required`);
  }
  // Canonical field order, so the file reads the same way every time.
  const out = {};
  for (const k of ALLOWED) if (rec[k] !== undefined) out[k] = rec[k];
  return out;
}

export const receiptHash = (record) =>
  crypto.createHash("sha256").update(canonicalize(record), "utf8").digest("hex");

// Signs ONLY with a key handed to us. Never generates one — see the note at the top.
export function seal(record, env = process.env) {
  const hash = receiptHash(record);
  const priv = env.BEACON_PRIVATE_KEY_PEM;
  const pub = env.BEACON_PUBLIC_KEY_PEM;
  if (!priv || !pub) return { record, hash, state: "unsigned" };

  const publicKey = crypto.createPublicKey(pub);
  const kid = crypto.createHash("sha256")
    .update(publicKey.export({ type: "spki", format: "der" }).toString("hex"))
    .digest("hex").slice(0, 16);
  const sig = crypto.sign(null, Buffer.from(canonicalize(record), "utf8"), crypto.createPrivateKey(priv));
  return { record, hash, state: "signed", alg: "ed25519", kid, sig: sig.toString("base64") };
}

export const readLedger = (file = LEDGER) =>
  existsSync(file)
    ? readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l, i) => {
        try { return JSON.parse(l); } catch { throw new ReceiptError(`${file}:${i + 1} is not JSON`); }
      })
    : [];

export const lastHash = (entries) => (entries.length ? entries[entries.length - 1].hash : null);

export function appendEntry(entry, file = LEDGER) {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(entry) + "\n");
  return entry;
}

// What an unsigned ledger still gives you: an in-place edit is caught, either at the entry whose
// hash stops matching or at the next entry whose `prev` does. A wholesale re-chaining of the
// file is not caught — signatures are what close that, and until a key exists the ledger says
// `unsigned` rather than implying more.
export function verifyChain(entries, { publicKeyPem = null } = {}) {
  const problems = [];
  let signed = 0, unsigned = 0, prevHash = null;

  entries.forEach((e, i) => {
    const at = `entry ${i + 1}`;
    if (!e || typeof e !== "object" || !e.record) { problems.push(`${at}: no record`); return; }
    if (receiptHash(e.record) !== e.hash) problems.push(`${at}: hash does not match its record — the record was edited after it was written`);
    if (e.record.prev !== prevHash) problems.push(`${at}: prev is ${e.record.prev ?? "null"} but the previous entry hashes to ${prevHash ?? "null"} — the chain is broken here`);
    prevHash = e.hash;

    if (e.state === "signed") {
      signed++;
      if (publicKeyPem) {
        const ok = crypto.verify(null, Buffer.from(canonicalize(e.record), "utf8"),
          crypto.createPublicKey(publicKeyPem), Buffer.from(e.sig, "base64"));
        if (!ok) problems.push(`${at}: signature does not verify against the supplied key`);
      }
    } else if (e.state === "unsigned") unsigned++;
    else problems.push(`${at}: state "${e.state}" is neither signed nor unsigned`);
  });

  return { problems, signed, unsigned, total: entries.length };
}

function main(argv) {
  const entries = readLedger();
  const { problems, signed, unsigned, total } = verifyChain(entries, {
    publicKeyPem: process.env.BEACON_PUBLIC_KEY_PEM || null,
  });

  console.log(`run-receipt: ${total} receipt(s) · ${signed} signed · ${unsigned} unsigned`);

  if (problems.length) {
    console.error(`\n✗ ${problems.length} chain problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }

  // Loud, every run, and NOT a failure by default: signing needs key material a founder must
  // mint, which is a Red act nobody can automate. Saying so beats quietly implying otherwise.
  if (unsigned) {
    console.log(`\n? ${unsigned} receipt(s) are UNSIGNED — hash-chained, so tamper-evident, but they prove integrity only, not authorship.`);
    console.log(`  Set BEACON_PRIVATE_KEY_PEM and BEACON_PUBLIC_KEY_PEM (a founder mints them) and later receipts sign.`);
    if (argv.includes("--strict")) { console.error(`\n✗ --strict: an unsigned receipt is not a signed one`); return 1; }
  }

  console.log(`\n✓ the receipt chain is intact${signed ? " and every signed receipt verifies" : ""}.`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("run-receipt.mjs")) {
  try { process.exit(main(process.argv.slice(2))); }
  catch (e) {
    if (e instanceof ReceiptError) { console.error(`✗ ${e.message}`); process.exit(1); }
    throw e;
  }
}
