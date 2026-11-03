import test from "node:test";
import assert from "node:assert/strict";
import {
  queryBookmarks,
  patchBookmarks,
  bookmarkNote,
} from "../src/bookmarks.mjs";
import { empty } from "./.build/data.mjs";
const rows = [
  {
    id: "a",
    title: "Machine learning",
    url: "https://www.ibm.com/learn",
    excerpt: "Patterns and algorithms",
    createdAt: 1,
    tags: ["AI", "Work"],
    read: false,
    favourite: true,
    archived: false,
  },
  {
    id: "b",
    title: "RAG explained",
    url: "https://memgraph.com/rag",
    excerpt: "Graph retrieval",
    createdAt: 3,
    tags: ["ai"],
    read: true,
    favourite: false,
    archived: false,
  },
  {
    id: "c",
    title: "Archived page",
    url: "https://example.com/",
    createdAt: 2,
    tags: [],
    read: false,
    favourite: true,
    archived: true,
  },
];
test("library searches across fields and tags, sorts deterministically and isolates archived/read views", () => {
  assert.deepEqual(
    queryBookmarks(rows).map((b) => b.id),
    ["b", "a"],
  );
  assert.deepEqual(
    queryBookmarks(rows, { query: "IBM algorithms AI" }).map((b) => b.id),
    ["a"],
  );
  assert.deepEqual(
    queryBookmarks(rows, { tag: "AI" }).map((b) => b.id),
    ["b", "a"],
  );
  assert.deepEqual(
    queryBookmarks(rows, { filter: "unread" }).map((b) => b.id),
    ["a"],
  );
  assert.deepEqual(
    queryBookmarks(rows, { filter: "read" }).map((b) => b.id),
    ["b"],
  );
  assert.deepEqual(
    queryBookmarks(rows, { filter: "archived" }).map((b) => b.id),
    ["c"],
  );
  assert.deepEqual(
    queryBookmarks(rows, { sort: "oldest" }).map((b) => b.id),
    ["a", "b"],
  );
  assert.deepEqual(
    queryBookmarks(rows, { sort: "title" }).map((b) => b.id),
    ["a", "b"],
  );
  assert.equal(rows[0].id, "a");
});
test("bulk library changes retain source-linked notes and skip missing/deleted IDs", () => {
  let doc = empty();
  doc.web.bookmarks = Object.fromEntries(rows.map((r) => [r.id, r]));
  doc = bookmarkNote(doc, rows[0], "Keep this passage.", "saved-note");
  const next = patchBookmarks(doc, ["a", "b", "unknown"], { deleted: true });
  assert.ok(next.tables.bullets.some((n) => n.id === "saved-note"));
  assert.equal(next.web.bookmarkSources["saved-note"].bookmarkId, "a");
  assert.equal(next.web.bookmarks.unknown, undefined);
  assert.equal(next.web.bookmarks.a.deleted, true);
  assert.equal(
    patchBookmarks(next, ["a"], { deleted: false }).web.bookmarks.a.deleted,
    true,
  );
});
