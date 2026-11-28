import {
  noteEmojis,
  emojiFiles,
  mergePortableEmojis,
} from "./portable-emoji.mjs";
import { bullet, uuid } from "./domain.mjs";
const changed = (a, b) => {
  if (a === b) return false;
  if (!a || !b) return true;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === "collapsed" || k === "position" || a[k] === b[k]) continue;
    if (
      typeof a[k] === "object" &&
      typeof b[k] === "object" &&
      JSON.stringify(a[k]) === JSON.stringify(b[k])
    )
      continue;
    return true;
  }
  return false;
};
export function historyChanges(before, after, changedPaths = []) {
  const old = new Map((before?.tables.bullets || []).map((n) => [n.id, n])),
    next = new Map(after.tables.bullets.map((n) => [n.id, n])),
    ids = new Set();
  for (const id of new Set([...old.keys(), ...next.keys()]))
    if (changed(old.get(id), next.get(id))) ids.add(id);
  const bm = before?.tables.media || [],
    am = after.tables.media || [],
    b = new Map(bm.map((m) => [m.id, m])),
    a = new Map(am.map((m) => [m.id, m]));
  for (const id of new Set([...b.keys(), ...a.keys()]))
    if (JSON.stringify(b.get(id)) !== JSON.stringify(a.get(id))) {
      if (b.get(id)?.bulletId) ids.add(b.get(id).bulletId);
      if (a.get(id)?.bulletId) ids.add(a.get(id).bulletId);
    }
  const be = before?.tables.emojis || [],
    ae = after.tables.emojis || [];
  if (be !== ae) {
    const prior = new Map(be.map((e) => [e.token, e])),
      current = new Map(ae.map((e) => [e.token, e]));
    for (const token of new Set([...prior.keys(), ...current.keys()]))
      if (
        JSON.stringify(prior.get(token)) !== JSON.stringify(current.get(token))
      )
        for (const n of [...old.values(), ...next.values()])
          if (n.text.includes(token)) ids.add(n.id);
  }
  for (const m of [...bm, ...am])
    if (changedPaths.includes("media/" + m.fileName)) ids.add(m.bulletId);
  return [...ids]
    .filter(
      (id) => !next.get(id)?.mirrorSourceId && !old.get(id)?.mirrorSourceId,
    )
    .map((id) => ({
      noteId: id,
      before: old.get(id) || null,
      after: next.get(id) || null,
      beforeMedia: bm.filter((m) => m.bulletId === id),
      afterMedia: am.filter((m) => m.bulletId === id),
      beforeEmojis: noteEmojis(before, old.get(id)),
      afterEmojis: noteEmojis(after, next.get(id)),
    }));
}
export function restoreHistoricalNote(
  doc,
  entry,
  version = "before",
  make = uuid,
) {
  const old = entry[version];
  if (!old) throw Error("This version has no note.");
  const id = make(),
    parent = doc.tables.bullets.some((n) => n.id === old.parentId)
      ? old.parentId
      : null;
  const node = bullet(id, {
    text: old.text,
    formatting: old.formatting || "",
    parentId: parent,
    position:
      Math.max(
        -1,
        ...doc.tables.bullets
          .filter((n) => n.parentId === parent)
          .map((n) => n.position),
      ) + 1,
    listType: old.listType || "NONE",
    blockStyle: old.blockStyle || "paragraph",
    codeLanguage: old.codeLanguage || "",
  });
  const fileRemap = new Map();
  const media = (entry[version + "Media"] || []).map((m) => {
    const path = "media/" + m.fileName;
    if (!fileRemap.has(path))
      fileRemap.set(
        path,
        "media/" + make() + "." + (m.fileName.split(".").pop() || "bin"),
      );
    return {
      ...m,
      id: make(),
      bulletId: id,
      fileName: fileRemap.get(path).slice(6),
    };
  });
  return {
    id,
    fileRemap,
    doc: {
      ...doc,
      tables: {
        ...doc.tables,
        bullets: [...doc.tables.bullets, node],
        media: [...doc.tables.media, ...media],
        emojis: mergePortableEmojis(
          doc.tables.emojis,
          entry[version + "Emojis"] || [],
        ),
      },
    },
  };
}
