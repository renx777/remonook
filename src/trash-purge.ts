import { references, type Workspace } from "./data";
/** Purge the reviewed IDs only. References in live notes and remaining trash win. */
export function planTrashPurge(doc: Workspace, ids: string[]) {
  const selected = new Set(ids),
    entries = doc.tables.trash.filter((t) => selected.has(t.id));
  const next = {
    ...doc,
    tables: {
      ...doc.tables,
      trash: doc.tables.trash.filter((t) => !selected.has(t.id)),
    },
  };
  const refs = references(next),
    candidates = new Set<string>();
  for (const entry of entries) {
    const payload = JSON.parse(entry.payload);
    for (const media of payload.media || []) {
      if (
        typeof media.fileName !== "string" ||
        !/^[A-Za-z0-9._-]+$/.test(media.fileName) ||
        [".", ".."].includes(media.fileName)
      )
        throw Error("Invalid attachment in Trash.");
      candidates.add("media/" + media.fileName);
    }
  }
  return {
    next,
    removed: [...candidates].filter((path) => !refs.has(path)),
    count: entries.length,
    bullets: entries.reduce((n, t) => n + t.nodeCount, 0),
  };
}
