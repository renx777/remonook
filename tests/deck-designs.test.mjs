import { test } from "node:test";
import assert from "node:assert/strict";
import { deckDesign, coverPresets, prepareCoverImage } from "./.build/deck-designs.mjs";
import { sample } from "./.build/data.mjs";

test("notebook defaults are stable and imported designs are bounded and local", () => {
  const doc = sample();
  assert.deepEqual(deckDesign(doc, "welcome"), deckDesign(doc, "welcome"));
  assert.equal(coverPresets.length, 8);
  doc.web.deckDesigns = { welcome: { preset: "unknown", pattern: "<script>", image: "https://example.com/tracking.png", position: 800, icon: "invalid", backdrop: "yes" } };
  const design = deckDesign(doc, "welcome");
  assert.ok(coverPresets.some(preset => preset.id === design.preset));
  assert.equal(design.image, "");
  assert.equal(design.pattern, "plain");
  assert.equal(design.position, 100);
  assert.equal(design.backdrop, false);
});
test("cover uploads reject unsupported and oversized images before decoding", async () => {
  await assert.rejects(prepareCoverImage({ type: "image/svg+xml", size: 100 }), /JPG, PNG, WebP or AVIF/);
  await assert.rejects(prepareCoverImage({ type: "image/png", size: 3 * 1024 * 1024 }), /under 2 MB/);
});
test("cover images are resized, compressed and temporary URLs are released", async () => {
  const previous = { image: globalThis.Image, document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  const size = { width: 3200, height: 2400 }, released = [];
  let canvas;
  globalThis.Image = class { get naturalWidth() { return size.width; } get naturalHeight() { return size.height; } async decode() {} };
  URL.createObjectURL = () => "blob:test-cover";
  URL.revokeObjectURL = url => released.push(url);
  globalThis.document = { createElement: () => (canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toBlob: (callback, type) => callback(new Blob(["compressed"], { type })) }) };
  try {
    const blob = await prepareCoverImage({ type: "image/jpeg", size: 50000 });
    assert.equal(blob.type, "image/webp");
    assert.equal(canvas.width, 1600);
    assert.equal(canvas.height, 1200);
    assert.deepEqual(released, ["blob:test-cover"]);
    size.width = size.height = 10000;
    await assert.rejects(prepareCoverImage({ type: "image/png", size: 50000 }), /50 megapixels/);
    assert.equal(released.length, 2, "Failed image processing also releases its URL");
  } finally {
    if (previous.image === undefined) delete globalThis.Image; else globalThis.Image = previous.image;
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    URL.createObjectURL = previous.create;
    URL.revokeObjectURL = previous.revoke;
  }
});
