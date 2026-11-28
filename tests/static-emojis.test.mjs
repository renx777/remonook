import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  staticEmojis,
  getStaticEmoji,
  isStaticEmoji,
  staticAssetUrl,
  staticCredit,
  validateStaticSVG,
  downloadStaticEmoji,
} from "../src/static-emojis.mjs";
import {
  catalogEmojis,
  getCatalogEmoji,
  emojiCollection,
  catalogAssetPaths,
  catalogPosterPath,
  collectionFilters,
} from "../src/emoji-catalog.mjs";
import { emojiSuggestions } from "../src/emoji-suggestions.mjs";
import {
  empty,
  archive,
  parseArchive,
  references,
  androidBlockers,
} from "./.build/data.mjs";
import {
  exportPortable,
  preparePortable,
  applyPortable,
} from "../src/note-portability.mjs";
import { JSDOM } from "jsdom";
import { bullet } from "../src/domain.mjs";
import {
  applyDocument,
  mergeUpdates,
  projectBuckets,
} from "../src/sync-buckets.mjs";
const fixture = (pack) =>
  readFile(
    new URL("./fixtures/static-emoji/" + pack + ".svg", import.meta.url),
  );
test("pinned static catalogues contain real Unicode variants with distinct artwork identities and shared search", () => {
  assert.equal(staticEmojis.length, 7907);
  assert.equal(
    new Set(catalogEmojis.map((e) => e.token)).size,
    catalogEmojis.length,
  );
  for (const item of staticEmojis) {
    assert.equal(getCatalogEmoji(item.token), item);
    assert.ok(isStaticEmoji(item));
    assert.equal(emojiCollection(item), item.pack);
    assert.match(
      staticAssetUrl(item),
      /^https:\/\/raw\.githubusercontent\.com\/(?:jdecked\/twemoji|hfg-gmuend\/openmoji)\/[a-f0-9]{40}\//,
    );
    assert.equal(catalogPosterPath(item), "emoji/" + item.fileName);
    assert.deepEqual(catalogAssetPaths(item), ["emoji/" + item.fileName]);
    assert.ok(item.bytes > 0 && item.bytes < 1024 * 1024);
  }
  for (const pack of ["twemoji", "openmoji"]) {
    assert.ok(getStaticEmoji(":" + pack + "_1f600:"));
    assert.equal(getStaticEmoji(":" + pack + "_1f44d_1f3fb:").fallback, "👍🏻");
    assert.equal(getStaticEmoji(":" + pack + "_a9:").fallback, "©");
    assert.ok(
      getStaticEmoji(":" + pack + "_23_fe0f_20e3:"),
      "keycap sequences with upstream leading zeroes are mapped",
    );
    assert.ok(collectionFilters.some(([id]) => id === pack));
    assert.match(
      staticCredit(getStaticEmoji(":" + pack + "_1f600:")),
      /Artwork unchanged/,
    );
  }
  const results = emojiSuggestions(catalogEmojis, "grinning face", 24);
  for (const pack of ["noto", "fluent", "twemoji", "openmoji"])
    assert.ok(
      results.some((e) => emojiCollection(e) === pack),
      pack + " is searchable",
    );
});
test("static downloads verify pinned bytes and carry attribution inside the one retained offline asset", async () => {
  const original = globalThis.fetch;
  try {
    for (const pack of ["twemoji", "openmoji"]) {
      const known = getStaticEmoji(":" + pack + "_1f600:"),
        bytes = await fixture(pack);
      let requests = 0;
      globalThis.fetch = async (url, options) => {
        requests++;
        assert.equal(url, staticAssetUrl(known));
        assert.equal(options.credentials, "omit");
        assert.equal(options.referrerPolicy, "no-referrer");
        return new Response(bytes);
      };
      const files = await downloadStaticEmoji({
        ...known,
        path: "../../evil",
        fileName: "bad.svg",
      });
      assert.equal(files.size, 1);
      assert.equal(requests, 1);
      const blob = files.get("emoji/" + known.fileName),
        text = await blob.text();
      assert.equal(blob.type, "image/svg+xml");
      assert.match(text, /<metadata>/);
      assert.ok(
        text.includes(pack === "openmoji" ? "CC-BY-SA-4.0" : "CC-BY-4.0"),
      );
      assert.ok(text.includes("Artwork unchanged"));
      const altered = new Uint8Array(bytes);
      altered[100] ^= 1;
      globalThis.fetch = async () => new Response(altered);
      await assert.rejects(downloadStaticEmoji(known), /integrity/);
      globalThis.fetch = async () => new Response("<svg/>");
      await assert.rejects(downloadStaticEmoji(known), /Incomplete/);
    }
    await assert.rejects(
      downloadStaticEmoji({ token: ":unknown:" }),
      /Unknown/,
    );
    const controller = new AbortController();
    controller.abort();
    globalThis.fetch = async (_url, { signal }) => {
      signal.throwIfAborted();
    };
    await assert.rejects(
      downloadStaticEmoji(staticEmojis[0], controller.signal),
      (e) => e.name === "AbortError",
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("SVG validation rejects active, external and oversized resources", () => {
  for (const text of [
    "<svg><script>alert(1)</script></svg>",
    '<svg><image href="https://evil.test/x"/></svg>',
    "<!DOCTYPE svg><svg/>",
    '<svg onload="x"/>',
    '<svg><style>@import "x";</style></svg>',
    '<svg><path fill="url(https://evil.test/x)"/></svg>',
  ])
    assert.throws(() => validateStaticSVG(new TextEncoder().encode(text)));
  assert.throws(() => validateStaticSVG(new Uint8Array(1024 * 1024 + 1)));
});
test("static art and embedded notices survive ordinary backup, portable packages and two-client sync", async () => {
  const original = globalThis.fetch;
  try {
    const item = getStaticEmoji(":openmoji_1f600:");
    globalThis.fetch = async () => new Response(await fixture("openmoji"));
    const assets = await downloadStaticEmoji(item),
      doc = empty();
    doc.tables.bullets = [
      bullet("emoji-note", { text: "Keep :openmoji_1f600: and :noto_1f600:" }),
    ];
    doc.tables.emojis = [
      { token: item.token, fileName: item.fileName, label: item.label },
    ];
    assert.deepEqual([...references(doc)], ["emoji/" + item.fileName]);
    assert.ok(androidBlockers(doc).some((s) => s.includes("OpenMoji")));
    const restored = await parseArchive(await archive(doc, assets));
    assert.equal(
      restored.doc.tables.bullets[0].text,
      doc.tables.bullets[0].text,
    );
    assert.equal(
      await restored.assets.get("emoji/" + item.fileName).text(),
      await assets.get("emoji/" + item.fileName).text(),
    );
    const exported = await exportPortable(doc, assets),
      prepared = await preparePortable(
        Object.assign(exported.blob, { name: "emoji.zip" }),
        { Parser: new JSDOM("").window.DOMParser },
      ),
      imported = applyPortable(empty(), prepared);
    assert.equal(imported.tables.emojis[0].token, item.token);
    assert.ok(
      (
        await Promise.all([...prepared.assets.values()].map((x) => x.text()))
      ).some((text) => text.includes("CC-BY-SA-4.0")),
    );
    const base = empty(),
      states = applyDocument(new Map(), null, base, { clientID: 70 }).states,
      a = applyDocument(states, base, doc, { clientID: 71 }).updates,
      b = applyDocument(
        states,
        base,
        {
          ...base,
          tables: {
            ...base.tables,
            bullets: [bullet("other", { text: "Other device" })],
          },
        },
        { clientID: 72 },
      ).updates;
    for (const order of [
      [a, b],
      [b, a],
    ]) {
      let merged = states;
      for (const updates of order) merged = mergeUpdates(merged, updates);
      const out = projectBuckets(merged).doc;
      assert.ok(out.tables.bullets.some((n) => n.text === "Other device"));
      assert.equal(out.tables.emojis[0].token, item.token);
    }
  } finally {
    globalThis.fetch = original;
  }
});
