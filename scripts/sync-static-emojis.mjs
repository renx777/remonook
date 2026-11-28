// Pinned upstream catalogues. Running this is explicit; builds never contact providers.
import { writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const sources = {
  twemoji: {
    repo: "jdecked/twemoji",
    commit: "b6b55fef1e8636b540a6d016a4729ca8cdf2e60b",
    prefix: "assets/svg/",
    license: "CC-BY-4.0",
  },
  openmoji: {
    repo: "hfg-gmuend/openmoji",
    commit: "2038866215b0d8217cc3f62e595ddef88edf9656",
    prefix: "color/svg/",
    license: "CC-BY-SA-4.0",
  },
};
async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw Error(url + ": " + r.status);
  return r.json();
}
const metadata = await json(
  "https://raw.githubusercontent.com/" +
    sources.openmoji.repo +
    "/" +
    sources.openmoji.commit +
    "/data/openmoji.json",
);
const categories = {
  "smileys-emotion": "Smileys and emotions",
  "people-body": "People",
  "animals-nature": "Animals and nature",
  "food-drink": "Food and drink",
  "travel-places": "Travel and places",
  activities: "Activities and events",
  objects: "Objects",
  symbols: "Symbols",
  flags: "Flags",
};
const rows = metadata.filter(
  (x) => Object.hasOwn(categories, x.group) && typeof x.emoji === "string",
);
const catalogs = {};
for (const [pack, source] of Object.entries(sources)) {
  const tree = await json(
    "https://api.github.com/repos/" +
      source.repo +
      "/git/trees/" +
      source.commit +
      "?recursive=1",
  );
  if (tree.truncated) throw Error("Incomplete upstream tree");
  const paths = new Map(
    tree.tree
      .filter(
        (x) =>
          x.type === "blob" &&
          x.path.startsWith(source.prefix) &&
          x.path.endsWith(".svg"),
      )
      .map((x) => [x.path.slice(source.prefix.length, -4).toLowerCase(), x]),
  );
  const seen = new Set(),
    items = [];
  for (const row of rows) {
    const original = row.hexcode.toLowerCase().split("-"),
      canonical = original.filter((x) => x !== "fe0f");
    const keys =
      pack === "openmoji"
        ? [original.join("-")]
        : [
            canonical.map((x) => parseInt(x, 16).toString(16)).join("-"),
            original.map((x) => parseInt(x, 16).toString(16)).join("-"),
          ];
    const entry = keys.map((k) => paths.get(k)).find(Boolean);
    if (!entry) continue;
    const codepoint = original
      .map((x) => parseInt(x, 16).toString(16))
      .join("_");
    if (seen.has(codepoint)) continue;
    seen.add(codepoint);
    const label = row.annotation[0].toUpperCase() + row.annotation.slice(1);
    items.push({
      codepoint,
      label,
      ...(pack === "openmoji"
        ? { author: String(row.author || "OpenMoji contributors") }
        : {}),
      category: categories[row.group],
      tags: [
        ...new Set([
          row.annotation,
          ...String(row.tags || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        ]),
      ],
      path: entry.path,
      gitBlob: entry.sha,
      bytes: entry.size,
    });
  }
  if (items.length < 3000)
    throw Error(
      "Unexpectedly incomplete " + pack + " catalog: " + items.length,
    );
  catalogs[pack] = { ...source, count: items.length, items };
}
await writeFile(
  "src/static-emoji-catalog.json",
  JSON.stringify({
    metadataSource: {
      repo: sources.openmoji.repo,
      commit: sources.openmoji.commit,
      license: "CC-BY-SA-4.0",
    },
    ...catalogs,
  }) + "\n",
);
await mkdir("tests/fixtures/static-emoji", { recursive: true });
for (const [pack, catalog] of Object.entries(catalogs)) {
  const smile = catalog.items.find((x) => x.codepoint === "1f600"),
    url =
      "https://raw.githubusercontent.com/" +
      catalog.repo +
      "/" +
      catalog.commit +
      "/" +
      smile.path,
    r = await fetch(url);
  if (!r.ok) throw Error("Fixture download failed");
  const data = Buffer.from(await r.arrayBuffer());
  if (
    createHash("sha1")
      .update(Buffer.concat([Buffer.from("blob " + data.length + "\0"), data]))
      .digest("hex") !== smile.gitBlob
  )
    throw Error("Upstream fixture hash mismatch");
  await writeFile("tests/fixtures/static-emoji/" + pack + ".svg", data);
  console.log(pack + ": " + catalog.count + " emoji");
}
