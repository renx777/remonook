import { test } from "node:test";
import assert from "node:assert/strict";
import { bullet, refreshCards, generatedCards } from "../src/domain.mjs";
import { dueCards, newStudySession, reviewCard, saveSession, scopedCards, sessionQueue, tomorrow } from "../src/study.mjs";
import { mediaLink, mediaLinks, imageType } from "../src/media.mjs";

const now = new Date(2026, 9, 20, 12).getTime();
test("a single question with answer children can be registered as a one-card deck", () => {
  const nodes = [bullet('q', { text: 'What is machine learning?' }), bullet('a', { parentId: 'q', text: 'Learning patterns from data.' })];
  const cards = generatedCards(nodes, [{ rootId: 'q' }]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, 'q');
  assert.equal(cards[0].answer, 'Learning patterns from data.');
});
function workspace() {
  const nodes = [
    bullet("deck", { text: "Biology" }),
    bullet("q2", { parentId: "deck", position: 1, text: "Second question" }),
    bullet("a2", { parentId: "q2", text: "Second answer" }),
    bullet("q1", { parentId: "deck", position: 0, text: "First question", collapsed: true }),
    bullet("a1", { parentId: "q1", text: "First answer" }),
  ], decks = [{ rootId: "deck", createdAt: now, pinned: 0 }];
  return { tables: { bullets: nodes, decks, cards: refreshCards(nodes, decks, [], [], now), media: [], review_logs: [], study_sessions: [], study_limits: [] } };
}
test("explicit questions use all children, retain nested formatting sources, and support image-only cards", () => {
  const ns = [bullet("q", { text: "Question", kind: "QUESTION" }), bullet("a", { parentId: "q", text: "Unmarked answer" }), bullet("blank", { parentId: "q", position: 1 }), bullet("child", { parentId: "blank", text: "Nested explanation" }), bullet("image-q", { position: 1, kind: "QUESTION" }), bullet("image-a", { parentId: "image-q" })],
    media = [{ bulletId: "image-q" }, { bulletId: "image-a" }],
    cards = generatedCards(ns, [], media);
  assert.equal(cards.length, 2);
  assert.match(cards[0].answer, /Unmarked answer/);
  assert.match(cards[0].answer, /Nested explanation/);
  assert.equal(cards[1].question, "[Image question]");
  assert.equal(cards[1].answer, "[Image]");
});
test("cram follows outline order regardless of storage order/collapse and never reschedules", () => {
  const doc = workspace(), before = structuredClone(doc.tables.cards),
    session = { ...newStudySession(doc, "deck", "NORMAL", now), revealed: 1 };
  assert.deepEqual(sessionQueue(session), ["q1", "q2"]);
  const next = reviewCard(doc, session, "GOOD", 1200, now + 1000);
  assert.deepEqual(next.tables.cards, before);
  assert.equal(next.tables.review_logs[0].grade, "PRACTICE");
  assert.equal(next.tables.review_logs[0].mode, "NORMAL");
  assert.equal(next.tables.study_sessions[0].cursor, 1);
  assert.equal(next.tables.study_sessions[0].revealed, 0);
});
test("spaced reviews randomize eligible cards only, schedule and log atomically", () => {
  const doc = workspace();
  doc.tables.cards.push({ ...doc.tables.cards[0], id: "future", dueAtEpochMillis: now + 86400000 });
  doc.tables.cards.push({ ...doc.tables.cards[0], id: "suspended", suspended: 1 });
  doc.tables.cards.push({ ...doc.tables.cards[0], id: "buried", buriedUntilEpochMillis: now + 10000 });
  const session = { ...newStudySession(doc, null, "SPACED", now, () => 0), revealed: 1 },
    queue = sessionQueue(session);
  assert.deepEqual(new Set(queue), new Set(["q1", "q2"]));
  const next = reviewCard(doc, session, "AGAIN", 2000, now);
  assert.equal(next.tables.cards.find(card => card.id === queue[0]).dueAtEpochMillis, now + 600000);
  assert.equal(next.tables.review_logs[0].scheduledNextAtEpochMillis, now + 600000);
  assert.equal(next.tables.study_sessions[0].reviewed, 1);
  assert.throws(() => reviewCard(doc, { ...session, revealed: 0 }, "GOOD", 0, now), /Reveal/);
});
test("daily budgets count distinct cards and allow same-day relearning without spending another slot", () => {
  const doc = workspace();
  doc.tables.study_limits = [{ deckId: "deck", newCards: 1, reviewCards: 0 }];
  assert.equal(dueCards(doc, "deck", now).length, 1);
  const session = { ...newStudySession(doc, "deck", "SPACED", now), revealed: 1 },
    next = reviewCard(doc, session, "AGAIN", 0, now);
  assert.equal(dueCards(next, "deck", now).length, 0);
  assert.deepEqual(dueCards(next, "deck", now + 600001).map(card => card.id), sessionQueue(session));
  assert.equal(scopedCards(next, "deck", now).length, 2, "cram ignores spaced budgets");
});
test("saved sessions resume their queue and nested decks own their daily budgets", () => {
  const doc = workspace();
  doc.tables.decks.push({ rootId: "q1", createdAt: now, pinned: 0 });
  doc.tables.study_limits = [{ deckId: "deck", newCards: 0, reviewCards: 0 }, { deckId: "q1", newCards: 1, reviewCards: -1 }];
  assert.deepEqual(dueCards(doc, null, now).map(card => card.id), ["q1"]);
  const session = newStudySession(doc, null, "NORMAL", now),
    restored = JSON.parse(JSON.stringify(saveSession(doc, { ...session, cursor: 1, reviewed: 1 })));
  assert.equal(restored.tables.study_sessions[0].cursor, 1);
  assert.deepEqual(sessionQueue(restored.tables.study_sessions[0]), ["q1", "q2"]);
  assert.ok(tomorrow(now) > now);
});
test("share-link parsing only creates iframes for supported providers and preserves timestamps", () => {
  assert.equal(mediaLink("https://youtu.be/dQw4w9WgXcQ?si=tracking&t=1m20s").embed, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=80");
  assert.equal(mediaLink("https://youtube.com/shorts/dQw4w9WgXcQ").kind, "youtube");
  assert.equal(mediaLink("https://instagram.com/reel/ABC_123/?igsh=tracking").embed, "https://www.instagram.com/reel/ABC_123/embed/");
  assert.equal(mediaLink("https://youtube.com.evil.example/watch?v=dQw4w9WgXc").kind, "link");
  assert.equal(mediaLink("javascript:alert(1)"), null);
  assert.equal(mediaLink("https://user:secret@youtube.com/watch?v=dQw4w9WgXc"), null);
  assert.equal(mediaLinks("https://youtu.be/dQw4w9WgXcQ https://youtu.be/dQw4w9WgXcQ").length, 1);
  assert.equal(imageType("photo.HEIC"), "image/heic");
  assert.equal(imageType("script.html", "text/html"), "");
});
