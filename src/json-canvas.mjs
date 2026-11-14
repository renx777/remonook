// JSON Canvas 1.0 interchange. Editable text lives in ordinary outline rows.
import { bullet } from "./domain.mjs";
import { bulletMarkdown } from "./ai-markdown.mjs";
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
    rootId = uuid(),
    rows = [...doc.tables.bullets],
    nodes = {},
    edges = {};
  rows.push(
    bullet(rootId, {
      text: title,
      parentId: null,
      position: rows.filter((n) => !n.parentId).length,
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
      result.text = canvasNoteText(note, n);
    }
    return result;
  });
  const edges = Object.values(b.edges)
    .filter((e) => !e.removed && ids.has(e.fromNode) && ids.has(e.toNode))
    .map(({ removed, extra, ...e }) => ({ ...extra, ...e }));
  return { ...b.extensions, nodes, edges };
}
export function removeCanvasCards(doc, id, ids) {
  return changeCanvas(doc, id, (b) => ({
    ...b,
    nodes: Object.fromEntries(
      Object.entries(b.nodes).map(([key, n]) => [
        key,
        ids.includes(key) ? { ...n, removed: true } : n,
      ]),
    ),
    edges: Object.fromEntries(
      Object.entries(b.edges).map(([key, e]) => [
        key,
        ids.includes(e.fromNode) || ids.includes(e.toNode)
          ? { ...e, removed: true }
          : e,
      ]),
    ),
  }));
}
export function validateCanvases(value) {
  if (value === undefined) return;
  if (!record(value) || Object.keys(value).length > 200)
    fail("invalid board collection.");
  if (
    new TextEncoder().encode(JSON.stringify(value)).length > CANVAS_LIMITS.bytes
  )
    fail("board metadata exceeds 2 MiB; export a backup before adding more.");
  safeTree(value);
  for (const [id, b] of Object.entries(value)) {
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
      ({ position, size, order, noteId, markdown, removed, extra, ...n }) => ({
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
export function moveCanvasCard(doc, boardId, nodeId, position) {
  return changeCanvas(doc, boardId, (b) => {
    const n = b.nodes[nodeId];
    if (!n || n.removed) return b;
    const dx = position[0] - n.position[0],
      dy = position[1] - n.position[1];
    return {
      ...b,
      nodes: Object.fromEntries(
        Object.entries(b.nodes).map(([id, card]) => {
          const contained =
            n.type === "group" &&
            !card.removed &&
            card.position[0] >= n.position[0] &&
            card.position[1] >= n.position[1] &&
            card.position[0] + card.size[0] <= n.position[0] + n.size[0] &&
            card.position[1] + card.size[1] <= n.position[1] + n.size[1];
          return [
            id,
            id === nodeId || contained
              ? {
                  ...card,
                  position: [card.position[0] + dx, card.position[1] + dy],
                }
              : card,
          ];
        }),
      ),
    };
  });
}
