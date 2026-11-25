import {sharedWebLink} from "./social-posts.mjs";
import { contentDigest } from "./content-digest.mjs";
import { bullet } from "./domain.mjs";
import { withNodes } from "./workspace-nodes.mjs";
import { addBookmark, bookmarkNote } from "./bookmarks.mjs";
import { INBOX_ID } from "./quick-capture.mjs";
export function incomingShare(doc, entry, text, kind = "note") {
  if (
    !entry ||
    entry.schema !== 1 ||
    !/^[-a-f0-9]{36}$/i.test(entry.id) ||
    typeof text !== "string" ||
    !text.trim() ||
    !["note", "bookmark"].includes(kind) ||
    !Number.isSafeInteger(entry.receivedAt) ||
    entry.receivedAt < 0
  )
    throw Error(
      "This share needs valid text. The original remains on this device.",
    );
  const hash = contentDigest(JSON.stringify([kind, text])),
    prior = doc.web.androidShareReceipts?.[entry.id];
  if (prior) {
    if (prior.hash !== hash || prior.kind !== kind)
      throw Error(
        "An earlier version is already in your notes. Finish saving it before editing that note.",
      );
    return { doc, id: prior.id };
  }
  let next = doc,
    id = crypto.randomUUID();
  if (kind === "bookmark") {
    const link = sharedWebLink(text);
    if (!link)
      throw Error(
        "Use one web address to save a bookmark, or save this as a note.",
      );
    const result = addBookmark(doc, link);
    next = bookmarkNote(result.doc, result.bookmark, text, id);
    next = withNodes(
      { ...next, tables: { ...next.tables, bullets: doc.tables.bullets } },
      next.tables.bullets,
    );
    id = next.web.bookmarkNoteRoots[result.bookmark.id];
  } else {
    let nodes = doc.tables.bullets;
    if (!nodes.some((n) => n.id === INBOX_ID))
      nodes = [
        bullet(INBOX_ID, { text: "Inbox" }),
        ...nodes.map((n) =>
          n.parentId === null ? { ...n, position: n.position + 1 } : n,
        ),
      ];
    const position =
      Math.max(
        -1,
        ...nodes.filter((n) => n.parentId === INBOX_ID).map((n) => n.position),
      ) + 1;
    next = withNodes(doc, [
      ...nodes,
      bullet(id, { parentId: INBOX_ID, text, position }),
    ]);
  }
  return {
    doc: {
      ...next,
      web: {
        ...next.web,
        androidShareReceipts: {
          ...next.web.androidShareReceipts,
          [entry.id]: { id, hash, kind, receivedAt: entry.receivedAt },
        },
      },
    },
    id,
  };
}
