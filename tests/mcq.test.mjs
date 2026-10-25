import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bullet, refreshCards } from "../src/domain.mjs";
import { configureMcq, mcqDefinition, orderedMcqOptions, answerMcq, mcqAttempt, mcqRunResults, validateReactionGif } from "../src/mcq.mjs";
import { newStudySession, saveSession, reviewCard, scopedCards } from "../src/study.mjs";

function fixture() {
  const nodes = [bullet("q", { text: "What is 2 + 2?" }), ...["3", "4", "5", "6"].map((text, i) => bullet(`o${i}`, { text, parentId: "q", position: i }))];
  let doc = { web: {}, tables: { bullets: nodes, decks: [{ rootId: "q" }], media: [], cards: [], review_logs: [], study_sessions: [], study_limits: [] } };
  doc = configureMcq(doc, "q", { correctOptionId: "o1", explanation: "Two pairs make four.", shuffle: true });
  doc.tables.cards = refreshCards(doc.tables.bullets, doc.tables.decks, [], [], 1000);
  return doc;
}
test("MCQs require exactly four non-empty choices and a correct answer ID", () => {
  const doc = fixture();
  assert.ok(mcqDefinition(doc, "q").valid);
  assert.throws(() => configureMcq(doc, "q", { correctOptionId: "missing" }), /correct answer/);
  const fewer = { ...doc, tables: { ...doc.tables, bullets: doc.tables.bullets.filter(node => node.id !== "o3") } };
  assert.throws(() => configureMcq(fewer, "q", { correctOptionId: "o1" }), /four/);
  assert.equal(mcqDefinition(fewer, "q").valid, false);
  assert.equal(scopedCards(fewer, null, 1000).length, 0, "Broken MCQs are not silently studied as ordinary answer cards");
});
test("shuffling is stable per session and correctness follows option identity", () => {
  const doc = fixture(), definition = mcqDefinition(doc, "q");
  const one = orderedMcqOptions(definition, "session:q"), two = orderedMcqOptions(definition, "session:q");
  assert.deepEqual(one.map(option => option.id), two.map(option => option.id));
  assert.equal(one.find(option => option.id === definition.config.correctOptionId).text, "4");
  assert.deepEqual(new Set(one.map(option => option.id)), new Set(["o0", "o1", "o2", "o3"]));
});
test("only the first attempt is stored and it survives a session round trip", () => {
  let doc = fixture();
  const session = { ...newStudySession(doc, "q", "NORMAL", 1000), tag: "quiz-run" };
  doc = saveSession(doc, session);
  doc = answerMcq(doc, session, "o0", 2000);
  const duplicate = answerMcq(doc, doc.tables.study_sessions[0], "o1", 3000);
  assert.equal(duplicate, doc);
  const restored = JSON.parse(JSON.stringify(doc));
  assert.equal(mcqAttempt(restored, restored.tables.study_sessions[0]).choiceId, "o0");
  assert.deepEqual(mcqRunResults(restored, restored.tables.study_sessions[0]), { answered: 1, correct: 0, missedIds: ["q"] });
  assert.equal(restored.tables.study_sessions[0].revealed, 1);
});
test("MCQ practice preserves schedules; a wrong spaced answer can be scheduled Again", () => {
  for (const mode of ["NORMAL", "SPACED"]) {
    let doc = fixture();
    const session = { ...newStudySession(doc, "q", mode, 1000), tag: mode };
    doc = saveSession(doc, session);
    doc = answerMcq(doc, session, "o0", 2000);
    const next = reviewCard(doc, doc.tables.study_sessions[0], "AGAIN", 1000, 2000);
    assert.equal(next.tables.cards[0].dueAtEpochMillis, mode === "NORMAL" ? doc.tables.cards[0].dueAtEpochMillis : 602000);
    assert.equal(next.tables.review_logs[0].grade, mode === "NORMAL" ? "PRACTICE" : "AGAIN");
  }
});
test("MCQ notebooks filter ordinary flashcards and edited answers invalidate old results", () => {
  const doc = fixture();
  doc.tables.bullets.push(bullet("regular", { text: "Plain question", parentId: "q", position: 10, kind: "QUESTION" }));
  // Keep the MCQ itself valid by putting the ordinary card outside its direct options.
  doc.tables.bullets.at(-1).parentId = null;
  doc.tables.cards.push({ ...doc.tables.cards[0], id: "regular" });
  doc.tables.bullets.push(bullet("collection", { text: "Mixed notes" }));
  doc.tables.bullets.find(node => node.id === "q").parentId = "collection";
  doc.tables.bullets.find(node => node.id === "regular").parentId = "collection";
  assert.equal(scopedCards(doc, "collection", 1000).length, 2);
  doc.web.deckTypes = { collection: "MCQ" };
  assert.deepEqual(scopedCards(doc, "collection", 1000).map(card => card.id), ["q"]);
  const before = mcqDefinition(doc, "q").fingerprint;
  doc.tables.bullets.find(node => node.id === "o1").text = "Four";
  assert.notEqual(mcqDefinition(doc, "q").fingerprint, before);
});
test("built-in reactions are real animated GIFs; uploads are validated before storage", async () => {
  for (const name of ["victory-wiggle", "tiny-trophy", "brain-buffering", "plot-twist"]) {
    const bytes = await readFile(new URL(`../src/assets/reactions/${name}.gif`, import.meta.url));
    await validateReactionGif(new Blob([bytes]));
    assert.equal(bytes.subarray(0, 6).toString(), "GIF89a");
    assert.ok(bytes.includes(Buffer.from("NETSCAPE2.0")), "Looping animation metadata is included");
  }
  await assert.rejects(validateReactionGif(new Blob(["not a GIF"])), /valid GIF/);
  await assert.rejects(validateReactionGif({ size: 3 * 1024 * 1024 }), /2 MB/);
});
