// src/core/worktree.js
// WORKTREE MUTATION PATH (#3, self-hosting interim) — let an agent build a real
// code change WITHOUT gVisor, safely. Instead of mutating the working tree, the
// agent writes into an ISOLATED git worktree (a throwaway detached checkout):
//
//   • writes are path-guarded to within the worktree (no escape to the real tree)
//   • the change is captured as a reviewable DIFF + a content hash
//   • it is NEVER committed or pushed here — a human lands it (the irreversibility
//     boundary from CLAUDE.md). The agent PROPOSES; the steward disposes.
//   • the action leaves a signed, metadata-only receipt (path + diff hash, never
//     the diff body)
//
// Worktree isolation is the laptop-safe stand-in for gVisor's blast-radius
// containment: the agent cannot corrupt the main tree, and nothing lands without
// a human reviewing the diff. gVisor (Ticket 4) hardens this further on a Linux
// enclave; the contract is the same.

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as beacon from './beacon.js';

export class WorktreeError extends Error {
  constructor(reason, message) { super(message || reason); this.name = 'WorktreeError'; this.reason = reason; }
}

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' });

export function isGitRepo(dir) {
  try { git(dir, ['rev-parse', '--is-inside-work-tree']); return true; } catch { return false; }
}

export class WorktreeRunner {
  /**
   * @param {Object} opts
   * @param {string}   opts.repoDir   absolute path to the git repo root
   * @param {Function} [opts.emit]    receipt emitter (default beacon.emit)
   */
  constructor({ repoDir, emit } = {}) {
    if (!repoDir) throw new WorktreeError('no-repo', 'repoDir is required');
    if (!isGitRepo(repoDir)) throw new WorktreeError('not-a-repo', `${repoDir} is not a git repository`);
    this.repoDir = repoDir;
    this.emit = emit || ((m) => beacon.emit(m));
  }

  // Reject anything that isn't a clean, repo-relative path (no abs, no `..` escape).
  _safeRel(relPath) {
    const rel = String(relPath || '');
    if (!rel || path.isAbsolute(rel)) throw new WorktreeError('bad-path', 'relPath must be repo-relative');
    const norm = path.normalize(rel);
    if (norm.startsWith('..') || norm.includes(`..${path.sep}`)) throw new WorktreeError('path-escape', `relPath escapes the repo: ${rel}`);
    return norm;
  }

  /**
   * Author a file change in an isolated worktree and PROPOSE it (diff + receipt).
   * Does not commit. Returns { relPath, diff, diffHash, additions, deletions, receipt }.
   */
  proposeFileChange({ relPath, content, parent = null, actor = 'agent:self-host' }) {
    const rel = this._safeRel(relPath);
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'aigov-wt-'));
    try {
      // Detached worktree at HEAD — a clean, isolated copy.
      git(this.repoDir, ['worktree', 'add', '--detach', '--quiet', wt, 'HEAD']);

      // Write the file, guarded to within the worktree.
      const target = path.resolve(wt, rel);
      if (target !== wt && !target.startsWith(wt + path.sep)) throw new WorktreeError('path-escape', 'resolved path escapes the worktree');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, String(content));

      // Capture the diff (staged) — the artifact a human reviews.
      git(wt, ['add', '--', rel]);
      const diff = git(wt, ['diff', '--cached']);
      const stat = git(wt, ['diff', '--cached', '--numstat']).trim();
      const [additions = '0', deletions = '0'] = (stat.split('\n')[0] || '').split('\t');
      const diffHash = crypto.createHash('sha256').update(diff).digest('hex');

      // Metadata-only receipt — path + hash + line counts, never the diff body.
      const receipt = this.emit({
        kind: 'mutation', actor, action: 'file-change-proposed',
        contentHash: diffHash,
        detail: { op: 'file-change-proposed', relPath: rel, additions: Number(additions) || 0, deletions: Number(deletions) || 0, ...(parent ? { parent } : {}) },
      });

      return { relPath: rel, diff, diffHash, additions: Number(additions) || 0, deletions: Number(deletions) || 0, receipt };
    } finally {
      // Always tear down the worktree — the diff/receipt are the durable output.
      try { git(this.repoDir, ['worktree', 'remove', '--force', wt]); } catch { /* best effort */ }
      try { fs.rmSync(wt, { recursive: true, force: true }); } catch { /* already gone */ }
    }
  }
}

export function createWorktreeRunner(opts) { return new WorktreeRunner(opts); }
