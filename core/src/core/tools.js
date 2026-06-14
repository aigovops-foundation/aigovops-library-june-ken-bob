// src/core/tools.js
// VETTED TOOL REGISTRY (#3) — the effectful sibling of the skill registry.
// A skill is read-only analysis; a TOOL does something. Each tool DECLARES its
// safety envelope up front — the scope it needs, where it may egress, the
// capability level it requires, and whether it needs a kernel sandbox — so the
// gate enforces the envelope instead of trusting per-call arguments.
//
//   run a tool  ⇒  present a brokered token for the tool's requiredScope
//               ⇒  the token's scope MUST equal the tool's requiredScope
//               ⇒  it runs sandboxed with the tool's DECLARED egress (not the
//                  caller's), under caps, leaving a signed receipt.
//
// Tools that mutate real resources (fs/git/network) set requiresKernelSandbox:
// they refuse to run unless the sandbox is kernel-enforced (gVisor), because the
// laptop ProcessSandbox has a documented application-level bypass. On a laptop
// they fail closed with a clear "needs an enclave host" error — never a silent
// unsandboxed run.

export class ToolError extends Error {
  constructor(reason, message) { super(message || reason); this.name = 'ToolError'; this.reason = reason; }
}

const REQUIRED = ['name', 'description', 'requiredScope', 'code'];

export class ToolRegistry {
  constructor() { this._tools = new Map(); }

  register(tool) {
    for (const k of REQUIRED) if (!tool[k]) throw new ToolError('bad-tool', `tool missing '${k}'`);
    const full = {
      requiredLevel: 'act',
      allowedEgress: [],
      requiresKernelSandbox: false,
      ...tool,
    };
    this._tools.set(full.name, full);
    return full;
  }

  get(name) { return this._tools.get(name) || null; }

  // Public (no code body) view for listing to agents/clients.
  list() {
    return [...this._tools.values()].map(({ name, description, requiredScope, requiredLevel, allowedEgress, requiresKernelSandbox }) =>
      ({ name, description, requiredScope, requiredLevel, allowedEgress, requiresKernelSandbox }));
  }
}

// Inject the call input into the sandboxed module as a top-level INPUT constant.
// JSON.stringify escaping prevents breaking out of the literal.
export function buildToolCode(tool, input) {
  return `const INPUT = ${JSON.stringify(input ?? null)};\n${tool.code}`;
}

// --- built-in vetted tools ---------------------------------------------------
// Laptop-safe (pure compute / scratch-only) run under any sandbox. The
// kernel-only ones declare their envelope and fail closed without gVisor.
export const BUILTIN_TOOLS = [
  {
    name: 'echo',
    description: 'Return the input unchanged (smallest proof of the tool path).',
    requiredScope: 'demo', requiredLevel: 'read',
    code: `export default async () => ({ echoed: INPUT });`,
  },
  {
    name: 'sha256',
    description: 'Hash INPUT.text with SHA-256 (pure compute, no egress).',
    requiredScope: 'demo', requiredLevel: 'read',
    code: `import crypto from 'node:crypto';
export default async () => ({ sha256: crypto.createHash('sha256').update(String((INPUT && INPUT.text) || '')).digest('hex') });`,
  },
  {
    name: 'scratch-write',
    description: 'Write INPUT.text to a file in the sandbox scratch dir and read it back (no escape).',
    requiredScope: 'demo', requiredLevel: 'act',
    code: `import fs from 'node:fs';
import path from 'node:path';
export default async ({ scratchDir }) => {
  const f = path.join(scratchDir, 'out.txt');
  fs.writeFileSync(f, String((INPUT && INPUT.text) || ''));
  return { wrote: 'out.txt', readBack: fs.readFileSync(f, 'utf8') };
};`,
  },
  {
    name: 'http-get',
    description: 'GET INPUT.url — only reachable hosts are this tool\'s declared egress. Egress is enforced at the proxy under gVisor.',
    requiredScope: 'http', requiredLevel: 'act',
    allowedEgress: ['api.github.com:443'],
    requiresKernelSandbox: true,    // egress is only trustworthy under the kernel proxy
    code: `export default async () => {
  const r = await fetch(String((INPUT && INPUT.url) || ''));
  return { status: r.status };
};`,
  },
  {
    name: 'git-commit',
    description: 'Stage + commit in a repo worktree (real filesystem mutation).',
    requiredScope: 'github-deploy', requiredLevel: 'act',
    requiresKernelSandbox: true,    // real fs/exec — never on the laptop fallback
    code: `import { execFileSync } from 'node:child_process';
export default async () => {
  execFileSync('git', ['add', '-A']);
  execFileSync('git', ['commit', '-m', String((INPUT && INPUT.message) || 'governed commit')]);
  return { committed: true };
};`,
  },
];

export function createToolRegistry({ builtins = true } = {}) {
  const reg = new ToolRegistry();
  if (builtins) for (const t of BUILTIN_TOOLS) reg.register(t);
  return reg;
}
