import test from "node:test";
import assert from "node:assert/strict";
import { incomingShare } from "../src/android-share.mjs";
import { bullet } from "../src/domain.mjs";
import {
  noteCatalog,
  outlineDestination,
  ordinaryNoteProjection,
} from "../src/notes-filter.mjs";
const empty = () => ({
  revision: 1,
  columns: { bullets: [], media: [], decks: [] },
  web: {},
  tables: { bullets: [], decks: [], media: [], cards: [] },
});
const entry = {
  schema: 1,
  id: "435e46bf-52eb-46d3-93bb-587c334040a6",
  text: "Original",
  receivedAt: 1700000000000,
};
test("incoming text preserves paragraphs literally, appends to Inbox and retries exactly once", () => {
  const original = empty(),
    text = "**A passage**\n\n- Preserve the source, do not parse a list.";
  const first = incomingShare(original, entry, text);
  assert.equal(original.tables.bullets.length, 0);
  assert.equal(
    first.doc.tables.bullets.find((n) => n.id === first.id).text,
    text,
  );
  assert.equal(incomingShare(first.doc, entry, text).doc, first.doc);
  const next = incomingShare(
    first.doc,
    { ...entry, id: crypto.randomUUID() },
    "Next",
  );
  assert.equal(
    next.doc.tables.bullets.find((n) => n.id === next.id).position,
    1,
  );
  assert.throws(
    () => incomingShare(first.doc, entry, "changed"),
    /earlier version/,
  );
});
test("bookmark capture keeps selected context and source URL without fetching", () => {
  const text =
    "Useful article\nhttps://example.com/article#section\nMy selected passage";
  const result = incomingShare(empty(), entry, text, "bookmark");
  assert.equal(Object.keys(result.doc.web.bookmarks).length, 1);
  assert.ok(result.doc.tables.bullets.some((n) => n.text === text));
  assert.equal(noteCatalog(result.doc).roots("notes").length, 0);
  assert.equal(outlineDestination(result.doc, result.id), "bookmarks");
  assert.equal(
    incomingShare(result.doc, entry, text, "bookmark").doc,
    result.doc,
  );
  assert.throws(
    () => incomingShare(empty(), entry, "javascript:alert(1)", "bookmark"),
    /web address/,
  );
});
test("ordinary notes and mixed-page text remain reachable while dedicated outlines share their source IDs", () => {
  const doc = empty();
  doc.tables.bullets = [
    bullet("normal", { text: "Normal" }),
    bullet("mixed", { text: "Mixed", position: 1 }),
    bullet("q", { parentId: "mixed", kind: "QUESTION", text: "Question" }),
    bullet("a", { parentId: "q", text: "Answer" }),
    bullet("mcq", { text: "Quiz", position: 2 }),
    bullet("day", { journalDate: "2026-11-16", position: 3 }),
    bullet("map", { mindmap: true, position: 4 }),
  ];
  doc.web.mcqs = { mcq: {} };
  const catalog = noteCatalog(doc);
  assert.deepEqual(catalog.roots("notes"), ["normal", "mixed"]);
  assert.deepEqual(new Set(catalog.roots("study")), new Set(["q", "mcq"]));
  assert.equal(outlineDestination(doc, "a"), "study");
  assert.equal(outlineDestination(doc, "mixed"), "notes");
  assert.equal(outlineDestination(doc, "day"), "calendar");
  assert.equal(outlineDestination(doc, "map"), "mindmap");
});

test("changing the active note type keeps its editor and children visible without exposing other categories", () => {
  const doc = empty();
  doc.tables.bullets = [
    bullet("q", { kind: "QUESTION", text: "New question" }),
    bullet("a", { parentId: "q", text: "Answer" }),
    bullet("plain", { position: 1, text: "Normal" }),
    bullet("day", { position: 2, journalDate: "2026-11-16", text: "Date" }),
  ];
  const catalog = noteCatalog(doc),
    active = ordinaryNoteProjection(catalog, "q");
  assert.deepEqual(active.roots, ["q", "plain"]);
  assert.equal(active.excluded.has("a"), false);
  assert.equal(active.excluded.has("day"), true);
  assert.deepEqual(ordinaryNoteProjection(catalog).roots, ["plain"]);
});
