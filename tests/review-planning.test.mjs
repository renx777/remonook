import test from "node:test";
import assert from "node:assert/strict";
import { empty, archive, parseArchive } from "./.build/data.mjs";
import { bullet } from "../src/domain.mjs";
import { withNodes } from "../src/workspace-nodes.mjs";
import {
  weeklyReview,
  saveWeeklyReview,
  weekKey,
} from "../src/weekly-review.mjs";
import {
  createStudyGoal,
  studyGoals,
  goalForecast,
  calendarDays,
  archiveStudyGoal,
} from "../src/study-goals.mjs";
import {
  citationsFor,
  saveCitation,
  checkCitation,
  readingSuggestion,
  citationFingerprint,
  citationCSL,
  citationBib,
} from "../src/citations.mjs";
import { noteTrait } from "../src/traits-block.mjs";
import {
  applyDocument,
  mergeUpdates,
  projectBuckets,
} from "../src/sync-buckets.mjs";
const now = new Date(2026, 10, 28, 12).getTime();
let serial = 0;
const make = () => "generated-" + serial++;
function fixture() {
  const d = empty();
  d.tables.decks = [{ rootId: "deck", createdAt: now, pinned: 0 }];
  return withNodes(d, [
    bullet("deck", { text: "Biology" }),
    ...Array.from({ length: 8 }, (_, i) => [
      bullet("q" + i, {
        parentId: "deck",
        position: i,
        text: "Question " + i,
        kind: "QUESTION",
      }),
      bullet("a" + i, { parentId: "q" + i, text: "Answer " + i }),
    ]).flat(),
    bullet("source", { position: 1, text: "Research note" }),
    bullet("todo", { position: 2, text: "Prepare", taskState: "TODO" }),
    bullet("done", { position: 3, text: "Finished", taskState: "DONE" }),
  ]);
}
const draft = () => ({
  id: "goal",
  title: "Learn Biology",
  deck: "deck",
  target: "2026-12-05",
  minutes: 20,
  count: 6,
  seconds: null,
});
const citation = () => ({
  Title: "Example book",
  Author: "A & B",
  Published: "2020-02-29",
  URL: "https://example.com/book",
  DOI: "https://doi.org/10.1234/book",
  Locator: "Page 4",
  Quote: "  Exact quote\nwith line breaks  ",
  Kind: "book",
});
const attempt = () => ({ id: "citation", rootId: "references" });
function unchangedStudy(before, after) {
  for (const key of [
    "cards",
    "review_logs",
    "study_sessions",
    "study_limits",
    "decks",
  ])
    assert.deepEqual(
      after.tables[key],
      before.tables[key],
      key + " stays unchanged",
    );
}
test("study goals snapshot canonical sources and preserve all scheduling data through creation and archive", () => {
  const d = fixture(),
    next = createStudyGoal(d, draft(), make, now),
    [goal] = studyGoals(next),
    f = goalForecast(next, goal, now);
  assert.equal(goal.cards.length, 6);
  assert.deepEqual(goal.cards, ["q0", "q1", "q2", "q3", "q4", "q5"]);
  assert.equal(f.days, 8);
  assert.equal(f.seconds, 45);
  assert.equal(f.newToday, 1);
  assert.equal(f.completed, 0);
  unchangedStudy(d, next);
  assert.equal(createStudyGoal(next, draft(), make, now), next);
  const archived = archiveStudyGoal(next, "goal");
  assert.equal(studyGoals(archived).length, 0);
  assert.ok(
    archived.tables.bullets.some((n) => n.text.includes("#StudyGoalArchived")),
  );
  unchangedStudy(d, archived);
});
test("forecasts respect budgets, track only spaced introductions and retain unavailable sources", () => {
  let d = createStudyGoal(fixture(), draft(), make, now),
    goal = studyGoals(d)[0];
  d.tables.study_limits = [{ deckId: "deck", newCards: 0, reviewCards: 0 }];
  assert.equal(goalForecast(d, goal, now).newToday, 0);
  d.tables.review_logs = [
    {
      id: "practice",
      mode: "NORMAL",
      cardId: "q0",
      reviewedAtEpochMillis: now + 1,
      responseTimeMillis: 10000,
    },
  ];
  assert.equal(goalForecast(d, goal, now + 2).completed, 0);
  d.tables.review_logs.push({
    id: "real",
    mode: "SPACED",
    cardId: "q0",
    reviewedAtEpochMillis: now + 1,
    responseTimeMillis: 10000,
  });
  d.tables.cards = d.tables.cards.filter((c) => c.id !== "q1");
  const f = goalForecast(d, goal, now + 2);
  assert.equal(f.completed, 1);
  assert.equal(f.unavailable, 1);
  assert.equal(f.remaining, 5);
  assert.equal(
    goalForecast(d, goal, new Date(2026, 11, 6, 12).getTime()).newToday,
    0,
  );
  assert.match(
    goalForecast({ ...d, tables: { ...d.tables, decks: [] } }, goal, now).error,
    /unavailable/,
  );
});
test("pace estimates exclude invalid, future and practice samples; use median only after five usable reviews", () => {
  let d = createStudyGoal(fixture(), draft(), make, now),
    g = studyGoals(d)[0];
  d.tables.review_logs = [5, 15, 20, 25, 30].map((s, i) => ({
    id: "l" + i,
    mode: "SPACED",
    cardId: "q7",
    reviewedAtEpochMillis: now - 100 - i,
    responseTimeMillis: s * 1000,
  }));
  d.tables.review_logs.push(
    {
      mode: "NORMAL",
      cardId: "q7",
      reviewedAtEpochMillis: now - 50,
      responseTimeMillis: 500000,
    },
    {
      mode: "SPACED",
      cardId: "q7",
      reviewedAtEpochMillis: now + 500,
      responseTimeMillis: 500000,
    },
    {
      mode: "SPACED",
      cardId: "q7",
      reviewedAtEpochMillis: now - 50,
      responseTimeMillis: 900000,
    },
  );
  assert.equal(goalForecast(d, g, now).seconds, 20);
  d.tables.review_logs.shift();
  assert.equal(goalForecast(d, g, now).seconds, 45);
  assert.equal(
    goalForecast(d, { ...g, seconds: 60, minutes: 1 }, now).overBudget,
    true,
  );
});
test("goal validation and calendar-day arithmetic handle DST, invalid dates, introduced cards and deleted decks", () => {
  assert.equal(calendarDays("2026-03-07", "2026-03-09"), 3);
  assert.throws(() => calendarDays("2026-02-30", "2026-03-01"), /valid/);
  const d = fixture();
  for (const override of [
    { target: "2026-02-30" },
    { target: "2026-11-27" },
    { count: 9 },
    { minutes: 0 },
    { seconds: 0 },
    { deck: "deleted" },
  ])
    assert.throws(() =>
      createStudyGoal(d, { ...draft(), ...override }, make, now),
    );
  d.tables.review_logs = [
    { mode: "SPACED", cardId: "q0", reviewedAtEpochMillis: now - 100 },
  ];
  const next = createStudyGoal(d, draft(), make, now);
  assert.ok(!studyGoals(next)[0].cards.includes("q0"));
});
test("weekly review uses actual spaced logs and all-time task totals without inventing timestamps", () => {
  const d = fixture();
  d.tables.review_logs = [
    {
      mode: "SPACED",
      cardId: "q0",
      reviewedAtEpochMillis: now - 100,
      responseTimeMillis: 60000,
    },
    {
      mode: "SPACED",
      cardId: "q1",
      reviewedAtEpochMillis: now - 100,
      responseTimeMillis: 900000,
    },
    {
      mode: "NORMAL",
      cardId: "q2",
      reviewedAtEpochMillis: now - 100,
      responseTimeMillis: 60000,
    },
    {
      mode: "SPACED",
      cardId: "q2",
      reviewedAtEpochMillis: now + 1,
      responseTimeMillis: 60000,
    },
  ];
  const s = weeklyReview(d, now);
  assert.equal(s.reviews, 2);
  assert.equal(s.distinctCards, 2);
  assert.equal(s.recordedMinutes, 1);
  assert.equal(s.unmeasured, 1);
  assert.equal(s.completed, 1);
  assert.equal(weekKey(now), "2026-11-23");
  const next = saveWeeklyReview(
    d,
    { id: "review", wins: "Made progress", next: "Review notes" },
    now,
    make,
  );
  unchangedStudy(d, next);
  assert.equal(
    saveWeeklyReview(
      next,
      { id: "review", wins: "Made progress", next: "" },
      now,
      make,
    ),
    next,
  );
  assert.ok(
    next.tables.bullets.some((n) => n.text === "1 completed tasks (all time)"),
  );
  assert.ok(!weeklyReview(next, now + 1).recent.some((n) => n.id === "review"));
});
test("citations live outside study decks, keep exact quotes and preserve canonical mirrored targets", () => {
  const d = withNodes(fixture(), [
    ...fixture().tables.bullets,
    bullet("mirror", {
      text: "",
      mirrorSourceId: "q0",
      mirrorRootId: "mirror",
    }),
  ]);
  const next = saveCitation(d, "mirror", citation(), attempt(), null, make),
    [c] = citationsFor(next, "q0");
  unchangedStudy(d, next);
  assert.equal(c.Quote, citation().Quote);
  assert.equal(c.DOI, "10.1234/book");
  assert.equal(noteTrait(next, c.id, "Cited note"), "[[Question 0|q0]]");
  assert.equal(citationsFor(next, "mirror").length, 1);
  const ref = next.tables.bullets.find((n) => n.id === "references");
  assert.equal(ref.parentId, null);
  assert.ok(
    !next.tables.bullets.some(
      (n) => n.parentId === "q0" && n.text.includes("#Citation"),
    ),
  );
  assert.equal(
    saveCitation(next, "q0", citation(), attempt(), null, make),
    next,
  );
  const out = citationCSL([c])[0];
  assert.equal(out.annote, citation().Quote);
  assert.deepEqual(out.issued["date-parts"], [[2020, 2, 29]]);
  assert.deepEqual(out.author, [{ literal: "A & B" }]);
  assert.match(citationBib([c]), /author = \{\{A \\& B\}\}/);
});
test("citation edits refuse stale, duplicate, formatted, deleted and colliding targets without removing content", () => {
  const d = saveCitation(
      fixture(),
      "source",
      citation(),
      attempt(),
      null,
      make,
    ),
    c = citationsFor(d, "source")[0],
    fp = citationFingerprint(c);
  const edited = saveCitation(
    d,
    "source",
    { ...c, Title: "New title" },
    attempt(),
    fp,
    make,
  );
  assert.equal(citationsFor(edited, "source")[0].Title, "New title");
  assert.equal(citationsFor(edited, "source")[0].heading, c.heading);
  assert.throws(
    () => saveCitation(edited, "source", c, attempt(), fp, make),
    /changed/,
  );
  const title = d.tables.bullets.find((n) => n.text === "Title: Example book"),
    fmt = withNodes(
      d,
      d.tables.bullets.map((n) =>
        n.id === title.id
          ? { ...n, formatting: '[{"start":0,"end":5,"style":"BOLD"}]' }
          : n,
      ),
    );
  assert.throws(
    () =>
      saveCitation(
        fmt,
        "source",
        { ...c, Title: "Changed" },
        attempt(),
        fp,
        make,
      ),
    /formatted/,
  );
  const block = d.tables.bullets.find(
    (n) => n.parentId === "citation" && n.traitsBlock,
  );
  const dup = withNodes(d, [
    ...d.tables.bullets,
    bullet("dup", {
      parentId: block.id,
      position: 99,
      text: "title: Duplicate",
    }),
  ]);
  assert.throws(
    () => saveCitation(dup, "source", c, attempt(), fp, make),
    /duplicate/,
  );
  assert.throws(() => citationCSL(citationsFor(dup, "source")), /duplicate/);
  assert.throws(
    () => saveCitation(d, "gone", citation(), attempt(), null, make),
    /removed/,
  );
  assert.throws(
    () =>
      saveCitation(
        fixture(),
        "source",
        citation(),
        { id: "q0", rootId: "r" },
        null,
        make,
      ),
    /identity/,
  );
  assert.throws(
    () =>
      saveCitation(
        d,
        "source",
        { ...c, "Source note": "[[gone|missing]]" },
        attempt(),
        fp,
        make,
      ),
    /removed/,
  );
});
test("citation data rejects unsafe URLs, malformed DOI and dates; exports escape bibliography syntax", () => {
  for (const fields of [
    { URL: "javascript:alert(1)" },
    { URL: "https://secret:password@example.com" },
    { Published: "2026-02-30" },
    { DOI: "not a DOI" },
    { Kind: "unsafe" },
    { Quote: "x".repeat(8001) },
  ])
    assert.throws(() => checkCitation({ ...citation(), ...fields }));
  assert.match(
    citationBib([{ ...citation(), Title: "A {test} #1_2" }]),
    /A \\\{test\\\} \\#1\\_2/,
  );
});
test("saved reading source prefills only available metadata and keeps original anchors", () => {
  const d = fixture();
  d.web.readingBooks = {
    b: { id: "b", title: "Actual title", hash: "hash", format: "pdf" },
  };
  d.web.readingHighlights = {
    h: {
      id: "h",
      bookHash: "hash",
      bulletId: "source",
      unit: 3,
      quote: "Saved quote",
    },
  };
  const s = readingSuggestion(d, "source");
  assert.equal(s.Title, "Actual title");
  assert.equal(s.Locator, "Page 4");
  assert.equal(s.Author, "");
  assert.equal(s.Published, "");
  assert.equal(s["Book hash"], "hash");
  d.web.readingBooks.b.deleted = true;
  assert.equal(readingSuggestion(d, "source"), null);
  d.web.bookmarkSources = {
    source: {
      bookmarkId: "b",
      title: "Article title",
      url: "https://example.com",
      highlightId: "h",
    },
  };
  d.web.bookmarks = {
    b: {
      id: "b",
      title: "Article",
      url: "https://example.com",
      snapshotHash: "snapshot",
    },
  };
  d.web.webHighlights = { h: { exact: "Article quote", hash: "snapshot" } };
  assert.equal(readingSuggestion(d, "source").Quote, "Article quote");
  assert.equal(readingSuggestion(d, "source")["Snapshot hash"], "snapshot");
});
test("ordinary notes retain goals, citations and links through backup and concurrent sync with source edits", async () => {
  let base = fixture();
  const states = applyDocument(new Map(), null, base, { clientID: 41 }).states;
  base = projectBuckets(states).doc;
  const a = saveCitation(
      createStudyGoal(base, draft(), make, now),
      "source",
      citation(),
      attempt(),
      null,
      make,
    ),
    b = withNodes(
      base,
      base.tables.bullets.map((n) =>
        n.id === "source" ? { ...n, text: "Edited on another device" } : n,
      ),
    );
  const au = applyDocument(states, base, a, { clientID: 42 }).updates,
    bu = applyDocument(states, base, b, { clientID: 43 }).updates;
  for (const updates of [
    [au, bu],
    [bu, au],
  ]) {
    let merged = states;
    for (const u of updates) merged = mergeUpdates(merged, u);
    const doc = projectBuckets(merged).doc;
    assert.equal(
      doc.tables.bullets.find((n) => n.id === "source").text,
      "Edited on another device",
    );
    assert.equal(citationsFor(doc, "source").length, 1);
    assert.equal(studyGoals(doc)[0].cards.length, 6);
  }
  const restored = (await parseArchive(await archive(a, new Map()))).doc;
  assert.equal(citationsFor(restored, "source")[0].Quote, citation().Quote);
  assert.equal(studyGoals(restored)[0].deck, "deck");
});

test("portable note packages remap goal and citation links and keep nested imported goals discoverable", async () => {
  const { exportPortable, preparePortable, applyPortable } = await import(
    "../src/note-portability.mjs"
  );
  const { JSDOM } = await import("jsdom");
  const d = saveCitation(
    createStudyGoal(fixture(), draft(), make, now),
    "source",
    citation(),
    attempt(),
    null,
    make,
  );
  const out = await exportPortable(d, new Map());
  const prepared = await preparePortable(
    Object.assign(out.blob, { name: "phase6.zip" }),
    { Parser: new JSDOM("").window.DOMParser, make },
  );
  const result = applyPortable(empty(), prepared),
    goal = studyGoals(result)[0];
  assert.ok(goal);
  assert.notEqual(goal.id, "goal");
  assert.notEqual(goal.deck, "deck");
  assert.ok(
    goal.cards.every(
      (id) => id !== "q0" && result.tables.bullets.some((n) => n.id === id),
    ),
  );
  const source = result.tables.bullets.find((n) => n.text === "Research note");
  assert.equal(citationsFor(result, source.id).length, 1);
});

test("saved planning notes and local draft namespaces remain isolated by account and workspace", async () => {
  const { setStorageAccount, accountLocalKey, save, load } = await import(
    "./.build/data.mjs"
  );
  await import("fake-indexeddb/auto");
  try {
    setStorageAccount("phase6-user-a-workspace-a");
    const key = accountLocalKey("remo-study-goal-draft");
    const d = createStudyGoal(fixture(), draft(), make, now);
    await save(null, d, "goal");
    setStorageAccount("phase6-user-b-workspace-a");
    assert.notEqual(accountLocalKey("remo-study-goal-draft"), key);
    assert.equal(await load(), null);
    setStorageAccount("phase6-user-a-workspace-b");
    assert.notEqual(accountLocalKey("remo-study-goal-draft"), key);
    assert.equal(await load(), null);
    setStorageAccount("phase6-user-a-workspace-a");
    assert.equal(studyGoals(await load())[0].id, "goal");
  } finally {
    setStorageAccount(null);
  }
});

test("unrelated citation Traits cannot override internal identity or stale-save guards", () => {
  const d = saveCitation(
      fixture(),
      "source",
      citation(),
      attempt(),
      null,
      make,
    ),
    block = d.tables.bullets.find(
      (n) => n.parentId === "citation" && n.traitsBlock,
    );
  const next = withNodes(d, [
    ...d.tables.bullets,
    bullet("other-prop", {
      parentId: block.id,
      position: 100,
      text: "id: source",
    }),
    bullet("heading-prop", {
      parentId: block.id,
      position: 101,
      text: "heading: fake",
    }),
  ]);
  const c = citationsFor(next, "source")[0];
  assert.equal(c.id, "citation");
  assert.equal(c.heading, "Example book #Citation");
  const edited = saveCitation(
    next,
    "source",
    { ...c, Author: "Changed" },
    attempt(),
    citationFingerprint(c),
    make,
  );
  assert.ok(
    edited.tables.bullets.some(
      (n) => n.id === "other-prop" && n.text === "id: source",
    ),
  );
});
