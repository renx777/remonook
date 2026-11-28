import {
  emojiFiles,
  mergePortableEmojis,
  portableMime,
} from "./portable-emoji.mjs";
import JSZip from "jszip";
import { applyDocument } from "./sync-buckets.mjs";
import { inspectZip } from "./zip-safety.ts";
import { bullet, uuid, validate, marks, encode, index } from "./domain.mjs";
import {
  parseMarkdown,
  itemsToBullets,
  bulletMarkdown,
} from "./ai-markdown.mjs";
const MAX = 64 * 1024 * 1024,
  MAX_NOTES = 10000;
const readJSON = (text) =>
  JSON.parse(text, (key, value) => {
    if ((["__proto__", "constructor", "prototype"].includes(key) || key.startsWith("_sync")))
      throw Error("Unsafe imported field.");
    return value;
  });
const attachmentPath = (p) =>
  /^(media|emoji)\/[A-Za-z0-9._-]+$/.test(p) &&
  ![".", ".."].includes(p.split("/")[1]);
const mediaPath = (p) =>
  /^media\/[A-Za-z0-9._-]+$/.test(p) && ![".", ".."].includes(p.slice(6));
const xml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r/g, "&#13;")
    .replace(/\n/g, "&#10;");
export function exportOutline(doc) {
  const idx = index(doc.tables.bullets),
    md = [],
    op = [];
  let count = 0;
  function walk(parent, depth) {
    if (depth > 128) throw Error("Outline is too deep for portable export.");
    for (const n of idx.children.get(parent) || []) {
      if (++count > MAX_NOTES)
        throw Error("Export at most 10,000 bullets per package.");
      const text = bulletMarkdown(n);
      md.push(
        "  ".repeat(depth) +
          (n.listType === "ORDERED" ? "1. " : "- ") +
          text.replace(/\n/g, "\n" + "  ".repeat(depth + 1)),
      );
      for (const m of doc.tables.media.filter((m) => m.bulletId === n.id))
        md.push(
          "  ".repeat(depth + 1) +
            (String(m.mimeType).startsWith("image/") ? "!" : "") +
            "[" +
            m.fileName.replace(/[\[\]]/g, "") +
            "](media/" +
            m.fileName +
            ")",
        );
      op.push(
        '<outline text="' +
          xml(text) +
          '" _listType="' +
          xml(n.listType) +
          '">',
      );
      walk(n.id, depth + 1);
      op.push("</outline>");
    }
  }
  walk(null, 0);
  return {
    markdown: md.join("\n") + "\n",
    opml:
      '<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>RemoNook notes</title></head><body>' +
      op.join("") +
      "</body></opml>",
  };
}
export function parseOpml(text, Parser = globalThis.DOMParser) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw Error("OPML entities and DTDs are not allowed.");
  if (!Parser) throw Error("XML parsing is unavailable.");
  const doc = new Parser().parseFromString(text, "application/xml");
  if (
    doc.querySelector("parsererror") ||
    doc.documentElement.localName !== "opml"
  )
    throw Error("Invalid OPML.");
  const body = doc.documentElement.querySelector(":scope > body");
  if (!body) throw Error("OPML body missing.");
  const items = [],
    warnings = [];
  function walk(parent, depth) {
    if (depth > 128) throw Error("OPML is too deep.");
    for (const n of parent.children) {
      if (n.localName !== "outline") {
        warnings.push("Ignored OPML element: " + n.localName);
        continue;
      }
      if (items.length >= MAX_NOTES)
        throw Error("Import at most 10,000 bullets.");
      const raw = n.getAttribute("text") ?? n.getAttribute("_text") ?? "";
      const parsed = parseMarkdown("- " + raw.replace(/\n/g, "\n  "));
      const first = parsed[0] || {
        text: raw,
        formatting: "",
        taskState: "NONE",
        listType: "NONE",
      };
      items.push({
        ...first,
        depth,
        ...(["NONE", "UNORDERED", "ORDERED"].includes(
          n.getAttribute("_listType"),
        )
          ? { listType: n.getAttribute("_listType") }
          : {}),
      });
      if (parsed.length > 1)
        warnings.push("Multi-block OPML text retained literally.");
      if (parsed.length > 1)
        items[items.length - 1] = {
          ...first,
          text: raw,
          formatting: "",
          depth,
        };
      for (const attr of n.attributes)
        if (!["text", "_text", "_listType"].includes(attr.name))
          warnings.push(
            "OPML attribute retained in report: " +
              attr.name +
              "=" +
              attr.value,
          );
      walk(n, depth + 1);
    }
  }
  walk(body, 0);
  return { items, warnings };
}
function movedFormatting(formatting,text,map,warnings){
  const unknown=(formatting||"").split(";").filter(Boolean).filter(part=>!marks(part,text.length).length);
  if(unknown.length)warnings.push("Unrecognized formatting retained verbatim; review remapped note: "+unknown.join(";"));
  return [encode(marks(formatting||"",text.length).map(m=>({...m,start:map(m.start),end:map(m.end)}))),...unknown].filter(Boolean).join(";");
}
export function remapNoteLinks(node, ids, warnings) {
  let text = node.text,
    changes = [];
  const next = text.replace(
    /\[\[([^\]\n|]*)\|([^\]\n|]+)\]\]/g,
    (all, label, id, at) => {
      let value;
      if (!ids.has(id)) {
        warnings.push("Unresolved note link retained in report: " + all);
        value = label || "Untitled";
      } else value = "[[" + label + "|" + ids.get(id) + "]]";
      changes.push({
        start: at,
        end: at + all.length,
        delta: value.length - all.length,
        length: value.length,
      });
      return value;
    },
  );
  const offset = (p) => {
    let delta = 0;
    for (const c of changes) {
      if (p <= c.start) break;
      if (p < c.end) return c.start + delta + Math.min(p - c.start, c.length);
      delta += c.delta;
    }
    return p + delta;
  };
  if(next===text)return node;
  return {...node,text:next,formatting:movedFormatting(node.formatting,text,offset,warnings)};
}
export async function exportPortable(doc, assets) {
  validate(doc.tables.bullets);
  const exportedEmojis = (doc.tables.emojis || []).filter((e) =>
    doc.tables.bullets.some((n) => n.text.includes(e.token)),
  );
  const readable = exportOutline(doc),
    zip = new JSZip(),
    warnings = [
      "Study scheduling, workspace settings and device-local history are separate exports.",
      "Internal note links are preserved on RemoNook reimport. Other readers may display their original syntax.",
    ],
    media = [];
  const written = new Set();
  let size = 0;
  for (const m of doc.tables.media) {
    const path = "media/" + m.fileName;
    if (!mediaPath(path)) throw Error("Unsafe attachment path.");
    const blob = assets.get(path);
    media.push(m);
    if (!blob) {
      warnings.push("Missing attachment: " + path);
      continue;
    }
    if (written.has(path)) continue;
    written.add(path);
    size += blob.size;
    if (size > MAX || blob.size > MAX)
      throw Error("Portable attachments exceed 64 MiB.");
    zip.file(path, await blob.arrayBuffer(), { createFolders: false });
  }
  for (const path of emojiFiles(exportedEmojis)) {
    if (!attachmentPath(path)) throw Error("Unsafe emoji path.");
    if (written.has(path)) continue;
    const blob = assets.get(path);
    if (!blob) {
      warnings.push("Missing emoji attachment: " + path);
      continue;
    }
    written.add(path);
    size += blob.size;
    if (size > MAX) throw Error("Portable attachments exceed 64 MiB.");
    zip.file(path, await blob.arrayBuffer(), { createFolders: false });
  }
  zip.file("notes.md", readable.markdown);
  zip.file("notes.opml", readable.opml);
  zip.file(
    "notes.json",
    JSON.stringify({
      format: "remo-portable-notes",
      version: 1,
      bullets: doc.tables.bullets,
      media,
      emojis: exportedEmojis,
    }),
  );
  zip.file("report.json", JSON.stringify({ warnings }, null, 2));
  for (const name of ["notes.md", "notes.opml", "notes.json", "report.json"])
    size += (await zip.file(name).async("uint8array")).length;
  if (size > MAX) throw Error("Portable package exceeds 64 MiB expanded. Export fewer notes.");
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  if (blob.size > MAX) throw Error("Portable ZIP exceeds 64 MiB. Export fewer notes.");
  return {blob,warnings};
}
export async function preparePortable(
  file,
  { make = uuid, Parser = globalThis.DOMParser } = {},
) {
  if (file.size > MAX) throw Error("Import file exceeds 64 MiB.");
  let nodes = [],
    media = [],
    emojis = [],
    warnings = [],
    files = new Map();
  const bytes = await file.arrayBuffer(),
    name = file.name || "";
  if (/\.zip$/i.test(name)) {
    inspectZip(bytes, {
      required: null,
      allowed: (p) =>
        ["notes.md", "notes.opml", "notes.json", "report.json"].includes(p) ||
        attachmentPath(p),
      maxTotal: MAX,
    });
    const zip = await JSZip.loadAsync(bytes),
      entries = Object.values(zip.files);
    let total = 0;
    for (const e of entries) {
      const path = e.unsafeOriginalName || e.name,
        size = e._data?.uncompressedSize;
      if (
        e.dir ||
        path !== e.name ||
        !(
          ["notes.md", "notes.opml", "notes.json", "report.json"].includes(
            path,
          ) || attachmentPath(path)
        )
      )
        throw Error("Unsafe portable ZIP entry.");
      if (!Number.isFinite(size) || size > MAX || (total += size) > MAX)
        throw Error("Expanded portable ZIP exceeds 64 MiB.");
    }
    for (const e of entries)
      if (attachmentPath(e.name))
        files.set(
          e.name,
          new Blob([await e.async("uint8array")], {
            type: portableMime(e.name),
          }),
        );
    if (zip.file("notes.json")) {
      const m = readJSON(await zip.file("notes.json").async("string"));
      if (
        m.format !== "remo-portable-notes" ||
        m.version !== 1 ||
        !Array.isArray(m.bullets) ||
        !Array.isArray(m.media)
      )
        throw Error("Unsupported portable notes.");
      nodes = m.bullets;
      media = m.media;
      emojis = mergePortableEmojis([], m.emojis || []);
      validate(nodes);
      if (media.length > 10000) throw Error("Too many media records.");
    } else {
      const text = zip.file("notes.md") || zip.file("notes.opml");
      if (!text) throw Error("No notes found.");
      const parsed = /\.opml$/i.test(text.name)
        ? parseOpml(await text.async("string"), Parser)
        : { items: parseMarkdown(await text.async("string")), warnings: [] };
      warnings.push(...parsed.warnings);
      nodes = itemsToBullets(parsed.items, null, make, bullet);
    }
  } else {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      parsed = /\.opml$/i.test(name)
        ? parseOpml(text, Parser)
        : /\.(md|markdown)$/i.test(name)
          ? { items: parseMarkdown(text), warnings: [] }
          : null;
    if (!parsed) throw Error("Choose Markdown, OPML or a portable ZIP.");
    warnings.push(...parsed.warnings);
    nodes = itemsToBullets(parsed.items, null, make, bullet);
  }
  if (nodes.length > MAX_NOTES) throw Error("Import at most 10,000 bullets.");
  validate(nodes);
  const parents = new Map(nodes.map((n) => [n.id, n.parentId])),
    depths = new Map();
  for (const n of nodes) {
    let id = n.id,
      path = [];
    while (id && parents.has(id) && !depths.has(id)) {
      path.push(id);
      if (path.length > 128) throw Error("Imported outline is too deep.");
      id = parents.get(id);
    }
    let depth = depths.get(id) || 0;
    for (const p of path.reverse()) {
      if (++depth > 128) throw Error("Imported outline is too deep.");
      depths.set(p, depth);
    }
  }
  const ids = new Map(nodes.map((n) => [n.id, make()])),
    root = bullet(make(), { text: "Imported · " + name }),
    blobs = new Map(),
    paths = new Map();
  const newNodes = nodes.map((n) => {
    let next = {
      ...n,
      id: ids.get(n.id),
      parentId: ids.get(n.parentId) || root.id,
    };
    if (n.mirrorSourceId && !ids.has(n.mirrorSourceId)) {
      delete next.mirrorSourceId;
      delete next.mirrorRootId;
      warnings.push("Unresolved mirror converted to ordinary note: " + n.id);
    } else if (n.mirrorSourceId) {
      next.mirrorSourceId = ids.get(n.mirrorSourceId);
      next.mirrorRootId = ids.get(n.mirrorRootId) || next.id;
    }
    for (const k of Object.keys(next))
      if (k.startsWith("taskRepeat")) {
        delete next[k];
        warnings.push(
          "Recurring task initialization omitted for imported copy: " + n.id,
        );
      }
    return remapNoteLinks(next, ids, warnings);
  });
  // Plain Markdown image references remain readable; local files become attachments too.
  if (!media.length)
    for (const n of nodes)
      for (const match of n.text.matchAll(
        /!\[[^\]]*\]\((media\/[A-Za-z0-9._-]+)\)/g,
      ))
        media.push({
          id: make(),
          bulletId: n.id,
          fileName: match[1].slice(6),
          mimeType: "application/octet-stream",
          sourceUrl: "",
          credit: "",
          licenseUrl: "",
        });
  const newMedia = [];
  for (const m of media) {
    for (const key of ["mimeType", "sourceUrl", "credit", "licenseUrl"])
      if (m[key] !== undefined && typeof m[key] !== "string")
        throw Error("Invalid attachment metadata.");
    const path = "media/" + m.fileName;
    if (
      typeof m.fileName !== "string" ||
      !mediaPath(path) ||
      !ids.has(m.bulletId)
    )
      throw Error("Invalid imported attachment reference.");
    const blob = files.get(path);
    if (!blob) {
      warnings.push("Missing attachment (not imported): " + path);
      continue;
    }
    if (!paths.has(path)) {
      const newPath =
        "media/" +
        make() +
        "." +
        (m.fileName
          .split(".")
          .pop()
          ?.replace(/[^a-z0-9]/gi, "")
          .slice(0, 12) || "bin");
      paths.set(path, newPath);
      blobs.set(
        newPath,
        new Blob([blob], {
          type:
            typeof m.mimeType === "string"
              ? m.mimeType
              : "application/octet-stream",
        }),
      );
    }
    newMedia.push({
      ...m,
      id: make(),
      bulletId: ids.get(m.bulletId),
      fileName: paths.get(path).slice(6),
    });
  }
  for (const n of newNodes)
    for (const [old, path] of paths)
      if (n.text.includes(old)) {
        // Keep formatting offsets valid when relative file paths change.
        const replacements = [
          ...n.text.matchAll(
            new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
          ),
        ];
        const oldText = n.text;
        n.text = oldText.split(old).join(path);
        const shift = (p) =>
          p +
          replacements.filter((m) => m.index + old.length <= p).length *
            (path.length - old.length);
        n.formatting=movedFormatting(n.formatting,oldText,shift,warnings);
      }
  for (const path of emojiFiles(emojis)) {
    if (!files.has(path)) {
      warnings.push("Missing emoji attachment: " + path);
      continue;
    }
    blobs.set(path, files.get(path));
  }
  const missingParents = nodes.filter(
    (n) => n.parentId && !ids.has(n.parentId),
  );
  if (missingParents.length)
    warnings.push(
      missingParents.length + " missing parents attached to import root.",
    );
  const report = bullet(make(), {
    parentId: root.id,
    position:
      Math.max(
        0,
        ...newNodes
          .filter((n) => n.parentId === root.id)
          .map((n) => n.position),
      ) + 1,
    text: "Import report · " + name,
  });
  const reportRows = [
    bullet(make(), {
      parentId: report.id,
      text:
        nodes.length + " notes · " + newMedia.length + " attachments imported",
    }),
    ...[...new Set(warnings)].map((text, i) =>
      bullet(make(), { parentId: report.id, position: i + 1, text }),
    ),
  ];
  if(newNodes.length+reportRows.length+2>MAX_NOTES)throw Error("Notes and import report exceed 10,000 bullets. Split the file.");
  const transport = applyDocument(new Map(), null, {
    tables: { bullets: [root, ...newNodes, report, ...reportRows], media: newMedia, emojis },
    web: {},
  });
  if (
    new TextEncoder().encode(JSON.stringify(transport.updates)).length >
    2 * 1024 * 1024
  )
    throw Error(
      "This import is too large for one safe sync operation. Split the notes into smaller files.",
    );
  return {
    id: root.id,
    nodes: [root, ...newNodes, report, ...reportRows],
    media: newMedia,
    emojis,
    assets: blobs,
    warnings: [...new Set(warnings)],
    name,
    count: nodes.length,
  };
}
export function applyPortable(doc, prepared, parentId = null) {
  if (parentId && !doc.tables.bullets.some((n) => n.id === parentId))
    throw Error("Import destination was deleted.");
  const present = doc.tables.bullets.filter((n) =>
    prepared.nodes.some((p) => p.id === n.id),
  );
  if (present.length) {
    if (present.length === prepared.nodes.length) return doc;
    throw Error(
      "Partial import identities already exist. No duplicate notes were added.",
    );
  }
  const position =
    Math.max(
      -1,
      ...doc.tables.bullets
        .filter((n) => n.parentId === parentId)
        .map((n) => n.position),
    ) + 1;
  return {
    ...doc,
    tables: {
      ...doc.tables,
      bullets: [
        ...doc.tables.bullets,
        ...prepared.nodes.map((n) =>
          n.id === prepared.id ? { ...n, parentId, position } : n,
        ),
      ],
      media: [...doc.tables.media, ...prepared.media],
      emojis: mergePortableEmojis(doc.tables.emojis, prepared.emojis || []),
    },
  };
}
