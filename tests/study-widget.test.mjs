import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { bullet, refreshCards, validate } from "../src/domain.mjs";
import { reviewCard, newStudySession } from "../src/study.mjs";
import { configureMcq } from "../src/mcq.mjs";
import { validateFsrs } from "../src/fsrs-scheduler.mjs";
import { checkRoot } from "../src/sync-checks.mjs";
import {
  createWidgetSnapshot,
  applyWidgetReview,
  WIDGET_ALL_DECKS,
  widgetDigest,
} from "../src/study-widget.mjs";
const NOW = Date.UTC(2026, 10, 15, 12),
  SCOPE = "remo-web-local-widgettest";
function fixture() {
  const bullets = [
    bullet("deck", { text: "A useful deck" }),
    bullet("q", {
      kind: "QUESTION",
      parentId: "deck",
      text: "What helps memory?",
    }),
    bullet("a", {
      parentId: "q",
      text: "Returning to an idea over time.",
      listType: "ORDERED",
    }),
    bullet("a2", {
      parentId: "q",
      position: 1,
      text: "Practice recalling the answer.",
      listType: "ORDERED",
    }),
  ];
  const decks = [{ rootId: "deck", layout: "FLAT", createdAt: NOW, pinned: 0 }];
  return {
    revision: 1,
    columns: { cards: [], review_logs: [], study_sessions: [] },
    preferences: { study_preferences: {} },
    web: {},
    tables: {
      bullets,
      decks,
      media: [],
      cards: refreshCards(bullets, decks, [], [], NOW),
      review_logs: [],
      study_limits: [],
      study_sessions: [
        {
          id: "web-current",
          scope: "deck",
          mode: "NORMAL",
          queueJson: '["q"]',
          cursor: 0,
          reviewed: 0,
          revealed: 1,
          updatedAt: NOW,
        },
      ],
    },
  };
}
function intent(doc, patch = {}) {
  const card = createWidgetSnapshot(doc, SCOPE, "Workspace", NOW).decks[0]
    .cards[0];
  assert.ok(card);
  return {
    schema: 1,
    id: "f3e94ccc-cae8-43aa-a480-8c9947d9a692",
    scope: SCOPE,
    deckId: WIDGET_ALL_DECKS,
    cardId: card.id,
    fingerprint: card.fingerprint,
    question: card.question,
    answer: card.answer,
    grade: "GOOD",
    reviewedAt: NOW + 1000,
    ...patch,
  };
}

test("widget fingerprint is portable SHA-256 including Unicode, long input and empty text", () => {
  for (const value of ["", "abc", "😀 മലയാളം 日本語", "x".repeat(7000)])
    assert.equal(
      widgetDigest(value),
      createHash("sha256").update(value).digest("hex"),
    );
});
test("snapshot exposes due complete plain-text answers and registered decks, preserves numbering and stable identities", () => {
  const doc = fixture(),
    before = structuredClone(doc),
    snapshot = createWidgetSnapshot(doc, SCOPE, "Workspace", NOW);
  assert.deepEqual(
    snapshot.decks.map((d) => d.id),
    [WIDGET_ALL_DECKS, "deck"],
  );
  assert.equal(snapshot.scope, SCOPE);
  assert.equal(snapshot.revision, 1);
  assert.equal(snapshot.decks[0].cards[0].id, "q");
  assert.match(
    snapshot.decks[0].cards[0].answer,
    /1\. Returning[\s\S]*2\. Practice/,
  );
  assert.deepEqual(doc, before);
  const reordered = {
    ...doc,
    tables: {
      ...doc.tables,
      cards: doc.tables.cards.map((c) =>
        Object.fromEntries(Object.entries(c).reverse()),
      ),
    },
  };
  assert.equal(
    createWidgetSnapshot(reordered, SCOPE, "Workspace", NOW).decks[0].cards[0]
      .fingerprint,
    snapshot.decks[0].cards[0].fingerprint,
  );
});
test("MCQs, occlusions, images, masks, suspended/buried/future cards and oversized answers never leak into a widget", () => {
  for (const mutate of [
    (d) => {
      d.web.occlusions = { q: {} };
    },
    (d) => {
      d.tables.media = [{ bulletId: "a" }];
    },
    (d) => {
      d.tables.bullets[1].formatting = "0:4:MASK";
    },
    (d) => {
      d.tables.bullets[2].text = "x".repeat(8001);
    },
    (d) => {
      d.tables.cards[0].suspended = 1;
    },
    (d) => {
      d.tables.cards[0].buriedUntilEpochMillis = NOW + 1000;
    },
    (d) => {
      d.tables.cards[0].dueAtEpochMillis = NOW + 1;
    },
    (d) => {
      d.tables.bullets[2].codeLanguage = "javascript";
    },
  ]) {
    const d = fixture();
    mutate(d);
    assert.equal(
      createWidgetSnapshot(d, SCOPE, "Workspace", NOW).decks[0].cards.length,
      0,
    );
  }
  let d = fixture();
  d.tables.bullets = [
    ...d.tables.bullets,
    bullet("mq", {
      parentId: "deck",
      kind: "QUESTION",
      text: "Choose a number",
      position: 1,
    }),
    ...["1", "2", "3", "4"].map((text, i) =>
      bullet("o" + i, { parentId: "mq", text, position: i }),
    ),
  ];
  d = configureMcq(d, "mq", {
    correctOptionId: "o1",
    shuffle: false,
    explanation: "Two.",
  });
  d.tables.cards = refreshCards(
    d.tables.bullets,
    d.tables.decks,
    [],
    d.tables.cards,
    NOW,
  );
  const ids = createWidgetSnapshot(
    d,
    SCOPE,
    "Workspace",
    NOW,
  ).decks[0].cards.map((c) => c.id);
  assert.ok(ids.includes("q"));
  assert.ok(!ids.includes("mq"));
});
test("native grade uses canonical FSRS and does not replace an active Study Desk session", () => {
  const doc = fixture(),
    event = intent(doc),
    before = structuredClone(doc),
    next = applyWidgetReview(doc, event, SCOPE, NOW + 5000),
    privateSession = {
      ...newStudySession(doc, null, "SPACED", event.reviewedAt),
      id: "expected",
      queueJson: '["q"]',
      cursor: 0,
      revealed: 1,
    };
  const expected = reviewCard(doc, privateSession, "GOOD", 0, event.reviewedAt);
  assert.equal(next.outcome, "applied");
  assert.deepEqual(next.doc.tables.cards, expected.tables.cards);
  assert.equal(next.doc.tables.review_logs[0].widgetEventId, event.id);
  assert.equal(typeof next.doc.tables.review_logs[0].id, "number");
  assert.deepEqual(next.doc.tables.study_sessions, doc.tables.study_sessions);
  assert.deepEqual(doc, before);
  validateFsrs(next.doc);
  assert.ok(next.doc.columns.review_logs.includes("widgetEventId"));
});
test("retries after reload grade exactly once, even with event ID case variation", () => {
  const doc = fixture(),
    event = intent(doc),
    first = applyWidgetReview(doc, event, SCOPE, NOW + 1000).doc,
    reloaded = JSON.parse(JSON.stringify(first)),
    second = applyWidgetReview(
      reloaded,
      { ...event, id: event.id.toUpperCase() },
      SCOPE,
      NOW + 2000,
    );
  assert.equal(second.outcome, "duplicate");
  assert.equal(second.doc, reloaded);
  assert.equal(second.doc.tables.review_logs.length, 1);
});
test("stale content, concurrent schedules, removed deck, deleted card and backward/future clocks preserve reviews in normal notes without grading", () => {
  const original = fixture(),
    event = intent(original, { deckId: "deck" });
  for (const mutate of [
    (d) => {
      d.tables.bullets[2].text = "Changed answer";
    },
    (d) => {
      d.tables.decks = [];
    },
    (d) => {
      d.tables.cards = [];
      d.tables.bullets = d.tables.bullets.filter(
        (n) => n.id !== "q" && n.parentId !== "q",
      );
    },
    (d) => {
      const r = reviewCard(
        d,
        { ...newStudySession(d, null, "SPACED", NOW), revealed: 1 },
        "EASY",
        0,
        NOW + 500,
      );
      d.tables.cards = r.tables.cards;
      d.tables.review_logs = r.tables.review_logs;
    },
  ]) {
    const doc = structuredClone(original);
    mutate(doc);
    const before = structuredClone(doc.tables.cards),
      result = applyWidgetReview(doc, event, SCOPE, NOW + 10000);
    assert.equal(result.outcome, "recovered");
    assert.deepEqual(result.doc.tables.cards, before);
    const recovered = result.doc.tables.bullets.find(
      (n) => n.id === "widget-review-" + event.id,
    );
    assert.ok(recovered.text.includes(event.question));
    assert.ok(recovered.text.includes(event.answer));
    assert.ok(recovered.text.includes(event.grade));
    validate(result.doc.tables.bullets);
    assert.doesNotThrow(() => checkRoot(result.doc.web));
    assert.equal(
      applyWidgetReview(
        JSON.parse(JSON.stringify(result.doc)),
        event,
        SCOPE,
        NOW + 20000,
      ).outcome,
      "duplicate",
    );
  }
  for (const reviewedAt of [NOW - 1, NOW + 6 * 60000]) {
    const result = applyWidgetReview(
      original,
      { ...event, reviewedAt },
      SCOPE,
      NOW,
    );
    assert.equal(result.outcome, "recovered");
    assert.deepEqual(result.doc.tables.cards, original.tables.cards);
  }
});
test("workspace/account mismatch and malformed events are left for the native durable inbox rather than acknowledged", () => {
  const doc = fixture(),
    event = intent(doc),
    before = structuredClone(doc);
  assert.throws(
    () => applyWidgetReview(doc, event, "remo-web-user-other", NOW),
    /workspace/,
  );
  assert.throws(
    () => applyWidgetReview(doc, { ...event, grade: "PRACTICE" }, SCOPE, NOW),
    /Invalid/,
  );
  assert.throws(
    () => applyWidgetReview(doc, { ...event, reviewedAt: NaN }, SCOPE, NOW),
    /Invalid/,
  );
  assert.deepEqual(doc, before);
});
test("long-offline unchanged review uses its recorded time and stays distinct from later scheduling", () => {
  const doc = fixture(),
    event = intent(doc),
    result = applyWidgetReview(doc, event, SCOPE, NOW + 180 * 86400000);
  assert.equal(result.outcome, "applied");
  assert.equal(
    result.doc.tables.cards[0].lastReviewAtEpochMillis,
    event.reviewedAt,
  );
  assert.equal(
    result.doc.tables.review_logs[0].reviewedAtEpochMillis,
    event.reviewedAt,
  );
});
test("mirrors are not independently graded and changing retention invalidates an existing cached schedule", () => {
  const doc = fixture();
  doc.tables.bullets.push({
    ...doc.tables.bullets[1],
    id: "mirror",
    parentId: null,
    mirrorSourceId: "q",
    mirrorRootId: "mirror",
  });
  const snapshot = createWidgetSnapshot(doc, SCOPE, "Workspace", NOW);
  assert.deepEqual(
    snapshot.decks[0].cards.map((c) => c.id),
    ["q"],
  );
  const event = intent(doc);
  doc.preferences.study_preferences.fsrsRetention = 0.95;
  assert.equal(
    applyWidgetReview(doc, event, SCOPE, NOW + 1000).outcome,
    "recovered",
  );
});
test("cache bounds skip complete unsupported content and cap each deck at thirty cards", () => {
  const doc = fixture();
  for (let i = 0; i < 45; i++)
    doc.tables.bullets.push(
      bullet("extra" + i, {
        kind: "QUESTION",
        parentId: "deck",
        position: i + 2,
        text: "Question " + i,
      }),
      bullet("answer" + i, {
        parentId: "extra" + i,
        text: "A complete answer " + i,
      }),
    );
  doc.tables.cards = refreshCards(
    doc.tables.bullets,
    doc.tables.decks,
    [],
    doc.tables.cards,
    NOW,
  );
  const snapshot = createWidgetSnapshot(doc, SCOPE, "Workspace", NOW);
  assert.equal(snapshot.decks[0].cards.length, 30);
  assert.equal(snapshot.decks[1].cards.length, 30);
  assert.ok(
    new TextEncoder().encode(JSON.stringify(snapshot)).length < 4 * 1024 * 1024,
  );
});

test("canonical persistence and a full backup retain widget receipts, recovery content and a pending outbox", async () => {
  await import("fake-indexeddb/auto");
  const data = await import("./.build/data.mjs"),
    { applyDocument, mergeUpdates, projectBuckets } = await import(
      "../src/sync-buckets.mjs"
    );
  const account =
    "remo-web-local-" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  data.setStorageName(account);
  try {
    const base = data.empty(),
      source = fixture();
    base.tables = { ...base.tables, ...source.tables };
    let saved = await data.save(null, base, "widget-fixture");
    const seed = applyDocument(new Map(), null, saved);
    await data.syncOperation(
      "initialize",
      {
        response: { protocol: 3, updates: seed.updates, revision: 1 },
        doc: saved,
        assets: [],
      },
      account,
    );
    const event = intent(saved, { scope: account });
    let reviewed = applyWidgetReview(saved, event, account, NOW + 1000).doc;
    saved = await data.save(saved, reviewed, "widget-grade");
    let restored = await data.load(account);
    assert.equal(restored.tables.review_logs[0].widgetEventId, event.id);
    assert.ok(restored.columns.review_logs.includes("widgetEventId"));
    const stale = { ...event, id: "f3e94ccc-cae8-43aa-a480-8c9947d9a693" };
    reviewed = applyWidgetReview(restored, stale, account, NOW + 2000).doc;
    saved = await data.save(saved, reviewed, "widget-preserve-stale");
    restored = await data.load(account);
    assert.ok(restored.web.widgetReviewRecoveries[stale.id]);
    const zip = await data.archive(restored, new Map()),
      backup = await data.parseArchive(zip);
    assert.equal(backup.doc.tables.review_logs[0].widgetEventId, event.id);
    assert.deepEqual(
      backup.doc.web.widgetReviewRecoveries,
      restored.web.widgetReviewRecoveries,
    );
    assert.ok(
      backup.doc.tables.bullets.some(
        (n) => n.id === "widget-review-" + stale.id,
      ),
    );
    const status = await data.syncMetadata(undefined, undefined, account);
    assert.ok(status.pending.length > 0);
    assert.equal(
      status.since,
      1,
      "saving must not acknowledge the pending review",
    );
    const network = await data.syncOperation("network", {}, account),
      out = projectBuckets(
        mergeUpdates(seed.states, network.inflight.updates),
      ).doc;
    assert.equal(out.tables.review_logs[0].widgetEventId, event.id);
    assert.ok(out.web.widgetReviewRecoveries[stale.id]);
  } finally {
    data.setStorageAccount(null);
  }
});

test("an offline widget grade and another device’s answer edit merge without losing either history or text", async () => {
  const data = await import("./.build/data.mjs"),
    { applyDocument, mergeUpdates, projectBuckets } = await import(
      "../src/sync-buckets.mjs"
    );
  const doc = {
      ...data.empty(),
      tables: { ...data.empty().tables, ...fixture().tables },
    },
    event = intent(doc),
    base = applyDocument(new Map(), null, doc).states;
  const graded = applyWidgetReview(doc, event, SCOPE, NOW + 1000).doc,
    edited = {
      ...doc,
      tables: {
        ...doc.tables,
        bullets: doc.tables.bullets.map((n) =>
          n.id === "a"
            ? { ...n, text: "A useful explanation from the other device." }
            : n,
        ),
      },
    };
  const left = applyDocument(base, doc, graded, { clientID: 601 }),
    right = applyDocument(base, doc, edited, { clientID: 602 });
  for (const states of [
    mergeUpdates(left.states, right.updates),
    mergeUpdates(right.states, left.updates),
  ]) {
    const merged = projectBuckets(states).doc;
    assert.equal(
      merged.tables.bullets.find((n) => n.id === "a").text,
      "A useful explanation from the other device.",
    );
    assert.equal(merged.tables.review_logs[0].widgetEventId, event.id);
    assert.equal(merged.tables.cards[0].repetitionCount, 1);
    assert.equal(
      applyWidgetReview(merged, event, SCOPE, NOW + 5000).outcome,
      "duplicate",
    );
  }
});

test("a failed local save leaves no durable grade and retries from the same native event apply once", async () => {
  await import("fake-indexeddb/auto");
  const data = await import("./.build/data.mjs");
  const account =
    "remo-web-local-" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  data.setStorageName(account);
  try {
    const base = data.empty();
    base.tables = { ...base.tables, ...fixture().tables };
    let saved = await data.save(null, base, "widget-failure-fixture");
    const event = intent(saved, { scope: account }),
      draft = applyWidgetReview(saved, event, account, NOW + 1000).doc;
    const original = IDBDatabase.prototype.transaction;
    let fail = true;
    IDBDatabase.prototype.transaction = function (names, mode, options) {
      if (this.name === account && mode === "readwrite" && fail) {
        fail = false;
        throw new DOMException("Synthetic disk failure", "QuotaExceededError");
      }
      return original.call(this, names, mode, options);
    };
    try {
      await assert.rejects(
        () => data.save(saved, draft, "widget-failed-save"),
        /Synthetic disk failure/,
      );
    } finally {
      IDBDatabase.prototype.transaction = original;
    }
    const durable = await data.load(account);
    assert.equal(durable.tables.review_logs.length, 0);
    assert.equal(durable.tables.cards[0].repetitionCount, 0);
    const retry = applyWidgetReview(durable, event, account, NOW + 2000);
    assert.equal(retry.outcome, "applied");
    saved = await data.save(durable, retry.doc, "widget-retry");
    const reload = await data.load(account);
    assert.equal(reload.tables.review_logs.length, 1);
    assert.equal(reload.tables.review_logs[0].widgetEventId, event.id);
    assert.equal(
      applyWidgetReview(reload, event, account, NOW + 3000).outcome,
      "duplicate",
    );
  } finally {
    data.setStorageAccount(null);
  }
});

test("native labels respect UTF-8 limits without clipping study text or surrogate pairs", () => {
  const doc = fixture();
  doc.tables.bullets[0].text = "学習😀".repeat(150);
  const snapshot = createWidgetSnapshot(doc, SCOPE, "学習😀".repeat(150), NOW);
  assert.ok(Buffer.byteLength(snapshot.workspaceName) <= 200);
  assert.ok(Buffer.byteLength(snapshot.decks[1].title) <= 500);
  assert.equal(snapshot.decks[0].cards[0].question, "What helps memory?");
  assert.equal(snapshot.workspaceName.includes("�"), false);
  assert.throws(
    () => createWidgetSnapshot(doc, "x".repeat(201), "Workspace", NOW),
    /Invalid widget workspace/,
  );
});
