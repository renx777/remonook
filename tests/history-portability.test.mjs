import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";
import JSZip from "jszip";
import * as data from "./.build/data.mjs";
import { bullet, encode, marks } from "../src/domain.mjs";
import { applyDocument } from "../src/sync-buckets.mjs";
import { historyChanges, restoreHistoricalNote } from "../src/note-history.mjs";
import {
  exportPortable,
  preparePortable,
  applyPortable,
  parseOpml,
  exportOutline,
} from "../src/note-portability.mjs";
const Parser = new JSDOM("").window.DOMParser;
const file = (blob, name) => Object.assign(blob, { name });
const next = (d, nodes) => ({ ...d, tables: { ...d.tables, bullets: nodes } });
test("atomic local history survives reload and deletion, preserves historical attachment bytes and restores a new identity", async () => {
  data.setStorageAccount("history-a");
  const image = new Blob(["old image"], { type: "image/png" }),
    base = data.empty();
  base.tables.bullets = [bullet("n", { text: "Before" })];
  base.tables.media = [
    {
      id: "m",
      bulletId: "n",
      fileName: "p.png",
      mimeType: "image/png",
      sourceUrl: "",
      credit: "credit",
      licenseUrl: "",
    },
  ];
  let doc = await data.save(
    null,
    base,
    "create",
    new Map([["media/p.png", image]]),
  );
  doc = await data.save(
    doc,
    next(doc, [{ ...doc.tables.bullets[0], text: "After" }]),
    "edit",
  );
  const edited = (await data.noteHistory("n"))[0];
  assert.equal(edited.before.text, "Before");
  assert.equal(edited.after.text, "After");
  doc = await data.save(
    doc,
    { ...next(doc, []), tables: { ...doc.tables, bullets: [], media: [] } },
    "delete",
    undefined,
    false,
    ["media/p.png"],
  );
  assert.equal((await data.getAssets()).has("media/p.png"), false);
  const removed = (await data.noteHistory("n"))[0];
  assert.equal(removed.after, null);
  assert.equal(
    await (await data.historicalFiles(removed)).get("media/p.png").text(),
    "old image",
  );
  const restored = restoreHistoricalNote(doc, removed);
  assert.notEqual(restored.id, "n");
  assert.equal(restored.doc.tables.bullets[0].text, "After");
  assert.notEqual(restored.doc.tables.media[0].fileName, "p.png");
  assert.equal(doc.tables.bullets.length, 0);
  const exported = await data.exportNoteHistory();
  const imported = await data.prepareHistoryImport(exported);
  data.setStorageAccount("history-b");
  assert.deepEqual(await data.noteHistory(), []);
  await data.importNoteHistory(imported);
  assert.equal((await data.noteHistory("n")).length, 3);
  assert.equal(await data.load(), null);
  assert.equal(
    await (await data.historicalFiles((await data.noteHistory("n"))[0]))
      .get("media/p.png")
      .text(),
    "old image",
  );
});
test("history failure rolls back notes and ordinary outbox writes; collapse and position-only changes do not create noise", async () => {
  data.setStorageAccount("history-rollback");
  let doc = data.empty();
  doc.tables.bullets = [bullet("a", { text: "Keep" })];
  doc = await data.save(null, doc, "seed");
  await data.syncOperation("initialize", {
    response: { protocol: 3, revision: 0, updates: {} },
    doc,
    assets: [],
  });
  const pending = await data.syncMetadata();
  const count = (await data.noteHistory()).length,
    put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === "recovery")
      throw new DOMException("full", "QuotaExceededError");
    return put.apply(this, args);
  };
  try {
    await assert.rejects(
      data.save(
        doc,
        next(doc, [{ ...doc.tables.bullets[0], text: "Rejected" }]),
        "edit",
      ),
      /full/,
    );
  } finally {
    IDBObjectStore.prototype.put = put;
  }
  assert.equal((await data.load()).tables.bullets[0].text, "Keep");
  assert.equal((await data.noteHistory()).length, count);
  assert.deepEqual(
    await data.syncMetadata(),
    pending,
    "The durable outbox rolled back with the failed history write",
  );
  assert.deepEqual(
    historyChanges(
      doc,
      next(doc, [{ ...doc.tables.bullets[0], collapsed: true, position: 3 }]),
    ),
    [],
  );
});
test("portable package round-trips attachments, nested ordered notes, formatting and internal links with fresh IDs", async () => {
  const d = data.empty(),
    text = "See [[Child|child]]";
  d.tables.bullets = [
    bullet("root", {
      text,
      formatting: encode([{ start: 0, end: text.length, style: "BOLD" }]),
    }),
    bullet("child", { parentId: "root", text: "Nested", listType: "ORDERED" }),
  ];
  d.tables.media = [
    {
      id: "m",
      bulletId: "child",
      fileName: "pic.png",
      mimeType: "image/png",
      sourceUrl: "",
      credit: "Original credit",
      licenseUrl: "https://example.test/license",
    },
  ];
  const output = await exportPortable(
    d,
    new Map([
      ["media/pic.png", new Blob(["image bytes"], { type: "image/png" })],
    ]),
  );
  const zip = await JSZip.loadAsync(await output.blob.arrayBuffer());
  assert.match(await zip.file("notes.md").async("string"), /media\/pic.png/);
  assert.match(await zip.file("notes.opml").async("string"), /<outline/);
  const prepared = await preparePortable(file(output.blob, "notes.zip"), {
    Parser,
  });
  assert.equal(prepared.media.length, 1);
  assert.equal(await [...prepared.assets.values()][0].text(), "image bytes");
  const child = prepared.nodes.find((n) => n.text === "Nested"),
    root = prepared.nodes.find((n) => n.text.startsWith("See "));
  assert.equal(child.parentId, root.id);
  assert.equal(child.listType, "ORDERED");
  assert.ok(root.text.includes("|" + child.id + "]]"));
  assert.equal(
    marks(root.formatting, root.text.length)[0].end,
    root.text.length,
  );
  assert.notEqual(child.id, "child");
  assert.notEqual(prepared.media[0].fileName, "pic.png");
  assert.equal(prepared.media[0].credit, "Original credit");
  const target = data.empty();
  target.tables.bullets = [bullet("existing", { text: "Keep" })];
  const merged = applyPortable(target, prepared);
  assert.equal(merged.tables.bullets[0], target.tables.bullets[0]);
  assert.equal(applyPortable(merged, prepared), merged);
  assert.throws(() => applyPortable(target, prepared, "deleted"), /deleted/);
});
test("plain Markdown and OPML preserve nesting, support Unicode, reject DTDs and report additional attributes", async () => {
  const md = await preparePortable(
    file(new Blob(["- Parent\n  1. **日本語**\n  - [x] Done"]), "notes.md"),
    { Parser },
  );
  assert.equal(md.count, 3);
  assert.equal(md.nodes.find((n) => n.text === "Done").taskState, "DONE");
  const parsed = parseOpml(
    '<opml version="2.0"><body><outline text="Parent" custom="keep me"><outline text="日本語"/></outline></body></opml>',
    Parser,
  );
  assert.equal(parsed.items[1].depth, 1);
  assert.ok(parsed.warnings.some((w) => w.includes("keep me")));
  assert.throws(
    () =>
      parseOpml(
        '<!DOCTYPE opml [<!ENTITY x SYSTEM "file:///etc/passwd">]><opml><body/></opml>',
        Parser,
      ),
    /entities/,
  );
  assert.throws(() => parseOpml("<opml><body>", Parser), /Invalid/);
  const op = await preparePortable(
    file(
      new Blob([
        exportOutline({
          ...data.empty(),
          tables: {
            ...data.empty().tables,
            bullets: [bullet("a", { text: "A & B" })],
          },
        }).opml,
      ]),
      "notes.opml",
    ),
    { Parser },
  );
  assert.ok(op.nodes.some((n) => n.text === "A & B"));
});
test("missing files and unsupported input are reported or refused; ZIP traversal and history forgery are rejected", async () => {
  const d = data.empty();
  d.tables.bullets = [bullet("a", { text: "A" })];
  d.tables.media = [
    { id: "m", bulletId: "a", fileName: "missing.png", mimeType: "image/png" },
  ];
  const out = await exportPortable(d, new Map());
  assert.ok(out.warnings.some((w) => w.includes("Missing")));
  const prepared = await preparePortable(file(out.blob, "notes.zip"), {
    Parser,
  });
  assert.equal(prepared.media.length, 0);
  assert.ok(
    prepared.nodes.some((n) => n.text.startsWith("Missing attachment")),
  );
  const zip = new JSZip();
  zip.file("../evil", "bad");
  await assert.rejects(
    preparePortable(
      file(
        new Blob([await zip.generateAsync({ type: "uint8array" })]),
        "bad.zip",
      ),
      { Parser },
    ),
    /Unsafe/,
  );
  await assert.rejects(
    preparePortable(file(new Blob(["~~struck~~"]), "bad.md"), { Parser }),
    /strikethrough/,
  );
  await assert.rejects(
    data.prepareHistoryImport(out.blob),
    /Unsafe|Incomplete/,
  );
});
test("attachment replacements keep both byte versions without overwriting the current file", async () => {
  data.setStorageAccount("history-versions");
  let d = data.empty();
  d.tables.bullets = [bullet("n", { text: "Same text" })];
  d.tables.media = [
    { id: "m", bulletId: "n", fileName: "same.png", mimeType: "image/png" },
  ];
  d = await data.save(
    null,
    d,
    "create",
    new Map([["media/same.png", new Blob(["old"])]]),
  );
  d = await data.save(
    d,
    d,
    "replace-image",
    new Map([["media/same.png", new Blob(["new"])]]),
  );
  const e = (await data.noteHistory("n"))[0];
  assert.equal(
    await (await data.historicalFiles(e, "before"))
      .get("media/same.png")
      .text(),
    "old",
  );
  assert.equal(
    await (await data.historicalFiles(e, "after")).get("media/same.png").text(),
    "new",
  );
  const restored = restoreHistoricalNote(d, e, "before");
  assert.equal(restored.doc.tables.bullets.length, 2);
  assert.equal(restored.doc.tables.media[0].fileName, "same.png");
  assert.notEqual(restored.doc.tables.media[1].fileName, "same.png");
});
test("portable import never reuses source identities and preserves a link outside the imported package with a visible report", async () => {
  const d = data.empty();
  d.tables.bullets = [bullet("n", { text: "External [[Other|outside]]" })];
  const blob = (await exportPortable(d, new Map())).blob;
  const a = await preparePortable(file(blob, "notes.zip"), { Parser }),
    b = await preparePortable(file(blob, "notes.zip"), { Parser });
  assert.notEqual(a.id, b.id);
  assert.ok(a.warnings.some((w) => w.includes("outside")));
  assert.ok(a.nodes.some((n) => n.text === "External Other"));
  assert.ok(
    a.nodes.some((n) =>
      n.text.includes(
        "Unresolved note link retained in report: [[Other|outside]]",
      ),
    ),
  );
  const partial = {
    ...data.empty(),
    tables: { ...data.empty().tables, bullets: [a.nodes[0]] },
  };
  assert.throws(() => applyPortable(partial, a), /Partial/);
});

test("adopted remote text creates local history without producing a local cloud operation", async () => {
  data.setStorageAccount("history-remote");
  let doc = data.empty();
  doc.tables.bullets = [bullet("remote", { text: "Before remote" })];
  doc = await data.save(null, doc, "seed");
  const initial = applyDocument(new Map(), null, doc, { clientID: 301 });
  await data.syncOperation("initialize", {
    response: {
      protocol: 3,
      revision: 1,
      updates: Object.fromEntries(initial.states),
    },
    doc,
    assets: [],
  });
  const changed = applyDocument(
    initial.states,
    doc,
    next(doc, [{ ...doc.tables.bullets[0], text: "Remote text" }]),
    { clientID: 302 },
  );
  await data.syncOperation("receive", {
    response: { protocol: 3, revision: 2, updates: changed.updates },
  });
  const inspected = await data.syncOperation("inspect", { doc, assets: [] });
  assert.ok(inspected.needsApply);
  doc = await data.save(
    doc,
    inspected.doc,
    "cloud adoption",
    undefined,
    false,
    [],
    inspected.state,
  );
  const event = (await data.noteHistory("remote"))[0];
  assert.equal(event.before.text, "Before remote");
  assert.equal(event.after.text, "Remote text");
  assert.equal((await data.syncMetadata()).pending.length, 0);
});

test("custom emoji artwork is retained by history and portable notes without overwriting a conflicting library", async () => {
  data.setStorageAccount("history-emoji");
  const row = { token: ":tiny:", label: "Tiny", fileName: "tiny.json" };
  let d = data.empty();
  d.tables.bullets = [bullet("emoji-note", { text: "My :tiny: note" })];
  d.tables.emojis = [row];
  d = await data.save(
    null,
    d,
    "emoji create",
    new Map([
      ["emoji/tiny.json", new Blob(["artwork"], { type: "application/json" })],
    ]),
  );
  d = await data.save(
    d,
    { ...d, tables: { ...d.tables, emojis: [] } },
    "remove emoji",
    undefined,
    false,
    ["emoji/tiny.json"],
  );
  const entry = (await data.noteHistory("emoji-note"))[0];
  assert.equal(
    await (await data.historicalFiles(entry)).get("emoji/tiny.json").text(),
    "artwork",
  );
  assert.equal(
    restoreHistoricalNote(d, entry).doc.tables.emojis[0].token,
    ":tiny:",
  );
  const original = { ...d, tables: { ...d.tables, emojis: [row] } };
  const exported = await exportPortable(
    original,
    new Map([["emoji/tiny.json", new Blob(["artwork"])]]),
  );
  const p = await preparePortable(file(exported.blob, "notes.zip"), { Parser });
  assert.equal(await p.assets.get("emoji/tiny.json").text(), "artwork");
  assert.equal(p.assets.get("emoji/tiny.json").type, "application/json");
  assert.equal(applyPortable(data.empty(), p).tables.emojis[0].token, ":tiny:");
  const conflict = {
    ...data.empty(),
    tables: {
      ...data.empty().tables,
      emojis: [{ ...row, fileName: "different.json" }],
    },
  };
  assert.throws(() => applyPortable(conflict, p), /different artwork/);
  assert.equal(conflict.tables.emojis[0].fileName, "different.json");
});
