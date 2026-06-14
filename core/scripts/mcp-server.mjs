#!/usr/bin/env node
// core/scripts/mcp-server.mjs
// GOVERNED-CORE MCP SERVER (Ticket A2) — dependency-free.
// Exposes the governed loop as MCP tools over stdio (newline-delimited JSON-RPC
// 2.0), so any MCP client (e.g. Claude Code) can build *through* the Yes-Gate:
//   gov_propose -> gov_decide (human) -> gov_run_tool (sandboxed) -> gov_verify
//   plus skills_list / skills_run (Ticket A1).
//
// Run:  node core/scripts/mcp-server.mjs    (then speak MCP on stdin/stdout)
// No SDK, no node_modules — just node: built-ins and the core.

// Protect the protocol stream: anything that would console.log (e.g. beacon's
// first-run key-generation notice) must go to stderr, never stdout.
console.log = (...a) => console.error(...a);

import { createGovernedCore } from '../src/core/govapi.js';
import { dispatch as agentDispatch, listAgents } from '../src/core/agents.js';
import { identify } from '../src/core/identity.js';

const core = createGovernedCore();
const PROTOCOL_VERSION = '2024-11-05';

// A2: the MCP stdio server is a SINGLE trusted principal — its identity is
// resolved server-side from the launch environment, NEVER from client-supplied
// tool args (which a caller could forge to claim steward). Default is a member
// scoped to its own effects; steward requires explicit opt-in by whoever ran the
// process. In a networked deployment the transport carries an OIDC token and
// auth.identityFromReq resolves the caller instead.
const PRINCIPAL = (process.env.AIGOV_MCP_ROLE === 'steward' || (process.env.STEWARD_TOKEN && process.env.AIGOV_MCP_STEWARD === process.env.STEWARD_TOKEN))
  ? identify({ id: process.env.AIGOV_MCP_ID || 'mcp:steward', role: 'steward' })
  : identify({ id: process.env.AIGOV_MCP_ID || 'mcp:local', role: 'member' });

const TOOLS = [
  { name: 'gov_propose', description: 'Submit an intent for a human gate. Returns a pendingId and whether it needs approval.',
    inputSchema: { type: 'object', properties: { intent: { type: 'string' }, actor: { type: 'string' } }, required: ['intent'] } },
  { name: 'gov_decide', description: 'Human decision on a pending proposal. On approve (and within caps) brokers a scoped token; deny brokers nothing.',
    inputSchema: { type: 'object', properties: { pendingId: { type: 'string' }, decision: { enum: ['approve', 'deny'] }, scope: { type: 'string' }, ttlSeconds: { type: 'number' }, requiredLevel: { type: 'string' }, spend: { type: 'number' } }, required: ['pendingId', 'decision'] } },
  { name: 'gov_run_tool', description: 'Run tool code in the sandbox. Requires a valid brokered token (fails closed). Emits a tool-run receipt.',
    inputSchema: { type: 'object', properties: { token: { type: 'string' }, code: { type: 'string' }, allowedEgress: { type: 'array', items: { type: 'string' } } }, required: ['token', 'code'] } },
  { name: 'gov_verify', description: 'Verify the whole ledger (signatures + hash chain).',
    inputSchema: { type: 'object', properties: {} } },
  { name: 'skills_list', description: 'List the available skills and whether each is runnable.',
    inputSchema: { type: 'object', properties: {} } },
  { name: 'skills_run', description: 'Run a skill by name through the gate+ledger (Ticket A1).',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, input: { type: 'string' }, meta: { type: 'object' }, approve: { type: 'boolean' } }, required: ['name'] } },
  { name: 'oversight_view', description: 'Role-scoped view of the ledger for THIS server\'s principal (resolved server-side from the launch context — role/id args are ignored and cannot be forged): a steward sees all receipts; a member sees only their own. (The kill switch is a steward-console action, not exposed here.)',
    inputSchema: { type: 'object', properties: {} } },
  { name: 'agent_dispatch', description: 'Front desk: route an intent to the right named agent (Lantern/Guardian/Aperture/Herald/Sentinel/Beacon/Concierge), run its skill, and return its reply + a proposal. Propose-only — never auto-acts.',
    inputSchema: { type: 'object', properties: { intent: { type: 'string' } }, required: ['intent'] } },
  { name: 'agent_list', description: 'List the named library agents and the skill each wields.',
    inputSchema: { type: 'object', properties: {} } },
];

async function callTool(name, a = {}) {
  switch (name) {
    case 'gov_propose':  return core.propose(a.intent, { actor: PRINCIPAL.id });
    case 'gov_decide':   return core.decide(a.pendingId, a.decision, { scope: a.scope, ttlSeconds: a.ttlSeconds, cost: { requiredLevel: a.requiredLevel, spend: a.spend }, decidedBy: PRINCIPAL.id });
    case 'gov_run_tool': return await core.runTool({ token: a.token, code: a.code, allowedEgress: a.allowedEgress });
    case 'gov_verify':   return core.verify();
    case 'skills_list':  return core.skills.list();
    case 'skills_run':   return core.skills.run(a.name, { input: a.input, meta: a.meta, approve: a.approve });
    case 'oversight_view': return core.oversight(PRINCIPAL).view(); // role from the trusted principal, not the args
    case 'agent_dispatch': return await agentDispatch(a.intent);
    case 'agent_list':   return listAgents();
    default: throw new Error('unknown tool: ' + name);
  }
}

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }
const ok = (id, result) => send({ jsonrpc: '2.0', id, result });
const err = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;
  try {
    switch (method) {
      case 'initialize':
        return ok(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'aigovops-governed-core', version: '0.1.0' } });
      case 'notifications/initialized':
        return; // notification — no reply
      case 'ping':
        return ok(id, {});
      case 'tools/list':
        return ok(id, { tools: TOOLS });
      case 'tools/call': {
        const result = await callTool(params?.name, params?.arguments || {});
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      }
      default:
        if (!isNotification) err(id, -32601, 'method not found: ' + method);
        return;
    }
  } catch (e) {
    // Tool-level failures (e.g. a denied/failed-closed action) come back as a
    // tool result marked isError, not a protocol error — the agent can read them.
    if (method === 'tools/call') return ok(id, { content: [{ type: 'text', text: 'error: ' + e.message }], isError: true });
    if (!isNotification) err(id, -32603, e.message);
  }
}

// --- stdio transport: newline-delimited JSON-RPC ------------------------------
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    handle(msg);
  }
});
process.stdin.on('end', () => process.exit(0));
console.error('[mcp] aigovops governed-core MCP server ready on stdio');
