import test from "node:test";
import assert from "node:assert/strict";
import { empty } from "./.build/data.mjs";
import { planTrashPurge } from "./.build/trash-purge.mjs";
const entry = (id, media = []) => ({
  id,
  title: id,
  nodeCount: 1,
  payload: JSON.stringify({ nodes: [], media }),
  deletedAt: 1,
});
test("empty trash purges reviewed entries together and preserves live/shared/late-arriving attachments", () => {
  const doc = empty();
  doc.tables.trash = [
    entry("a", [{ fileName: "shared.png" }, { fileName: "only-a.png" }]),
    entry("b", [{ fileName: "only-b.png" }]),
    entry("arrived-later", [{ fileName: "shared.png" }]),
  ];
  doc.tables.media = [{ fileName: "only-b.png", bulletId: "live" }];
  const { next, removed, count } = planTrashPurge(doc, ["a", "b"]);
  assert.equal(count, 2);
  assert.deepEqual(
    next.tables.trash.map((t) => t.id),
    ["arrived-later"],
  );
  assert.deepEqual(removed, ["media/only-a.png"]);
  assert.equal(doc.tables.trash.length, 3);
  assert.equal(next.tables.media, doc.tables.media);
});
test("purge deduplicates attachment removals, skips already-restored IDs and rejects corrupt payloads before writing", () => {
  const doc = empty();
  doc.tables.trash = [
    entry("a", [{ fileName: "same.png" }]),
    entry("b", [{ fileName: "same.png" }]),
  ];
  assert.deepEqual(planTrashPurge(doc, ["a", "b"]).removed, ["media/same.png"]);
  assert.equal(planTrashPurge(doc, ["restored"]).count, 0);
  doc.tables.trash[0].payload = "invalid";
  assert.throws(() => planTrashPurge(doc, ["a", "b"]));
  assert.equal(doc.tables.trash.length, 2);
});
