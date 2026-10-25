import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bullet,
  validate,
  rows,
  indent,
  outdent,
  moveSibling,
  move,
  split,
  merge,
  parseOutlineText,
  pasteOutline,
  marks,
  generatedCards,
  refreshCards,
  schedule,
} from "../src/domain.mjs";
const b = (id, extra = {}) => bullet(id, extra);
test("Enter at start inserts above and preserves the existing branch", () => {
  const ns = [b("a", { text: "Parent", formatting: "0:6:BOLD" }), b("child", { parentId: "a" })];
  const result = split(ns, "a", 0, 0, "new");
  assert.deepEqual(rows(result, null, true).map(r => r.bullet.id), ["new", "a", "child"]);
  assert.equal(result.find(n => n.id === "a").formatting, "0:6:BOLD");
  validate(result);
});
test("Enter on an empty final child exits one level without creating a bullet", () => {
  const ns = [b("parent"), b("text", { parentId: "parent", text: "Hello" })];
  const first = split(ns, "text", 5, 5, "empty");
  const second = split(first, "empty", 0, 0, "unused");
  assert.equal(second.length, 3);
  assert.equal(second.find(n => n.id === "empty").parentId, null);
  const middle = split([b("p"), b("empty", { parentId: "p" }), b("last", { parentId: "p", position: 1 })], "empty", 0, 0, "new");
  assert.equal(middle.find(n => n.id === "empty").parentId, "p");
  validate(second);
});
test("empty bullets survive traversal and editing an adjacent branch", () => {
  const ns = [b("a"), b("b", { position: 1, text: "hello" })];
  validate(ns);
  assert.equal(rows(ns).length, 2);
  assert.equal(indent(ns, "b").find((n) => n.id === "a").text, "");
});
test("indent/outdent preserve identity and branch descendants", () => {
  const ns = [b("a"), b("b", { position: 1 }), b("c", { parentId: "b" })];
  const nested = indent(ns, "b");
  assert.equal(nested.find((n) => n.id === "b").parentId, "a");
  assert.equal(nested.find((n) => n.id === "c").parentId, "b");
  const restored = outdent(nested, "b");
  assert.equal(restored.find((n) => n.id === "b").parentId, null);
  assert.deepEqual(
    rows(restored, null, true).map((r) => r.bullet.id),
    ["a", "b", "c"],
  );
  assert.throws(() => move(ns, "b", "c", 0), /own branch/);
});
test("Workflowy-style sibling movement keeps the whole branch together", () => {
  const ns = [
    b("a"),
    b("b", { position: 1 }),
    b("b-child", { parentId: "b" }),
    b("c", { position: 2 }),
  ];
  const down = moveSibling(ns, "b", 1);
  assert.deepEqual(
    rows(down, null, true).map((row) => row.bullet.id),
    ["a", "c", "b", "b-child"],
  );
  const up = moveSibling(down, "b", -1);
  assert.deepEqual(
    rows(up, null, true).map((row) => row.bullet.id),
    ["a", "b", "b-child", "c"],
  );
});
test("multiline outline paste preserves nesting, list styles and tasks", () => {
  const value = "- Project\n  - First step\n    [x] Finished\n  1. Second step\n- Next project\n",
    parsed = parseOutlineText(value);
  assert.deepEqual(
    parsed.map(({ depth, text, listType, taskState }) => ({ depth, text, listType, taskState })),
    [
      { depth: 0, text: "Project", listType: "UNORDERED", taskState: "NONE" },
      { depth: 1, text: "First step", listType: "UNORDERED", taskState: "NONE" },
      { depth: 2, text: "Finished", listType: "NONE", taskState: "DONE" },
      { depth: 1, text: "Second step", listType: "ORDERED", taskState: "NONE" },
      { depth: 0, text: "Next project", listType: "UNORDERED", taskState: "NONE" },
    ],
  );
  const result = pasteOutline(
    [b("before", { text: "" }), b("after", { position: 1, text: "After" })],
    "before",
    0,
    0,
    value,
    ["first", "finished", "second", "next"],
  );
  assert.ok(result);
  assert.deepEqual(
    rows(result.nodes, null, true).map((row) => [row.bullet.id, row.depth]),
    [
      ["before", 0],
      ["first", 1],
      ["finished", 2],
      ["second", 1],
      ["next", 0],
      ["after", 0],
    ],
  );
  assert.equal(result.nodes.find((n) => n.id === "before").text, "Project");
  assert.equal(result.nodes.find((n) => n.id === "finished").taskState, "DONE");
  validate(result.nodes);
});
test("split at end of parent inserts child; split retains UTF-16 formatting", () => {
  const ns = [
    b("p", { text: "abc", collapsed: false }),
    b("c", { parentId: "p", listType: "ORDERED" }),
  ];
  const result = split(ns, "p", 3, 3, "new");
  assert.equal(result.find((n) => n.id === "new").parentId, "p");
  assert.equal(result.find((n) => n.id === "new").position, 0);
  assert.equal(result.find((n) => n.id === "p").collapsed, false);
  const splitEmoji = split(
    [b("e", { text: "A😀B", formatting: "1:3:BOLD" })],
    "e",
    3,
    3,
    "f",
  );
  assert.equal(splitEmoji[0].text, "A😀");
  assert.deepEqual(marks(splitEmoji[0].formatting, 3), [
    { start: 1, end: 3, style: "BOLD" },
  ]);
  assert.equal(splitEmoji.find((n) => n.id === "f").text, "B");
});
test("merge follows previous visible row and reparents descendants", () => {
  const ns = [
    b("a", { text: "One", formatting: "0:3:ITALIC" }),
    b("b", { position: 1, text: "Two", formatting: "0:3:BOLD" }),
    b("c", { parentId: "b", text: "child" }),
  ];
  const result = merge(ns, "b");
  assert.equal(result.id, "a");
  assert.equal(result.caret, 3);
  assert.equal(result.nodes.find((n) => n.id === "c").parentId, "a");
  assert.equal(result.nodes.find((n) => n.id === "a").text, "OneTwo");
  assert.equal(
    result.nodes.find((n) => n.id === "a").formatting,
    "0:3:ITALIC;3:6:BOLD",
  );
  validate(result.nodes);
});
test("deck conversion excludes nested questions from parent answer; card edits retain schedule", () => {
  const ns = [
      b("root"),
      b("q", { parentId: "root", text: "Question" }),
      b("a", { parentId: "q", text: "Answer" }),
      b("q2", { parentId: "a", text: "Nested question" }),
      b("a2", { parentId: "q2", text: "Nested answer" }),
    ],
    decks = [{ rootId: "root" }];
  const cs = generatedCards(ns, decks);
  assert.deepEqual(
    cs.map((c) => c.id),
    ["q", "q2"],
  );
  assert.equal(cs[0].answer, "Answer");
  const initial = refreshCards(ns, decks, [], [], 1000),
    reviewed = initial.map((c) => ({
      ...c,
      easeFactor: 1.9,
      intervalDays: 12,
      lastReviewAtEpochMillis: 888,
    })),
    edited = refreshCards(
      ns.map((n) => (n.id === "q" ? { ...n, text: "Edited question" } : n)),
      decks,
      [],
      reviewed,
      2000,
    );
  assert.equal(edited[0].question, "Edited question");
  assert.equal(edited[0].easeFactor, 1.9);
  assert.equal(edited[0].lastReviewAtEpochMillis, 888);
  const removed = refreshCards(
    ns.filter((n) => n.id !== "a2"),
    decks,
    [],
    edited,
    3000,
  );
  assert.equal(removed.find((c) => c.id === "q2").state, "INACTIVE");
});
test("scheduler matches Android initial grades and uses old ease for later base", () => {
  const card = { repetitionCount: 0, intervalDays: 0, easeFactor: 2.5 };
  assert.equal(schedule(card, "AGAIN", 100).dueAtEpochMillis, 600100);
  assert.equal(schedule(card, "GOOD", 100).intervalDays, 1);
  assert.equal(schedule(card, "HARD", 100).intervalDays, 1);
  assert.equal(schedule(card, "EASY", 100).intervalDays, 3);
  const third = schedule(
    { repetitionCount: 2, intervalDays: 6, easeFactor: 2.5 },
    "EASY",
    100,
  );
  assert.equal(third.intervalDays, 20);
  assert.equal(third.easeFactor, 2.6);
});
test("10,000-node deep traversal is iterative and validates without stack overflow", () => {
  const ns = Array.from({ length: 10000 }, (_, i) =>
    b(String(i), { parentId: i ? String(i - 1) : null }),
  );
  const start = performance.now();
  validate(ns);
  assert.equal(rows(ns, null, true).length, 10000);
  assert.ok(performance.now() - start < 2000);
  console.log(
    "10k deep validate + traversal ms:",
    Math.round(performance.now() - start),
  );
});
test("10,000-wide outline moves preserve every ID", () => {
  const ns = Array.from({ length: 10000 }, (_, i) =>
    b(String(i), { position: i }),
  );
  const start = performance.now(),
    moved = move(ns, "9999", null, 0);
  assert.equal(rows(moved)[0].bullet.id, "9999");
  assert.equal(new Set(moved.map((n) => n.id)).size, 10000);
  console.log(
    "10k wide move + traversal ms:",
    Math.round(performance.now() - start),
  );
});
import fixture from "../docs/fixtures/scheduler-v1.json" with { type: "json" };
test("shared scheduler vectors match source-derived Android expectations", () => {
  for (const c of fixture.cases) {
    const actual = schedule(c.before, c.grade, c.now);
    for (const [key, value] of Object.entries(c.expected))
      if (key === "easeFactor")
        assert.ok(Math.abs(actual[key] - value) < 1e-10, c.name);
      else assert.equal(actual[key], value, c.name);
  }
});
test("5,000 linked cards derive and refresh without quadratic ID lookup", () => {
  const ns = [b("deck")];
  for (let i = 0; i < 5000; i++)
    ns.push(
      b("q" + i, { parentId: "deck", position: i, text: "Question " + i }),
      b("a" + i, { parentId: "q" + i, text: "Answer " + i }),
    );
  const start = performance.now(),
    initial = refreshCards(ns, [{ rootId: "deck" }], [], [], 1),
    next = refreshCards(
      ns.map((n) => (n.id === "q4000" ? { ...n, text: "Updated" } : n)),
      [{ rootId: "deck" }],
      [],
      initial,
      2,
    );
  assert.equal(next.length, 5000);
  assert.equal(next.find((c) => c.id === "q4000").question, "Updated");
  assert.equal(next.find((c) => c.id === "q4000").createdAtEpochMillis, 1);
  assert.ok(performance.now() - start < 2000);
  console.log(
    "5k cards initial + refresh ms:",
    Math.round(performance.now() - start),
  );
});

test("Enter at end of a collapsed branch creates a sibling and preserves hidden descendants", () => {
  for (const parentId of [null, "root"]) {
    const ns = [...(parentId ? [b("root")] : []), b("parent", { parentId, text: "Parent", collapsed: true }), b("child", { parentId: "parent", text: "Hidden" }), b("grandchild", { parentId: "child" }), b("after", { parentId, position: 1 })];
    const result = split(ns, "parent", 6, 6, "new");
    assert.equal(result.find(n => n.id === "new").parentId, parentId);
    assert.equal(result.find(n => n.id === "parent").collapsed, true);
    assert.equal(result.find(n => n.id === "child").parentId, "parent");
    assert.equal(result.find(n => n.id === "grandchild").parentId, "child");
    assert.deepEqual(rows(result, null, true).map(r => r.bullet.id), [...(parentId ? ["root"] : []), "parent", "child", "grandchild", "new", "after"]);
    validate(result);
  }
});
test("Enter at end of an expanded branch still inserts its first child", () => {
  const result = split([b("p", { text: "Parent" }), b("c", { parentId: "p" })], "p", 6, 6, "new");
  assert.equal(result.find(n => n.id === "new").parentId, "p");
  assert.deepEqual(rows(result).map(r => r.bullet.id), ["p", "new", "c"]);
});
