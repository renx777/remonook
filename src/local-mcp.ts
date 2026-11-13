// Local AI apps (desktop): answers MCP requests that src-tauri/src/local_mcp.rs receives on
// 127.0.0.1. It offers the same tools as the cloud MCP (src/mcp-tools.mjs) on the workspace that
// is open in the app, and saves changes through the editor's normal path, so they can be undone
// and (for the synced workspace) sync like any edit.
import type { Workspace } from './data-store';

export type LocalAccess = 'read' | 'write' | 'delete';
export type LocalActivity = { tool: string; summary: string; at: number; workspace: string };
const ACCESS_KEY = 'remo-local-mcp-access', ACTIVITY_KEY = 'remo-local-mcp-activity';
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export function localAccess(): LocalAccess {
  try { const v = localStorage.getItem(ACCESS_KEY); return v === 'read' || v === 'delete' ? v : 'write'; } catch { return 'write'; }
}
export function setLocalAccess(v: LocalAccess) { try { localStorage.setItem(ACCESS_KEY, v); } catch { /* storage unavailable */ } }
export function localActivity(): LocalActivity[] {
  try { const v = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function remember(entry: LocalActivity) {
  try { localStorage.setItem(ACTIVITY_KEY, JSON.stringify([entry, ...localActivity()].slice(0, 50))); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event('remo-local-mcp-activity'));
}
const allowed = (scope: string, access: LocalAccess) => scope === 'read' || (scope === 'write' && access !== 'read') || (scope === 'delete' && access === 'delete');

export type LocalMcpDeps = {
  /** The open workspace, or null while it is loading. */
  getDoc: () => Workspace | null;
  /** Saves a changed workspace through the editor (undoable) and resolves once it is stored. */
  apply: (next: Workspace) => Promise<void>;
  workspaceName: () => string;
  access?: () => LocalAccess;
};

const replayed = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();

/** Handles one HTTP body (a JSON-RPC message or batch). Returns '' when nothing is to be sent. */
export function handleLocalMcp(body: string, deps: LocalMcpDeps): Promise<string> {
  // One request at a time, so writes never interleave.
  const run = queue.then(() => answer(body, deps));
  queue = run.catch(() => {});
  return run;
}

async function answer(body: string, deps: LocalMcpDeps): Promise<string> {
  let message: any;
  try { message = JSON.parse(body); } catch { return JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  const batch = Array.isArray(message), replies = [];
  for (const m of batch ? message.slice(0, 20) : [message]) { const r = await one(m, deps); if (r) replies.push(r); }
  return replies.length ? JSON.stringify(batch ? replies : replies[0]) : '';
}

async function one(m: any, deps: LocalMcpDeps) {
  if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return { jsonrpc: '2.0', id: m?.id ?? null, error: { code: -32600, message: 'Invalid request' } };
  if (m.id === undefined || m.id === null) return null;
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result });
  const { TOOLS, INSTRUCTIONS, readTool, applyTool } = await import('./mcp-tools.mjs');
  const access = deps.access?.() ?? localAccess();
  if (m.method === 'initialize') {
    const asked = m.params?.protocolVersion;
    return ok({ protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'RemoNook (this computer)', version: '1.0.0' }, instructions: INSTRUCTIONS + ' This connection uses the workspace that is open in the RemoNook desktop app.' });
  }
  if (m.method === 'ping') return ok({});
  if (m.method === 'tools/list') return ok({ tools: TOOLS.filter((t: any) => allowed(t.scope, access)).map(({ scope, ...t }: any) => ({ ...t, annotations: { readOnlyHint: scope === 'read', destructiveHint: scope === 'delete', idempotentHint: scope === 'read' } })) });
  if (m.method !== 'tools/call') return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } };
  const name = m.params?.name, args = m.params?.arguments && typeof m.params.arguments === 'object' ? m.params.arguments : {};
  const text = (t: string, isError = false, structured?: unknown) => ok({ content: [{ type: 'text', text: t }], ...(structured ? { structuredContent: structured } : {}), ...(isError ? { isError: true } : {}) });
  try {
    const tool = TOOLS.find((t: any) => t.name === name);
    if (!tool) return text(`Unknown tool ${name}.`, true);
    if (!allowed(tool.scope, access)) return text(tool.scope === 'delete' ? 'This computer\'s AI apps may not delete notes. Allow deleting in RemoNook Settings, Desktop.' : 'This computer\'s AI apps have read-only access. Allow editing in RemoNook Settings, Desktop.', true);
    const doc = deps.getDoc();
    if (!doc) return text('RemoNook is still opening the workspace. Try again in a moment.', true);
    if (name === 'recent_changes') {
      const list = localActivity().slice(0, Math.max(1, Math.min(50, Number(args.limit) || 20)));
      return text(list.map(a => `- ${new Date(a.at).toISOString()} ${a.tool}: ${a.summary} (${a.workspace})`).join('\n') || 'No changes from AI apps on this computer yet.');
    }
    if (tool.scope === 'read') { const r = readTool(doc, name, args)!; return text(r.text, false, r.structured); }
    const key = typeof args.idempotency_key === 'string' && args.idempotency_key ? args.idempotency_key.slice(0, 200) : '';
    if (key && replayed.has(key)) return text('Already applied (same idempotency key). Nothing changed.');
    const { doc: next, result } = applyTool(doc, name, args)!;
    await deps.apply(next);
    remember({ tool: name, summary: result.summary, at: Date.now(), workspace: deps.workspaceName() });
    if (key) { replayed.set(key, result.summary); if (replayed.size > 200) replayed.delete(replayed.keys().next().value!); }
    return text(result.text || result.summary, false, { ids: result.ids });
  } catch (e: any) {
    return text(e?.status && e.status < 500 ? e.message : `RemoNook could not complete this. Nothing was changed. ${e?.message || ''}`.trim(), true);
  }
}
