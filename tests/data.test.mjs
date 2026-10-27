import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import JSZip from "jszip";
import { newStudySession, reviewCard } from "../src/study.mjs";
import { builtinEmojis } from '../src/emoji-builtins.mjs';
import { configureMcq, answerMcq, mcqAttempt } from '../src/mcq.mjs';
import { bullet } from '../src/domain.mjs';
import {
  empty,
  sample,
  save,
  load,
  recovery,
  getAssets,
  archive,
  parseArchive,
  androidBlockers,
  withNodes,
} from "./.build/data.mjs";
const readZip = async (blob) => JSZip.loadAsync(await blob.arrayBuffer());
test("MCQ answers, first attempts and custom reaction GIFs survive a full backup", async () => {
  let doc = sample();
  doc = withNodes(doc, [bullet('mcq', { text: 'Pick the correct answer' }), ...['A','B','C','D'].map((text, i) => bullet(`choice-${i}`, { parentId: 'mcq', position: i, text }))]);
  doc = configureMcq(doc, 'mcq', { correctOptionId: 'choice-2', explanation: 'C is correct.', shuffle: true });
  doc = withNodes(doc, doc.tables.bullets);
  doc.web.deckTypes = { mcq: 'MCQ' };
  const session = { ...newStudySession(doc, null, 'NORMAL'), tag: 'backup-test' };
  doc.tables.study_sessions = [session];
  doc = answerMcq(doc, session, 'choice-2');
  const path = 'media/quiz-test.gif', bytes = new Uint8Array([71,73,70,56,57,97,1,0,1,0]);
  doc.web.quizReactions = { enabled: true, tone: 'playful', correct: [{ path, label: 'My celebration' }], wrong: [] };
  const restored = await parseArchive(await archive(doc, new Map([[path, new Blob([bytes], { type: 'image/gif' })]])));
  assert.equal(restored.doc.web.mcqs.mcq.correctOptionId, 'choice-2');
  assert.equal(restored.doc.web.deckTypes.mcq, 'MCQ');
  assert.equal(mcqAttempt(restored.doc, restored.doc.tables.study_sessions[0]).correct, true);
  assert.equal(restored.doc.web.quizReactions.correct[0].label, 'My celebration');
  assert.deepEqual(new Uint8Array(await restored.assets.get(path).arrayBuffer()), bytes);
  assert.ok(androidBlockers(doc).some(reason => /Multiple-choice/.test(reason)));
  await assert.rejects(archive(doc, new Map()), /Missing attachment/);
});
test("notebook designs, pinned shelf and cover images survive saving and full-backup restore", async () => {
  const doc = sample(), path = "media/deck-cover-test.png";
  const design = { preset: "sage", pattern: "dots", icon: "☘", image: path, position: 70, backdrop: true };
  doc.web.deckDesigns = { welcome: design, __desk__: { ...design, image: "" } };
  doc.web.pinnedDecks = ["welcome"];
  const assets = new Map([[path, new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })]]);
  const restored = await parseArchive(await archive(doc, assets));
  assert.deepEqual(restored.doc.web.deckDesigns, doc.web.deckDesigns);
  assert.deepEqual(restored.doc.web.pinnedDecks, ["welcome"]);
  assert.deepEqual(new Uint8Array(await restored.assets.get(path).arrayBuffer()), new Uint8Array([137, 80, 78, 71]));
  assert.ok(androidBlockers(doc).some(reason => /Notebook covers/.test(reason)));
  await assert.rejects(archive(doc, assets, true), /full web backup/);
  await assert.rejects(archive(doc, new Map()), /Missing attachment/);
});

test('inline emoji registry, tokens and animation bytes survive full and Android backup round trips', async () => {
  const doc = sample(), item = builtinEmojis[0], bytes = JSON.stringify(item.data);
  doc.tables.emojis = [{ token: item.token, fileName: 'smile.json', label: item.label }];
  doc.preferences.appearance.animateEmojis = false;
  doc.tables.bullets[0].text += ' ' + item.token;
  const assets = new Map([['emoji/smile.json', new Blob([bytes], { type: 'application/json' })]]);
  for (const android of [false, true]) {
    const restored = await parseArchive(await archive(doc, assets, android));
    assert.deepEqual(restored.doc.tables.emojis, doc.tables.emojis);
    assert.equal(restored.doc.preferences.appearance.animateEmojis, false);
    assert.equal(restored.doc.tables.bullets[0].text, doc.tables.bullets[0].text);
    assert.equal(await restored.assets.get('emoji/smile.json').text(), bytes);
  }
});
test("editing an outline preserves independent imported cards and deactivates deleted source cards", () => {
  let doc = sample();
  doc = withNodes(doc, doc.tables.bullets.map(node => node.id === 'welcome' ? { ...node, kind: 'QUESTION' } : node));
  const independent = { ...doc.tables.cards[0], id: 'independent-import', question: 'Standalone card', dueAtEpochMillis: 12345 };
  doc.tables.cards.push(independent);
  const next = withNodes(doc, doc.tables.bullets.filter(node => node.id !== 'welcome').map(node => node.parentId === 'welcome' ? { ...node, parentId: null } : node));
  assert.deepEqual(next.tables.cards.find(card => card.id === independent.id), independent);
  assert.equal(next.tables.cards.find(card => card.id === 'welcome').state, 'INACTIVE');
});
test("image-rich cards, cram logs and resumable sessions survive full and Android backups", async () => {
  let doc = sample();
  doc = withNodes(doc, doc.tables.bullets.map(node => node.id === 'welcome' ? { ...node, kind: 'QUESTION' } : node));
  const now = Date.now(), session = { ...newStudySession(doc, null, 'NORMAL', now), revealed: 1 };
  doc = reviewCard(doc, session, 'GOOD', 1500, now);
  doc.tables.media = [{ id: 'study-image', bulletId: 'welcome-1', fileName: 'diagram.avif', mimeType: 'image/avif', sourceUrl: '', credit: 'Diagram', licenseUrl: '' }];
  const images = new Map([['media/diagram.avif', new Blob([new Uint8Array([0, 1, 2, 3])], { type: 'image/avif' })]]);
  for (const android of [false, true]) {
    const restored = await parseArchive(await archive(doc, images, android));
    assert.deepEqual(restored.doc.tables.study_sessions, doc.tables.study_sessions);
    assert.deepEqual(restored.doc.tables.review_logs, doc.tables.review_logs);
    assert.equal(restored.doc.tables.media[0].mimeType, 'image/avif');
    assert.equal(restored.assets.get('media/diagram.avif').size, 4);
  }
});
test("IndexedDB, restore recovery, conflict protection and backup roundtrip", async () => {
  let doc = sample();
  doc.tables.bullets[0].formatting = "0:7:BOLD";
  doc.tables.bullets[0].vendorFlag = "opaque";
  doc.columns.bullets.push("vendorFlag");
  doc.tables.bullets[0].vendorFlag = "retain-me";
  doc.tables.cards = [
    {
      id: "historical-card",
      conceptId: "historical-card",
      question: "Prior question",
      answer: "Prior answer",
      sourceLabel: null,
      state: "INACTIVE",
      dueAtEpochMillis: 777,
      difficulty: 5,
      stability: 9,
      retrievability: 0.9,
      createdAtEpochMillis: 55,
      repetitionCount: 4,
      intervalDays: 7,
      easeFactor: 2.1,
      lastReviewAtEpochMillis: 666,
      suspended: 1,
      buriedUntilEpochMillis: 888,
    },
  ];
  doc.tables.review_logs = [
    {
      id: 12,
      cardId: "historical-card",
      grade: "GOOD",
      reviewedAtEpochMillis: 666,
      responseTimeMillis: 555,
      scheduledNextAtEpochMillis: 777,
      mode: "SPACED",
    },
  ];
  doc.tables.goals = [
    {
      id: "g",
      title: "Opaque goal",
      targetDateEpochDay: null,
      dailyMinutes: 15,
      isPrimary: 1,
      createdAtEpochMillis: 123,
    },
  ];
  const stored = await save(null, doc, "test initialize");
  assert.equal(
    (await load()).tables.bullets.find((n) => n.id === "welcome").vendorFlag,
    "retain-me",
  );
  assert.ok(androidBlockers(stored).length);
  const backed = await archive(stored, new Map()),
    imported = await parseArchive(backed);
  assert.deepEqual(imported.doc.tables.cards, doc.tables.cards);
  assert.deepEqual(imported.doc.tables.review_logs, doc.tables.review_logs);
  assert.equal(imported.doc.tables.bullets[0].vendorFlag, "retain-me");
  assert.deepEqual(imported.doc.tables.goals, doc.tables.goals);
  await assert.rejects(() => archive(stored, new Map(), true), /lose data/);
  const next = withNodes(
    stored,
    stored.tables.bullets.map((n) =>
      n.id === "welcome" ? { ...n, text: "Changed" } : n,
    ),
  );
  const written = await save(stored, next, "edit");
  await assert.rejects(() => save(stored, next, "conflict"), /Another tab/);
  assert.equal(
    (await load()).tables.bullets.find((n) => n.id === "welcome").text,
    "Changed",
  );
  const replacement = empty();
  const restored = await save(written, replacement, "restore", new Map(), true);
  assert.equal((await load()).tables.bullets.length, 0);
  assert.equal(
    (await recovery()).document.tables.bullets.find((n) => n.id === "welcome")
      .text,
    "Changed",
  );
  const clean = sample(),
    image = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
  clean.tables.media = [
    {
      id: "m",
      bulletId: "welcome",
      fileName: "picture.png",
      mimeType: "image/png",
      sourceUrl: "",
      credit: "",
      licenseUrl: "",
    },
  ];
  const zip = await archive(
      clean,
      new Map([["media/picture.png", image]]),
      true,
    ),
    data = await parseArchive(zip);
  assert.equal(data.assets.get("media/picture.png").size, 3);
  assert.equal(
    data.doc.tables.bullets.find((n) => n.id === "ideas-1").text,
    "",
  );
  assert.equal(data.warnings.length, 0);
  const damaged = await readZip(zip);
  damaged.file("media/picture.png", new Uint8Array([4, 5, 6]), {
    createFolders: false,
  });
  await assert.rejects(
    async () =>
      parseArchive(
        new Blob([await damaged.generateAsync({ type: "uint8array" })]),
      ),
    /integrity/,
  );
  assert.equal((await load()).revision, restored.revision);
  const missing = await readZip(zip);
  missing.remove("media/picture.png");
  await assert.rejects(
    async () =>
      parseArchive(
        new Blob([await missing.generateAsync({ type: "uint8array" })]),
      ),
    /missing attachment/,
  );
  const unsafe = await readZip(zip);
  unsafe.file("../escape.txt", "bad");
  await assert.rejects(
    async () =>
      parseArchive(
        new Blob([await unsafe.generateAsync({ type: "uint8array" })]),
      ),
    /Unsafe/,
  );
});
test("schema 10 migrates scheduling metadata without dropping history", async () => {
  const d = sample(),
    blob = await archive(d, new Map(), true),
    zip = await readZip(blob),
    m = JSON.parse(await zip.file("remo.json").async("string"));
  m.schema = 10;
  m.tables.cards.columns = m.tables.cards.columns.filter(
    (c) => !["suspended", "buriedUntilEpochMillis"].includes(c),
  );
  m.tables.review_logs.columns = m.tables.review_logs.columns.filter(
    (c) => c !== "mode",
  );
  delete m.tables.study_limits;
  zip.file("remo.json", JSON.stringify(m));
  const result = await parseArchive(
    new Blob([await zip.generateAsync({ type: "uint8array" })]),
  );
  assert.deepEqual(result.doc.columns.cards.slice(-2), [
    "suspended",
    "buriedUntilEpochMillis",
  ]);
  assert.ok(result.doc.tables.study_limits);
  assert.equal(result.warnings.length, 0);
});
test("duplicate ZIP names are rejected before extraction", async () => {
  const zip = new JSZip();
  zip.file("remo.json", "{}");
  zip.file("other.zip", "{}");
  const b = await zip.generateAsync({ type: "uint8array" }),
    s = new TextEncoder().encode("other.zip"),
    replacement = new TextEncoder().encode("remo.json");
  let count = 0;
  for (let i = 0; i <= b.length - s.length; i++) {
    if (s.every((c, j) => b[i + j] === c)) {
      b.set(replacement, i);
      count++;
    }
  }
  assert.equal(count, 2);
  await assert.rejects(() => parseArchive(new Blob([b])), /Duplicate/);
});
test("unknown manifest metadata and unknown table row order survive full re-export", async () => {
  const d = sample();
  d.tables.future_records = Array.from({ length: 15 }, (_, i) => ({
    id: "shared-id",
    sequence: i,
  }));
  d.columns.future_records = ["id", "sequence"];
  d.web.archiveExtensions = { futureObject: { enabled: true, n: 5 } };
  const blob = await archive(d, new Map()),
    parsed = await parseArchive(blob);
  assert.deepEqual(parsed.doc.web.archiveExtensions.futureObject, {
    enabled: true,
    n: 5,
  });
  assert.deepEqual(
    parsed.doc.tables.future_records.map((r) => r.sequence),
    Array.from({ length: 15 }, (_, i) => i),
  );
  const next = await archive(parsed.doc, parsed.assets),
    zip = await readZip(next),
    m = JSON.parse(await zip.file("remo.json").async("string"));
  assert.deepEqual(m.futureObject, { enabled: true, n: 5 });
  assert.ok(androidBlockers(parsed.doc).some((s) => s.includes("metadata")));
  await assert.rejects(
    () => archive(parsed.doc, parsed.assets, true),
    /lose data/,
  );
});
test("synchronous storage failure aborts all queued record writes", async () => {
  const before = await load(),
    revision = before.revision,
    next = {
      ...before,
      tables: {
        ...before.tables,
        goals: [
          ...before.tables.goals,
          {
            id: "transient",
            title: "Should not commit",
            targetDateEpochDay: null,
            dailyMinutes: 15,
            isPrimary: 0,
            createdAtEpochMillis: 0,
          },
          { id: "invalid", title: () => {} },
        ],
      },
    };
  await assert.rejects(() => save(before, next, "invalid-clone"));
  const after = await load();
  assert.equal(after.revision, revision);
  assert.ok(!after.tables.goals.some((g) => g.id === "transient"));
  assert.ok(!after.tables.goals.some((g) => g.id === "invalid"));
});

test('masked text survives persistence and full backup and is protected from incompatible Android export', async () => {
  const doc = withNodes(empty(), [bullet('masked', { text: 'Hidden 😀 answer', formatting: '0:9:MASK;0:6:BOLD' })]);
  await save(await load(), doc);
  const stored = await load();
  assert.equal(stored.tables.bullets[0].formatting,'0:9:MASK;0:6:BOLD');
  const restored = await parseArchive(await archive(stored,new Map()));
  assert.equal(restored.doc.tables.bullets[0].formatting,'0:9:MASK;0:6:BOLD');
  assert.ok(androidBlockers(restored.doc).some(reason => reason.includes('Masked text')));
});

test('heading and divider metadata survives full backup and preserves inline formatting', async () => {
  const doc = withNodes(empty(), [bullet('heading', {text:'Title',blockStyle:'h1',formatting:'0:5:COLOR_2463BB'}), bullet('divider',{position:1,blockStyle:'divider',dividerStyle:'dotted',dividerColor:'#27ae60'}),bullet('body',{position:2,text:'Body'})]);
  const restored = await parseArchive(await archive(doc,new Map()));
  assert.equal(restored.doc.tables.bullets.find(node=>node.id==='heading').blockStyle,'h1');
  assert.equal(restored.doc.tables.bullets.find(node=>node.id==='heading').formatting,'0:5:COLOR_2463BB');
  assert.equal(restored.doc.tables.bullets.find(node=>node.id==='divider').blockStyle,'divider');
  assert.equal(restored.doc.tables.bullets.find(node=>node.id==='divider').dividerStyle,'dotted');
  assert.equal(restored.doc.tables.bullets.find(node=>node.id==='divider').dividerColor,'#27ae60');
  assert.equal(restored.doc.tables.bullets.find(node=>node.id==='body').text,'Body');
});

test('topic deck layout, selected topic and previous-card frontier survive a full backup', async () => {
  const nodes=[bullet('ml',{text:'ML'}),bullet('topic',{parentId:'ml',text:'Foundations'}),bullet('q',{parentId:'topic',text:'Question'}),bullet('a',{parentId:'q',text:'Answer'})];
  let doc=empty();doc.tables.decks=[{rootId:'ml',createdAt:Date.now(),pinned:0,layout:'TOPICS'}];doc=withNodes(doc,nodes);
  const {saveSession}=await import('../src/study.mjs');
  doc=saveSession(doc,{...newStudySession(doc,'ml','NORMAL',Date.now(),Math.random,'topic'),furthestCursor:1});
  const restored=await parseArchive(await archive(doc,new Map()));
  assert.equal(restored.doc.tables.decks[0].layout,'TOPICS');
  assert.equal(restored.doc.tables.study_sessions[0].topicId,'topic');
  assert.equal(restored.doc.tables.study_sessions[0].furthestCursor,1);
  assert.deepEqual(restored.doc.tables.cards.map(card=>card.id),['q']);
});
