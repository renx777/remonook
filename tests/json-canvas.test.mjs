import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {
  empty,
  save,
  load,
  archive,
  parseArchive,
  androidBlockers,
  updateBulletContent,
} from "./.build/data.mjs";
import {
  parseCanvas,
  createCanvas,
  exportCanvas,
  changeCanvas,
  removeCanvasCards,
  validateCanvases,
  moveCanvasCard,
  moveCanvasCards,
  renameCanvas,
  canvasTitle,
  canvasHomeId,
  adoptCanvasRoots,
  nextCanvasOrder,
  CANVAS_HOME_TITLE,
} from "../src/json-canvas.mjs";
import { checkRoot } from "../src/sync-checks.mjs";
import {
  applyDocument,
  mergeUpdates,
  projectBuckets,
} from "../src/sync-buckets.mjs";
const fixture = () => ({
  custom: { preserved: true },
  nodes: [
    {
      id: "t",
      type: "text",
      text: "**Hello**\n\nworld",
      x: -100,
      y: 5,
      width: 280,
      height: 160,
      color: "5",
      removed: true,
      noteId: "untrusted-note",
      custom: "keep",
    },
    {
      id: "f",
      type: "file",
      file: "folder/book.pdf",
      subpath: "#page=3",
      x: 300,
      y: 0,
      width: 200,
      height: 100,
    },
    {
      id: "u",
      type: "link",
      url: "https://example.org",
      x: 300,
      y: 300,
      width: 200,
      height: 100,
    },
    {
      id: "g",
      type: "group",
      label: "Ideas",
      background: "missing.png",
      backgroundStyle: "ratio",
      x: -200,
      y: -100,
      width: 800,
      height: 600,
    },
  ],
  edges: [
    {
      id: "e",
      fromNode: "t",
      toNode: "f",
      label: "related",
      fromSide: "bottom",
      toSide: "top",
      fromEnd: "arrow",
      toEnd: "none",
      color: "#abcdef",
      custom: 42,
    },
  ],
});
let counter = 0;
const uuid = () => `canvas-test-${++counter}`;
test("all JSON Canvas 1.0 cards, arrows, z-order, geometry and unknown extensions roundtrip; imported identities never bind private notes", () => {
  const file = fixture(),
    result = createCanvas(empty(), "Imported", file, uuid);
  validateCanvases(result.doc.web.canvases);
  assert.deepEqual(exportCanvas(result.doc, result.id), file);
  const node = result.doc.web.canvases[result.id].nodes.t;
  assert.notEqual(node.noteId, "untrusted-note");
  assert.notEqual(node.removed, true);
  assert.equal(
    result.doc.tables.bullets.find((n) => n.id === node.noteId).text,
    file.nodes[0].text,
  );
});
test("reject malformed, unsafe, duplicate, dangling, huge and invalid geometry before changing notes", () => {
  for (const value of [
    "{",
    JSON.stringify({ nodes: [{ ...fixture().nodes[0], width: 0 }] }),
    JSON.stringify({ nodes: [{ ...fixture().nodes[0], x: Infinity }] }),
    JSON.stringify({ nodes: [fixture().nodes[0], fixture().nodes[0]] }),
    JSON.stringify({ edges: [fixture().edges[0]] }),
    JSON.stringify({
      nodes: [{ ...fixture().nodes[2], url: "javascript:alert(1)" }],
    }),
    ' {"__proto__":{}}',
    JSON.stringify({ nodes: [{ ...fixture().nodes[0], id: "constructor" }] }),
    " ".repeat(2 * 1024 * 1024 + 1),
  ])
    assert.throws(() => parseCanvas(value));
  assert.deepEqual(parseCanvas("{}"), { nodes: [], edges: [] });
});
test("removing a card sends its own note to Trash and keeps connection history; export uses latest note text, then Trash, then the snapshot", () => {
  const { doc, id } = createCanvas(empty(), "Board", fixture(), uuid),
    noteId = doc.web.canvases[id].nodes.t.noteId;
  const edited = updateBulletContent(doc, noteId, {
    text: "Changed answer",
    formatting: "",
  });
  assert.equal(exportCanvas(edited, id).nodes[0].text, "Changed answer");
  const removed = removeCanvasCards(edited, id, ["t"]);
  assert.ok(!removed.tables.bullets.some((n) => n.id === noteId));
  assert.equal(removed.tables.trash.length, 1);
  assert.match(removed.tables.trash[0].payload, /Changed answer/);
  assert.equal(removed.web.canvases[id].edges.e.removed, true);
  assert.equal(exportCanvas(removed, id).edges.length, 0);
  const missing = {
    ...edited,
    tables: {
      ...edited.tables,
      bullets: edited.tables.bullets.filter((n) => n.id !== noteId),
    },
  };
  assert.equal(
    exportCanvas(missing, id).nodes[0].text,
    fixture().nodes[0].text,
  );
  const trashed = {
    ...missing,
    tables: { ...missing.tables, trash: removed.tables.trash },
  };
  assert.equal(exportCanvas(trashed, id).nodes[0].text, "Changed answer");
});
test("full backup and local persistence retain boards and notes; incompatible Android export refuses to discard metadata", async () => {
  const { doc, id } = createCanvas(empty(), "Backup", fixture(), uuid);
  await save(null, doc, "canvas-test");
  const restored = await load();
  assert.deepEqual(exportCanvas(restored, id), fixture());
  const { doc: roundtrip } = await parseArchive(await archive(doc, new Map()));
  assert.deepEqual(exportCanvas(roundtrip, id), fixture());
  assert.ok(androidBlockers(doc).some((r) => r.includes("Canvas")));
  await assert.rejects(() => archive(doc, new Map(), true));
});
test("two offline clients retain independent layouts and merge concurrent text through existing rich-text CRDT buckets", () => {
  const { doc, id } = createCanvas(empty(), "Shared", fixture(), uuid),
    base = applyDocument(new Map(), null, doc).states,
    noteId = doc.web.canvases[id].nodes.t.noteId;
  let a = changeCanvas(doc, id, (b) => ({
    ...b,
    nodes: { ...b.nodes, t: { ...b.nodes.t, position: [22, 33] } },
  }));
  a = updateBulletContent(a, noteId, {
    text: "A " + fixture().nodes[0].text,
    formatting: "",
  });
  let b = changeCanvas(doc, id, (b) => ({
    ...b,
    nodes: { ...b.nodes, f: { ...b.nodes.f, position: [44, 55] } },
  }));
  b = updateBulletContent(b, noteId, {
    text: fixture().nodes[0].text + " B",
    formatting: "",
  });
  const left = applyDocument(base, doc, a),
    right = applyDocument(base, doc, b);
  const merged = mergeUpdates(left.states, right.updates);
  const out = projectBuckets(merged.states || merged).doc;
  assert.deepEqual(out.web.canvases[id].nodes.t.position, [22, 33]);
  assert.deepEqual(out.web.canvases[id].nodes.f.position, [44, 55]);
  const text = out.tables.bullets.find((n) => n.id === noteId).text;
  assert.ok(text.startsWith("A "));
  assert.ok(text.endsWith(" B"));
});

test("live generic server validation accepts the new domain without a backend deployment", () => {
  const { doc } = createCanvas(empty(), "Server-compatible", fixture(), uuid);
  assert.doesNotThrow(() => checkRoot(doc.web));
});
test("concurrent card additions and placement removals preserve both note contents", () => {
  const { doc, id } = createCanvas(empty(), "Additions", fixture(), uuid),
    base = applyDocument(new Map(), null, doc).states;
  const add = (doc, key) =>
    changeCanvas(doc, id, (b) => ({
      ...b,
      nodes: {
        ...b.nodes,
        [key]: {
          id: key,
          type: "group",
          label: key,
          position: [1, 2],
          size: [200, 100],
          order: 5,
        },
      },
    }));
  const a = applyDocument(
      base,
      doc,
      add(removeCanvasCards(doc, id, ["t"]), "a"),
    ),
    b = applyDocument(base, doc, add(doc, "b"));
  const out = projectBuckets(mergeUpdates(a.states, b.updates)).doc;
  assert.ok(out.web.canvases[id].nodes.a);
  assert.ok(out.web.canvases[id].nodes.b);
  assert.equal(out.web.canvases[id].nodes.t.removed, true);
  assert.equal(out.tables.bullets.length, doc.tables.bullets.length - 1);
  assert.equal(out.tables.trash.length, 1);
});

test("moving a group moves contained cards in one mutation and preserves external cards", () => {
  const { doc, id } = createCanvas(empty(), "Groups", fixture(), uuid);
  const moved = moveCanvasCard(doc, id, "g", [-100, 0]);
  assert.deepEqual(moved.web.canvases[id].nodes.t.position, [0, 105]);
  assert.deepEqual(moved.web.canvases[id].nodes.g.position, [-100, 0]);
  assert.equal(moved.tables.bullets, doc.tables.bullets);
});

test("boards live under one Canvases bullet and renaming the board renames its bullet both ways", () => {
  let { doc, id } = createCanvas(empty(), "One", fixture(), uuid);
  const second = createCanvas(doc, "Two", undefined, uuid);
  doc = second.doc;
  const home = canvasHomeId(doc),
    tops = doc.tables.bullets.filter((n) => !n.parentId);
  assert.equal(tops.length, 1);
  assert.equal(tops[0].text, CANVAS_HOME_TITLE);
  for (const b of Object.values(doc.web.canvases))
    assert.equal(doc.tables.bullets.find((n) => n.id === b.rootId).parentId, home);
  doc = renameCanvas(doc, id, "Plan");
  const root = doc.tables.bullets.find((n) => n.id === doc.web.canvases[id].rootId);
  assert.equal(root.text, "Plan");
  const renamedInNotes = updateBulletContent(doc, root.id, { text: "Roadmap", formatting: "" });
  assert.equal(canvasTitle(renamedInNotes, renamedInNotes.web.canvases[id]), "Roadmap");
});
test("boards made before the Canvases bullet are filed under it once", () => {
  const { doc, id } = createCanvas(empty(), "Old", fixture(), uuid);
  const rootId = doc.web.canvases[id].rootId;
  const legacy = {
    ...doc,
    tables: {
      ...doc.tables,
      bullets: doc.tables.bullets
        .filter((n) => n.text !== CANVAS_HOME_TITLE)
        .map((n) => (n.id === rootId ? { ...n, parentId: null, position: 0 } : n)),
    },
  };
  const adopted = adoptCanvasRoots(legacy, uuid);
  const home = canvasHomeId(adopted);
  assert.ok(home);
  assert.equal(adopted.tables.bullets.find((n) => n.id === rootId).parentId, home);
  assert.equal(adoptCanvasRoots(adopted, uuid), adopted);
});
test("moving several cards saves them all in one change; a moved group carries only cards not moved themselves", () => {
  const { doc, id } = createCanvas(empty(), "Multi", fixture(), uuid);
  const before = doc.web.canvases[id].nodes;
  const moved = moveCanvasCards(doc, id, { t: [10, 20], f: [30, 40] });
  assert.deepEqual(moved.web.canvases[id].nodes.t.position, [10, 20]);
  assert.deepEqual(moved.web.canvases[id].nodes.f.position, [30, 40]);
  const both = moveCanvasCards(doc, id, { g: [before.g.position[0] - 100, before.g.position[1]], t: [5, 5] });
  assert.deepEqual(both.web.canvases[id].nodes.t.position, [5, 5]);
});
test("stacking order never repeats, even after removals", () => {
  const { doc, id } = createCanvas(empty(), "Order", fixture(), uuid);
  const removed = removeCanvasCards(doc, id, ["f"]);
  const b = removed.web.canvases[id];
  assert.ok(Object.values(b.nodes).every((n) => n.order < nextCanvasOrder(b)));
});
test("a removed card keeps a note that another card still shows", () => {
  const { doc, id } = createCanvas(empty(), "Shared note", fixture(), uuid);
  const t = doc.web.canvases[id].nodes.t;
  const twin = changeCanvas(doc, id, (b) => ({
    ...b,
    nodes: { ...b.nodes, twin: { ...t, id: "twin", order: 9 } },
  }));
  const removed = removeCanvasCards(twin, id, ["t"]);
  assert.ok(removed.tables.bullets.some((n) => n.id === t.noteId));
  assert.equal(removed.tables.trash.length, 0);
});
test("saving re-checks only changed boards but still enforces the size limit", () => {
  const { doc, id } = createCanvas(empty(), "Big", fixture(), uuid);
  validateCanvases(doc.web.canvases);
  const huge = changeCanvas(doc, id, (b) => ({
    ...b,
    extensions: { blob: "x".repeat(2 * 1024 * 1024) },
  }));
  assert.throws(() => validateCanvases(huge.web.canvases), /2 MiB/);
  const broken = changeCanvas(doc, id, (b) => ({
    ...b,
    nodes: { ...b.nodes, t: { ...b.nodes.t, position: [1.5, 2] } },
  }));
  assert.throws(() => validateCanvases(broken.web.canvases), /geometry/);
});
test("an image card exports as a file reference; removing it sends its bullet and image to Trash", () => {
  let { doc, id } = createCanvas(empty(), "Images", undefined, uuid);
  const rootId = doc.web.canvases[id].rootId,
    noteId = uuid();
  doc = {
    ...doc,
    tables: {
      ...doc.tables,
      bullets: [...doc.tables.bullets, { ...doc.tables.bullets.find((n) => n.id === rootId), id: noteId, parentId: rootId, text: "", position: 0 }],
      media: [...doc.tables.media, { id: uuid(), bulletId: noteId, fileName: "pic.png", mimeType: "image/png", sourceUrl: "", credit: "pic.png", licenseUrl: "" }],
    },
  };
  doc = changeCanvas(doc, id, (b) => ({
    ...b,
    nodes: { img: { id: "img", type: "file", file: "pic.png", noteId, position: [0, 0], size: [300, 200], order: 0 } },
  }));
  validateCanvases(doc.web.canvases);
  assert.deepEqual(exportCanvas(doc, id).nodes, [{ id: "img", type: "file", file: "pic.png", x: 0, y: 0, width: 300, height: 200 }]);
  const removed = removeCanvasCards(doc, id, ["img"]);
  assert.ok(!removed.tables.bullets.some((n) => n.id === noteId));
  assert.equal(removed.tables.media.length, 0);
  assert.match(removed.tables.trash[0].payload, /pic\.png/);
});
