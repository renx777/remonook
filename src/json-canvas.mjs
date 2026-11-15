// JSON Canvas 1.0 interchange. Editable text lives in ordinary outline rows.
import { bullet, descendants, move } from "./domain.mjs";
import { bulletMarkdown } from "./ai-markdown.mjs";
import { withNodes } from "./workspace-nodes.mjs";
// All boards keep their backing bullets under one top-level "Canvases" bullet in Notes.
export const CANVAS_HOME_TITLE = "Canvases";
export const canvasNoteText = (note, card) =>
  note
    ? card.markdown && !note.formatting
      ? note.text
      : bulletMarkdown(note)
    : card.text || "";
export const CANVAS_LIMITS = {
  bytes: 2 * 1024 * 1024,
  nodes: 400,
  edges: 800,
  boards: 40,
};
const nodeKeys = new Set([
  "id",
  "type",
  "text",
  "file",
  "subpath",
  "url",
  "label",
  "background",
  "backgroundStyle",
  "color",
]);
const edgeKeys = new Set([
  "id",
  "fromNode",
  "toNode",
  "fromSide",
  "toSide",
  "fromEnd",
  "toEnd",
  "label",
  "color",
]);
const split = (value, keys) => ({
  known: Object.fromEntries(Object.entries(value).filter(([k]) => keys.has(k))),
  extra: Object.fromEntries(
    Object.entries(value).filter(([k]) => !keys.has(k)),
  ),
});
const record = (o) => o && typeof o === "object" && !Array.isArray(o);
const safeId = (id) =>
  typeof id === "string" &&
  id.length > 0 &&
  id.length <= 200 &&
  !["__proto__", "constructor", "prototype"].includes(id);
const fail = (message) => {
  throw Error("Invalid canvas: " + message);
};
const sides = ["top", "right", "bottom", "left"];
export const safeCanvasUrl = (value) => {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol);
  } catch {
    return false;
  }
};
const color = (value) =>
  value === undefined ||
  (typeof value === "string" &&
    (/^[1-6]$/.test(value) || /^#[a-f\d]{6}$/i.test(value)));
function safeTree(value, depth = 0) {
  if (depth > 30) fail("too deeply nested.");
  if (record(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(k))
        fail("unsafe property.");
      safeTree(v, depth + 1);
    }
  } else if (Array.isArray(value))
    for (const v of value) safeTree(v, depth + 1);
}
export function parseCanvas(input) {
  const text = typeof input === "string" ? input : JSON.stringify(input);
  if (new TextEncoder().encode(text).length > CANVAS_LIMITS.bytes)
    fail("file exceeds 2 MiB.");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail("not valid JSON.");
  }
  safeTree(value);
  if (!record(value)) fail("expected an object.");
  const nodes = value.nodes === undefined ? [] : value.nodes,
    edges = value.edges === undefined ? [] : value.edges;
  if (
    !Array.isArray(nodes) ||
    !Array.isArray(edges) ||
    nodes.length > CANVAS_LIMITS.nodes ||
    edges.length > CANVAS_LIMITS.edges
  )
    fail("too many cards or connections.");
  const ids = new Set();
  for (const n of nodes) {
    if (!record(n) || !safeId(n.id) || ids.has(n.id))
      fail("duplicate or invalid card id.");
    ids.add(n.id);
    if (!["text", "file", "link", "group"].includes(n.type))
      fail("unknown card type.");
    for (const k of ["x", "y", "width", "height"])
      if (
        !Number.isSafeInteger(n[k]) ||
        Math.abs(n[k]) > 1e7 ||
        ((k === "width" || k === "height") && n[k] <= 0)
      )
        fail("invalid card geometry.");
    if (!color(n.color)) fail("invalid color.");
    if (n.type === "text" && typeof n.text !== "string")
      fail("text card needs Markdown.");
    if (
      n.type === "file" &&
      (typeof n.file !== "string" ||
        !n.file ||
        (n.subpath !== undefined &&
          (typeof n.subpath !== "string" || !n.subpath.startsWith("#"))))
    )
      fail("invalid file reference.");
    if (
      n.type === "link" &&
      (typeof n.url !== "string" || !safeCanvasUrl(n.url))
    )
      fail("link must use https or http.");
    if (
      n.type === "group" &&
      ((n.label !== undefined && typeof n.label !== "string") ||
        (n.background !== undefined && typeof n.background !== "string") ||
        (n.backgroundStyle !== undefined &&
          !["cover", "ratio", "repeat"].includes(n.backgroundStyle)))
    )
      fail("invalid group.");
  }
  const edgeIds = new Set();
  for (const e of edges) {
    if (
      !record(e) ||
      !safeId(e.id) ||
      edgeIds.has(e.id) ||
      !ids.has(e.fromNode) ||
      !ids.has(e.toNode)
    )
      fail("invalid connection.");
    edgeIds.add(e.id);
    if (
      !color(e.color) ||
      (e.label !== undefined && typeof e.label !== "string")
    )
      fail("invalid connection label or color.");
    for (const k of ["fromSide", "toSide"])
      if (e[k] !== undefined && !sides.includes(e[k]))
        fail("invalid connection side.");
    for (const k of ["fromEnd", "toEnd"])
      if (e[k] !== undefined && !["none", "arrow"].includes(e[k]))
        fail("invalid arrow.");
  }
  return { ...value, nodes, edges };
}
// The "Canvases" bullet: the parent of existing board bullets, else a top-level bullet of that name.
export function canvasHomeId(doc) {
  const rows = doc.tables.bullets,
    byId = new Map(rows.map((r) => [r.id, r]));
  for (const b of Object.values(doc.web.canvases || {})) {
    const parent = byId.get(byId.get(b.rootId)?.parentId);
    if (parent && !parent.parentId && parent.text === CANVAS_HOME_TITLE)
      return parent.id;
  }
  return (
    rows.find((r) => !r.parentId && r.text === CANVAS_HOME_TITLE)?.id || null
  );
}
// Boards made before the "Canvases" bullet existed sit at the top of Notes: file them under it.
export function adoptCanvasRoots(doc, uuid = () => crypto.randomUUID()) {
  const byId = new Map(doc.tables.bullets.map((r) => [r.id, r]));
  const loose = Object.values(doc.web.canvases || {}).filter(
    (b) => byId.has(b.rootId) && !byId.get(b.rootId).parentId,
  );
  if (!loose.length) return doc;
  let rows = [...doc.tables.bullets],
    homeId = canvasHomeId(doc);
  if (!homeId) {
    homeId = uuid();
    rows.push(
      bullet(homeId, {
        text: CANVAS_HOME_TITLE,
        parentId: null,
        position: rows.filter((n) => !n.parentId).length,
      }),
    );
  }
  for (const b of loose)
    rows = move(
      rows,
      b.rootId,
      homeId,
      rows.filter((n) => n.parentId === homeId).length,
    );
  return withNodes(doc, rows);
}
// The board's name is its bullet's text, so renaming either one renames both.
export function canvasTitle(doc, board) {
  const root = doc.tables.bullets.find((r) => r.id === board.rootId);
  return (root ? root.text : board.title) || "Untitled canvas";
}
export function renameCanvas(doc, id, title) {
  const next = changeCanvas(doc, id, (b) => ({ ...b, title }));
  const rootId = next.web.canvases[id].rootId;
  if (!next.tables.bullets.some((r) => r.id === rootId)) return next;
  return withNodes(
    next,
    next.tables.bullets.map((r) => (r.id === rootId ? { ...r, text: title } : r)),
  );
}
// The highest stacking order on a board plus one (tombstones included, so orders never repeat).
export const nextCanvasOrder = (b) =>
  Math.max(-1, ...Object.values(b.nodes).map((n) => n.order)) + 1;
// The last text of a bullet that is now in Trash, so a card whose note was deleted shows current text.
export function trashedBullet(doc, id) {
  for (const entry of doc.tables.trash || []) {
    try {
      const rows = Array.isArray(entry.nodes)
        ? entry.nodes
        : JSON.parse(entry.payload || "{}").nodes;
      const row = rows?.find?.((r) => r?.id === id);
      if (row) return row;
    } catch {
      /* unreadable entry */
    }
  }
  return undefined;
}
export function canvasBoards(doc) {
  return Object.values(doc.web.canvases || {}).filter((b) => !b.removed);
}
export function changeCanvas(doc, id, update) {
  const board = doc.web.canvases?.[id];
  if (!board || board.removed)
    throw Error("This canvas is no longer available.");
  return {
    ...doc,
    web: { ...doc.web, canvases: { ...doc.web.canvases, [id]: update(board) } },
  };
}
export function createCanvas(
  doc,
  title = "Untitled canvas",
  input = { nodes: [], edges: [] },
  uuid = () => crypto.randomUUID(),
) {
  if (canvasBoards(doc).length >= CANVAS_LIMITS.boards)
    throw Error("Keep up to 40 active canvases.");
  const parsed = parseCanvas(input),
    id = uuid(),
    rows = [...doc.tables.bullets],
    nodes = {},
    edges = {};
  let homeId = canvasHomeId(doc);
  if (!homeId) {
    homeId = uuid();
    rows.push(
      bullet(homeId, {
        text: CANVAS_HOME_TITLE,
        parentId: null,
        position: rows.filter((n) => !n.parentId).length,
      }),
    );
  }
  const rootId = uuid();
  rows.push(
    bullet(rootId, {
      text: title,
      parentId: homeId,
      position: rows.filter((n) => n.parentId === homeId).length,
    }),
  );
  parsed.nodes.forEach((n, order) => {
    const { x, y, width, height, ...rest } = n;
    const { known, extra } = split(rest, nodeKeys);
    let noteId;
    if (n.type === "text") {
      noteId = uuid();
      rows.push(
        bullet(noteId, { text: n.text, parentId: rootId, position: order }),
      );
    }
    nodes[n.id] = {
      ...known,
      extra,
      position: [x, y],
      size: [width, height],
      order,
      ...(noteId ? { noteId, markdown: true } : {}),
    };
  });
  for (const e of parsed.edges) {
    const { known, extra } = split(e, edgeKeys);
    edges[e.id] = { ...known, extra };
  }
  const { nodes: ignored, edges: ignoredEdges, ...extensions } = parsed;
  const board = {
    id,
    title,
    rootId,
    createdAt: Date.now(),
    nodes,
    edges,
    extensions,
  };
  return {
    id,
    doc: {
      ...doc,
      tables: { ...doc.tables, bullets: rows },
      web: { ...doc.web, canvases: { ...doc.web.canvases, [id]: board } },
    },
  };
}
export function exportCanvas(doc, id) {
  const b = doc.web.canvases?.[id];
  if (!b) throw Error("Canvas not found.");
  const live = Object.values(b.nodes)
      .filter((n) => !n.removed)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    ids = new Set(live.map((n) => n.id));
  const nodes = live.map((n) => {
    const {
      position,
      size,
      order,
      noteId,
      markdown,
      removed,
      compact,
      extra,
      ...standard
    } = n;
    const result = {
      ...extra,
      ...standard,
      x: position[0],
      y: position[1],
      width: size[0],
      height: size[1],
    };
    if (n.type === "text") {
      const note = doc.tables.bullets.find(
        (row) => row.id === noteId && !row.deleted,
      );
      result.text = canvasNoteText(note || trashedBullet(doc, noteId), n);
    }
    return result;
  });
  const edges = Object.values(b.edges)
    .filter((e) => !e.removed && ids.has(e.fromNode) && ids.has(e.toNode))
    .map(({ removed, extra, ...e }) => ({ ...extra, ...e }));
  return { ...b.extensions, nodes, edges };
}
// Removed cards and connections keep a small stub (their key, type, place and links), never
// deleted outright: sync merges field by field, so a device that edits a card while another removes
// it must still find a complete record. Text, labels, colours and unknown properties are dropped.
export function tombstoneNode(n) {
  const { extra, text, label, color, markdown, compact, background, backgroundStyle, subpath, ...keep } = n;
  return { ...keep, ...(n.type === "text" ? { text: "" } : {}), removed: true };
}
export const tombstoneEdge = (e) => ({ id: e.id, fromNode: e.fromNode, toNode: e.toNode, removed: true });
// Permanently deletes an archived board: its notes (under its bullet) go to Trash, every card and
// connection becomes a stub, and the board stays as a small "purged" record that never shows again.
export function purgeCanvas(doc, id) {
  const b = doc.web.canvases?.[id];
  if (!b || !b.removed) throw Error("Archive a canvas before deleting it.");
  const rows = doc.tables.bullets,
    all = rows.some((r) => r.id === b.rootId) ? descendants(rows, b.rootId) : new Set();
  let next = {
    ...doc,
    web: {
      ...doc.web,
      canvases: {
        ...doc.web.canvases,
        [id]: {
          ...b,
          title: "",
          purged: true,
          extensions: {},
          nodes: Object.fromEntries(Object.entries(b.nodes).map(([k, n]) => [k, tombstoneNode(n)])),
          edges: Object.fromEntries(Object.entries(b.edges).map(([k, e]) => [k, tombstoneEdge(e)])),
        },
      },
    },
  };
  if (!all.size) return next;
  const root = rows.find((r) => r.id === b.rootId);
  const entry = {
    id: crypto.randomUUID(),
    title: root?.text || b.title || "Canvas",
    deletedAt: Date.now(),
    nodeCount: all.size,
    payload: JSON.stringify({
      nodes: rows.filter((r) => all.has(r.id)),
      media: next.tables.media.filter((m) => all.has(m.bulletId)),
      decks: next.tables.decks.filter((d) => all.has(d.rootId)),
    }),
  };
  next = withNodes(next, rows.filter((r) => !all.has(r.id)));
  return { ...next, tables: { ...next.tables, trash: [...next.tables.trash, entry] } };
}
// Removes placements. A text card's own bullet (one made on this board) goes to Trash with it,
// unless another live card still shows it; notes linked from elsewhere stay where they are.
export function removeCanvasCards(doc, id, ids) {
  const before = doc.web.canvases?.[id];
  let next = changeCanvas(doc, id, (b) => ({
    ...b,
    nodes: Object.fromEntries(
      Object.entries(b.nodes).map(([key, n]) => [
        key,
        ids.includes(key) ? tombstoneNode(n) : n,
      ]),
    ),
    edges: Object.fromEntries(
      Object.entries(b.edges).map(([key, e]) => [
        key,
        ids.includes(e.fromNode) || ids.includes(e.toNode)
          ? tombstoneEdge(e)
          : e,
      ]),
    ),
  }));
  const rows = next.tables.bullets,
    byId = new Map(rows.map((r) => [r.id, r]));
  const stillShown = new Set(
    Object.values(next.web.canvases || {})
      .filter((b) => !b.removed)
      .flatMap((b) => Object.values(b.nodes))
      .filter((n) => !n.removed && n.noteId)
      .map((n) => n.noteId),
  );
  const owned = ids
    .map((k) => before.nodes[k]?.noteId)
    .filter(
      (noteId) =>
        noteId &&
        byId.get(noteId)?.parentId === before.rootId &&
        !stillShown.has(noteId),
    );
  if (!owned.length) return next;
  const all = new Set();
  for (const noteId of owned)
    for (const d of descendants(rows, noteId)) all.add(d);
  const first = byId.get(owned[0]);
  const entry = {
    id: crypto.randomUUID(),
    title:
      owned.length === 1
        ? first.text || "Empty bullet"
        : `${owned.length} canvas cards`,
    deletedAt: Date.now(),
    nodeCount: all.size,
    payload: JSON.stringify({
      nodes: rows.filter((r) => all.has(r.id)),
      media: next.tables.media.filter((m) => all.has(m.bulletId)),
      decks: next.tables.decks.filter((d) => all.has(d.rootId)),
    }),
  };
  next = withNodes(
    next,
    rows.filter((r) => !all.has(r.id)),
  );
  return { ...next, tables: { ...next.tables, trash: [...next.tables.trash, entry] } };
}
// Boards are replaced, never changed in place, so a board object that passed once is still valid:
// saving re-checks only the boards that changed (typing in Notes re-checks none).
const checkedBoards = new WeakMap();
export function validateCanvases(value) {
  if (value === undefined) return;
  if (
    !record(value) ||
    Object.keys(value).length > 2000 ||
    Object.values(value).filter((b) => !b?.purged).length > 200
  )
    fail("invalid board collection.");
  let bytes = 2;
  for (const [id, b] of Object.entries(value)) {
    if (!safeId(id)) fail("invalid stored board.");
    let size = record(b) ? checkedBoards.get(b) : undefined;
    if (size === undefined) {
      checkBoard(id, b);
      size = new TextEncoder().encode(JSON.stringify(b)).length;
      checkedBoards.set(b, size);
    }
    bytes += size + id.length + 4;
  }
  if (bytes > CANVAS_LIMITS.bytes)
    fail("board metadata exceeds 2 MiB; export a backup before adding more.");
}
function checkBoard(id, b) {
  {
    safeTree(b);
    if (
      !safeId(id) ||
      !record(b) ||
      typeof b.title !== "string" ||
      !record(b.nodes) ||
      !record(b.edges)
    )
      fail("invalid stored board.");
    for (const [nodeId, n] of Object.entries(b.nodes))
      if (
        !record(n) ||
        nodeId !== n.id ||
        !Array.isArray(n.position) ||
        n.position.length !== 2 ||
        !Array.isArray(n.size) ||
        n.size.length !== 2 ||
        !Number.isSafeInteger(n.order) ||
        (n.noteId !== undefined && !safeId(n.noteId))
      )
        fail("invalid stored placement.");
    for (const [edgeId, e] of Object.entries(b.edges))
      if (!record(e) || edgeId !== e.id) fail("invalid stored connection.");
    // Validate every placement, including tombstones, without requiring deleted edges to resolve.
    const nodes = Object.values(b.nodes).map(
      ({ position, size, order, noteId, markdown, removed, compact, extra, ...n }) => ({
        ...n,
        x: position?.[0],
        y: position?.[1],
        width: size?.[0],
        height: size?.[1],
      }),
    );
    parseCanvas({
      nodes,
      edges: Object.values(b.edges).map(({ removed, extra, ...e }) => ({
        ...extra,
        ...e,
      })),
    });
  }
}
// Moves cards to new positions in one change. A moved group carries the cards inside it
// (those that were not moved themselves).
export function moveCanvasCards(doc, boardId, positions) {
  return changeCanvas(doc, boardId, (b) => {
    const moved = Object.entries(positions).filter(
      ([id]) => b.nodes[id] && !b.nodes[id].removed,
    );
    if (!moved.length) return b;
    const nodes = { ...b.nodes };
    for (const [id, [x, y]] of moved) {
      const n = b.nodes[id];
      if (n.type === "group") {
        const dx = x - n.position[0],
          dy = y - n.position[1];
        for (const card of Object.values(b.nodes))
          if (
            card.id !== id &&
            !card.removed &&
            !(card.id in positions) &&
            card.position[0] >= n.position[0] &&
            card.position[1] >= n.position[1] &&
            card.position[0] + card.size[0] <= n.position[0] + n.size[0] &&
            card.position[1] + card.size[1] <= n.position[1] + n.size[1]
          )
            nodes[card.id] = {
              ...nodes[card.id],
              position: [card.position[0] + dx, card.position[1] + dy],
            };
      }
      nodes[id] = { ...nodes[id], position: [x, y] };
    }
    return { ...b, nodes };
  });
}
export function moveCanvasCard(doc, boardId, nodeId, position) {
  return moveCanvasCards(doc, boardId, { [nodeId]: position });
}

// Cards to an outline: a new top-level bullet in Notes (named after the group) with one bullet per
// card, top to bottom then left to right. Text and note cards copy their text and formatting; link
// and file cards become their address or path. Images stay on the board.
export function canvasToOutline(doc, boardId, ids, title, uuid = () => crypto.randomUUID()) {
  const b = doc.web.canvases?.[boardId];
  if (!b) throw Error("Canvas not found.");
  const byId = new Map(doc.tables.bullets.map((r) => [r.id, r]));
  const cards = ids
    .map((id) => b.nodes[id])
    .filter((n) => n && !n.removed && n.type !== "group" && !(n.type === "file" && n.noteId))
    .sort((a, c) => a.position[1] - c.position[1] || a.position[0] - c.position[0]);
  if (!cards.length) throw Error("There are no text, note or link cards to turn into an outline.");
  const rootId = uuid(),
    rows = [...doc.tables.bullets];
  rows.push(
    bullet(rootId, {
      text: title || "From canvas",
      parentId: null,
      position: rows.filter((n) => !n.parentId).length,
    }),
  );
  cards.forEach((n, position) => {
    const note = n.noteId && byId.get(n.noteId);
    rows.push(
      bullet(uuid(), {
        parentId: rootId,
        position,
        text: note ? note.text : n.type === "link" ? n.url : n.type === "file" ? n.file : n.text || "",
        formatting: note ? note.formatting || "" : "",
      }),
    );
  });
  return { doc: withNodes(doc, rows), id: rootId };
}
// Cards that sit inside a group's frame.
export function cardsInGroup(board, groupId) {
  const g = board.nodes[groupId];
  if (!g) return [];
  return Object.values(board.nodes)
    .filter(
      (n) =>
        n.id !== groupId &&
        !n.removed &&
        n.position[0] >= g.position[0] &&
        n.position[1] >= g.position[1] &&
        n.position[0] + n.size[0] <= g.position[0] + g.size[0] &&
        n.position[1] + n.size[1] <= g.position[1] + g.size[1],
    )
    .map((n) => n.id);
}
