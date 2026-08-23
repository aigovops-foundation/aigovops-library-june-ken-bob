#!/usr/bin/env node
// receipts-collect — one receipt per scheduled run, written by ONE workflow.
//
//   node scripts/receipts-collect.mjs            # append receipts for runs not yet recorded
//   node scripts/receipts-collect.mjs --dry-run  # print what it would append, write nothing
//
// WHY A COLLECTOR RATHER THAN A STEP IN EACH WORKFLOW
//
// Seven workflows run on a schedule here. Six of them hold `contents: read`. Having each write
// its own receipt would mean granting six workflows `contents: write` so they can keep a log —
// trading the thing the autonomy policy exists to protect for the record of having protected it.
//
// So one workflow collects. The hourly crawl already holds `contents: write` with a declared
// path allowlist, and it gains `actions: read`, which is inside the green class. One writer, one
// allowlist entry, six workflows unchanged.
//
// It also makes the record better. A job reporting its own success is a self-report; a receipt
// built from what the Actions API says about a completed run is an observation. A job that dies
// cannot suppress its own receipt, which is exactly the run you most want recorded.
//
// The cost, stated plainly: a receipt is written up to an hour after the run it describes, and
// if the collector itself never runs, nothing is recorded at all. The ledger says when it last
// collected so that gap is visible rather than assumed away.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRunReceipt, seal, appendEntry, readLedger, lastHash, LEDGER } from "./run-receipt.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS = join(ROOT, ".github", "workflows");

// The watch list is DERIVED, never maintained. A new scheduled workflow is covered the moment
// it lands, because coverage is a property of the query, not of a list someone has to remember.
export function scheduledWorkflows(dir = WORKFLOWS) {
  return readdirSync(dir).filter((f) => f.endsWith(".yml")).sort()
    .filter((f) => /^on:/m.test(readFileSync(join(dir, f), "utf8")) &&
                   /^\s{2}schedule:/m.test(readFileSync(join(dir, f), "utf8")));
}

export const runKey = (r) => `${r.runId}#${r.runAttempt ?? 1}`;

export function recorded(entries) {
  return new Set(entries.map((e) => runKey(e.record)));
}

// Maps one Actions API run object to the fields a receipt is allowed to carry. Everything else
// the API returns — titles, branch names, actor logins, commit messages — is dropped here, on
// purpose: none of it is needed to prove a run happened, and some of it is personal data.
export function toReceiptInput(run) {
  return {
    ts: new Date().toISOString(),
    actor: `workflow:${run.name}`,
    action: run.event === "schedule" ? "scheduled" : String(run.event),
    workflow: String(run.name),
    runId: String(run.id),
    runAttempt: Number(run.run_attempt ?? 1),
    event: String(run.event),
    conclusion: String(run.conclusion),
    sha: String(run.head_sha ?? "").slice(0, 40),
    startedAt: String(run.run_started_at ?? run.created_at ?? ""),
    endedAt: String(run.updated_at ?? ""),
  };
}

// `fetchJson` is injected so this is testable without a network or a token.
export async function collect({ fetchJson, entries = [], env = process.env, limit = 100 }) {
  const repo = env.GITHUB_REPOSITORY;
  if (!repo) throw new Error("GITHUB_REPOSITORY is not set — the collector does not guess which repository it is in");

  const runs = await fetchJson(
    `https://api.github.com/repos/${repo}/actions/runs?event=schedule&status=completed&per_page=${limit}`);
  const list = (runs?.workflow_runs ?? []).filter((r) => r?.id && r?.conclusion);

  const seen = recorded(entries);
  // Oldest first, so the chain reads forward in time rather than in API order.
  const fresh = list
    .map(toReceiptInput)
    .filter((r) => !seen.has(runKey(r)))
    .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));

  const out = [];
  let prev = lastHash(entries);
  for (const input of fresh) {
    const entry = seal(buildRunReceipt(input, prev), env);
    out.push(entry);
    prev = entry.hash;
  }
  return out;
}

async function main(argv) {
  const token = process.env.GITHUB_TOKEN;
  const fetchJson = async (url) => {
    const res = await fetch(url, {
      headers: {
        accept: "application/vnd.github+json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}`);
    return res.json();
  };

  const entries = readLedger();
  const fresh = await collect({ fetchJson, entries });

  const watched = scheduledWorkflows();
  console.log(`receipts-collect: ${watched.length} scheduled workflow(s) watched · ${entries.length} receipt(s) on file · ${fresh.length} new`);

  if (!fresh.length) { console.log("nothing new to record."); return 0; }

  for (const e of fresh) {
    console.log(`  ${e.state.padEnd(8)} ${e.record.workflow} run ${e.record.runId} — ${e.record.conclusion}`);
    if (!argv.includes("--dry-run")) appendEntry(e, LEDGER);
  }
  if (argv.includes("--dry-run")) console.log("\n--dry-run: nothing written.");
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("receipts-collect.mjs")) {
  main(process.argv.slice(2)).then((c) => process.exit(c)).catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
}
