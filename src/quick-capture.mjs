// Quick capture (desktop): text typed in the capture box goes under an "Inbox" bullet at the top
// of the open workspace. Each line becomes a bullet; Markdown lists, tasks and formatting work
// as in AI writes (write_notes).
import {bullet} from './domain.mjs';
import {withNodes} from './workspace-nodes.mjs';
import {applyTool} from './mcp-tools.mjs';

export const INBOX_ID = 'quick-capture-inbox';

/** Returns the workspace with the captured text added, and how many bullets were added. */
export function quickCapture(doc, text) {
  let next = doc;
  if (!doc.tables.bullets.some(n => n.id === INBOX_ID)) {
    // Put the Inbox first at the top level.
    const shifted = doc.tables.bullets.map(n => n.parentId === null ? { ...n, position: n.position + 1 } : n);
    next = withNodes(doc, [bullet(INBOX_ID, { text: 'Inbox' }), ...shifted]);
  }
  const r = applyTool(next, 'write_notes', { parent_id: INBOX_ID, markdown: String(text) });
  return { doc: r.doc, added: r.result.ids.length };
}
