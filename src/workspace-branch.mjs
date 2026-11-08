import { uuid } from './domain.mjs';

/** The bullets of a branch, with fresh ids, ready to add at the top level of another workspace. */
export function branchCopy(doc, rootId, position) {
  const nodes = doc.tables.bullets, children = new Map();
  for (const n of nodes) { const list = children.get(n.parentId) || []; list.push(n); children.set(n.parentId, list); }
  const root = nodes.find(n => n.id === rootId); if (!root) throw Error('That bullet no longer exists.');
  const branch = [root]; for (let i = 0; i < branch.length; i++) branch.push(...(children.get(branch[i].id) || []));
  const ids = new Map(branch.map(n => [n.id, uuid()]));
  return branch.map(n => {
    const copy = { ...n, id: ids.get(n.id), parentId: n.id === rootId ? null : ids.get(n.parentId), position: n.id === rootId ? position : n.position, collapsed: false };
    // Mirrors point into the source workspace; the copy keeps its own text instead.
    delete copy.mirrorSourceId; delete copy.mirrorRootId;
    return copy;
  });
}

