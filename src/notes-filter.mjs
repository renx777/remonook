import { index, indexedRows } from "./domain.mjs";

/** Filters shown above the Notes outline. */
export const NOTE_FILTERS = [
  ["all", "All"],
  ["flashcards", "Flashcards"],
  ["mcqs", "MCQs"],
  ["mindmaps", "Mindmaps"],
  ["bookmarks", "Bookmarks"],
  ["pdfs", "PDFs"],
];

function matcher(doc, kind) {
  const web = doc.web || {},
    mcqs = web.mcqs || {};
  if (kind === "flashcards") {
    const decks = new Set((doc.tables.decks || []).map((d) => d.rootId));
    return (n) => decks.has(n.id) || (n.kind === "QUESTION" && !mcqs[n.id]);
  }
  if (kind === "mcqs") return (n) => !!mcqs[n.id];
  if (kind === "mindmaps") return (n) => !!n.mindmap;
  if (kind === "bookmarks") {
    const roots = new Set(Object.values(web.bookmarkNoteRoots || {}));
    return (n) => roots.has(n.id);
  }
  if (kind === "pdfs") {
    const roots = new Set(Object.values(web.readingNoteRoots || {}));
    return (n) => roots.has(n.id);
  }
  return null;
}

/**
 * Whole bullets of one kind inside `scope` (null = everywhere), outermost only and in
 * outline order. A bullet inside another matching bullet already shows with its parent.
 * @param {any} doc @param {string} kind @param {string|null} [scope] @param {any} [idx]
 * @returns {string[] | null} null for "all"
 */
export function filterRoots(doc, kind, scope = null, idx = index(doc.tables.bullets)) {
  const match = matcher(doc, kind);
  if (!match) return null;
  const out = [];
  // Walk the full tree (collapsed included) in outline order; skip a matched bullet's subtree.
  const stack = (idx.children.get(scope) || []).slice().reverse();
  while (stack.length) {
    const n = stack.pop();
    if (match(n)) {
      out.push(n.id);
      continue;
    }
    const children = idx.children.get(n.id) || [];
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
  return out;
}

/** Counts for every filter at once, for the tab labels. @param {any} doc @param {string|null} [scope] @returns {Record<string, number>} */
export function filterCounts(doc, scope = null) {
  const idx = index(doc.tables.bullets),
    counts = {};
  for (const [kind] of NOTE_FILTERS)
    if (kind !== "all") counts[kind] = filterRoots(doc, kind, scope, idx).length;
  return counts;
}

/** Rows for the given root bullets, each followed by its visible subtree. */
export function rootRows(idx, rootIds, expand = false) {
  const out = [];
  for (const id of rootIds) {
    const node = idx.byId.get(id);
    if (!node) continue;
    out.push({ bullet: node, depth: 0 });
    if (expand || !node.collapsed)
      for (const row of indexedRows(idx, id, expand)) out.push({ ...row, depth: row.depth + 1 });
  }
  return out;
}
