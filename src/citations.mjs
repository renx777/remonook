import { bullet, uuid } from "./domain.mjs";
import { internalLink, noteLinks } from "./relations.mjs";
import { noteTraits } from "./traits-block.mjs";
import { withNodes } from "./workspace-nodes.mjs";
const FIELDS = [
  "Title",
  "Author",
  "Published",
  "URL",
  "DOI",
  "Locator",
  "Quote",
  "Kind",
  "Source note",
  "Book hash",
  "Bookmark ID",
  "Snapshot hash",
  "Highlight ID",
];
const tag = (n) =>
  /(?:^|\s)#Citation(?=$|\s)/i.test(n.text) && !n.mirrorSourceId;
const fieldName = (k) =>
  [...FIELDS, "Cited note"].find((f) => f.toLowerCase() === k.toLowerCase()) ||
  k;
const values = (doc, id) =>
  Object.fromEntries(
    noteTraits(doc, id)
      .filter(
        (t) =>
          !t.duplicate && [...FIELDS, "Cited note"].includes(fieldName(t.key)),
      )
      .map((t) => {
        const key = fieldName(t.key),
          row = doc.tables.bullets.find((n) => n.id === t.id);
        return [
          key,
          key === "Quote"
            ? row?.text.replace(/^\s*Quote\s*::?[ \t]?/i, "") || ""
            : t.value,
        ];
      }),
  );
export function citationsFor(doc, id) {
  const source =
    doc.tables.bullets.find((n) => n.id === id)?.mirrorSourceId || id;
  return doc.tables.bullets
    .filter(tag)
    .map((node) => ({
      id: node.id,
      heading: node.text,
      ambiguous: noteTraits(doc, node.id).some(
        (t) =>
          t.duplicate && [...FIELDS, "Cited note"].includes(fieldName(t.key)),
      ),
      ...values(doc, node.id),
    }))
    .filter((c) => noteLinks(c["Cited note"] || "")[0]?.id === source)
    .map((c) => ({
      ...c,
      sourceId: noteLinks(c["Source note"] || "")[0]?.id || "",
    }));
}
export const citationFingerprint = (c) =>
  JSON.stringify([c?.heading || "", ...FIELDS.map((k) => c?.[k] || "")]);
export function checkCitation(draft) {
  if (draft.ambiguous)
    throw Error(
      "Review duplicate fields in the reference note before exporting.",
    );
  const d = {};
  for (const k of FIELDS) {
    const v = draft[k] ?? "";
    if (
      typeof v !== "string" ||
      v.length > (k === "Quote" ? 8000 : k === "URL" ? 4096 : 1000)
    )
      throw Error("Citation fields are too long or invalid.");
    d[k] = k === "Quote" ? v : v.trim();
  }
  if (!d.Title) throw Error("Enter the source title.");
  if (d.URL) {
    let u;
    try {
      u = new URL(d.URL);
    } catch {
      throw Error("Enter a valid http or https source URL.");
    }
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
      throw Error(
        "Enter a source URL without credentials using http or https.",
      );
    d.URL = u.href;
  }
  d.DOI = d.DOI.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
  if (d.DOI && !/^10\.\d{4,9}\/[^\s]+$/.test(d.DOI))
    throw Error("Enter a valid DOI, for example 10.1234/example.");
  if (d.Published && !/^\d{4}(?:-\d{2}-\d{2})?$/.test(d.Published))
    throw Error("Published must be a year or YYYY-MM-DD.");
  if (d.Published) {
    const v = d.Published.length === 4 ? d.Published + "-01-01" : d.Published,
      date = new Date(v + "T00:00:00Z");
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== v
    )
      throw Error("Enter a valid publication date.");
  }
  if (!["book", "webpage", "article-journal"].includes(d.Kind))
    throw Error("Choose a citation kind.");
  return d;
}
export function readingSuggestion(doc, id) {
  const node = doc.tables.bullets.find((n) => n.id === id);
  if (!node) return null;
  const source = node.mirrorSourceId || id,
    h = Object.values(doc.web.readingHighlights || {}).find(
      (h) => !h.deleted && h.bulletId === source,
    );
  if (h) {
    const book = Object.values(doc.web.readingBooks || {}).find(
      (b) => !b.deleted && b.hash === h.bookHash,
    );
    if (book)
      return {
        Title: book.title,
        Author: "",
        Published: "",
        URL: "",
        DOI: "",
        Locator: (book.format === "pdf" ? "Page " : "Passage ") + (h.unit + 1),
        Quote: h.quote,
        Kind: "book",
        "Source note": internalLink(
          doc.tables.bullets.find((n) => n.id === source),
        ),
        "Book hash": h.bookHash,
        "Highlight ID": h.id,
      };
  }
  const s = doc.web.bookmarkSources?.[source],
    b = s && doc.web.bookmarks?.[s.bookmarkId];
  if (s && b && !b.deleted) {
    const highlight = doc.web.webHighlights?.[s.highlightId];
    return {
      Title: s.title || b.title,
      Author: "",
      Published: "",
      URL: s.url || b.url,
      DOI: "",
      Locator: "",
      Quote: highlight?.exact || "",
      Kind: "webpage",
      "Source note": internalLink(
        doc.tables.bullets.find((n) => n.id === source),
      ),
      "Bookmark ID": b.id,
      "Snapshot hash":
        s.snapshotHash || highlight?.hash || b.snapshotHash || "",
      "Highlight ID": s.highlightId || "",
    };
  }
  return null;
}
export function saveCitation(
  doc,
  citedId,
  draft,
  attempt,
  expected = null,
  make = uuid,
) {
  const source = doc.tables.bullets.find((n) => n.id === citedId),
    cited = source?.mirrorSourceId
      ? doc.tables.bullets.find((n) => n.id === source.mirrorSourceId)
      : source;
  if (!cited) throw Error("The cited note was removed. Your draft is kept.");
  const d = checkCitation(draft),
    prior = citationsFor(doc, cited.id).find((c) => c.id === attempt.id);
  if (prior && expected === null) {
    if (
      citationFingerprint(prior) ===
      citationFingerprint({ ...d, heading: d.Title + " #Citation" })
    )
      return doc;
    throw Error(
      "This citation already exists with different details. Reopen it before editing.",
    );
  }
  if (expected !== null && (!prior || citationFingerprint(prior) !== expected))
    throw Error(
      "This citation changed. Reopen it before saving; your draft is kept.",
    );
  const linked = noteLinks(d["Source note"])[0];
  if (linked && !doc.tables.bullets.some((n) => n.id === linked.id))
    throw Error(
      "The linked source note was removed. Clear the source association or choose another source.",
    );
  if (
    !attempt ||
    typeof attempt.id !== "string" ||
    !attempt.id ||
    typeof attempt.rootId !== "string" ||
    !attempt.rootId
  )
    throw Error("Reopen this citation draft.");
  if (!prior && doc.tables.bullets.some((n) => n.id === attempt.id))
    throw Error(
      "This note identity is already in use. Start a new citation draft.",
    );
  let nodes = [...doc.tables.bullets],
    root = nodes.find(
      (n) =>
        n.parentId === null &&
        n.kind === "NOTE" &&
        !n.mirrorSourceId &&
        /(?:^|\s)#References(?=$|\s)/i.test(n.text) &&
        !doc.tables.decks.some((deck) => deck.rootId === n.id),
    );
  if (!prior) {
    if (!root) {
      if (nodes.some((n) => n.id === attempt.rootId))
        throw Error(
          "Start a new citation draft to choose a new reference location.",
        );
      root = bullet(attempt.rootId, {
        text: "References #References",
        position:
          Math.max(
            -1,
            ...nodes.filter((n) => !n.parentId).map((n) => n.position),
          ) + 1,
      });
      nodes.push(root);
    }
    nodes.push(
      bullet(attempt.id, {
        parentId: root.id,
        position:
          Math.max(
            -1,
            ...nodes
              .filter((n) => n.parentId === root.id)
              .map((n) => n.position),
          ) + 1,
        text: d.Title + " #Citation",
      }),
    );
  } else if (prior.ambiguous)
    throw Error(
      "Review duplicate citation fields in the reference note before editing.",
    );
  let block = nodes.find((n) => n.parentId === attempt.id && n.traitsBlock);
  if (!block) {
    block = bullet(make(), {
      parentId: attempt.id,
      text: "Traits",
      traitsBlock: true,
    });
    nodes.push(block);
  }
  const fields = { ...d, "Cited note": internalLink(cited) },
    traits = prior ? noteTraits(doc, attempt.id) : [];
  for (const [i, [key, value]] of Object.entries(fields).entries()) {
    const row = traits.find((t) => !t.duplicate && fieldName(t.key) === key);
    if (row)
      nodes = nodes.map((n) => {
        if (n.id !== row.id || n.text === key + ": " + value) return n;
        if (n.formatting)
          throw Error(
            "Edit formatted citation fields in the reference note to preserve their formatting.",
          );
        return { ...n, text: key + ": " + value };
      });
    else
      nodes.push(
        bullet(make(), {
          parentId: block.id,
          position: i,
          text: key + ": " + value,
        }),
      );
  }
  return withNodes(doc, nodes);
}
export function plainCitation(c) {
  return [
    c.Author,
    c.Published ? "(" + c.Published + ")" : "",
    c.Title,
    c.Locator,
    c.DOI ? "https://doi.org/" + c.DOI : c.URL,
  ]
    .filter(Boolean)
    .join(". ");
}
export function citationCSL(list) {
  return list.map((c) => {
    const d = checkCitation(c);
    return {
      id: c.id,
      type: d.Kind,
      title: d.Title,
      ...(d.Author ? { author: [{ literal: d.Author }] } : {}),
      ...(d.Published
        ? { issued: { "date-parts": [d.Published.split("-").map(Number)] } }
        : {}),
      ...(d.URL ? { URL: d.URL } : {}),
      ...(d.DOI ? { DOI: d.DOI } : {}),
      ...(d.Locator ? { note: d.Locator } : {}),
      ...(d.Quote ? { annote: d.Quote } : {}),
    };
  });
}
const bibEscape = (s) =>
  String(s).replace(
    /[\\{}%&#_$~^]/g,
    (c) =>
      ({
        "\\": "\\textbackslash{}",
        "{": "\\{",
        "}": "\\}",
        "%": "\\%",
        "&": "\\&",
        "#": "\\#",
        _: "\\_",
        $: "\\$",
        "~": "\\textasciitilde{}",
        "^": "\\textasciicircum{}",
      })[c],
  );
export function citationBib(list) {
  return list
    .map((c, i) => {
      const d = checkCitation(c),
        fields = {
          title: d.Title,
          ...(d.Author ? { author: d.Author } : {}),
          ...(d.Published ? { year: d.Published.slice(0, 4) } : {}),
          ...(d.URL ? { url: d.URL } : {}),
          ...(d.DOI ? { doi: d.DOI } : {}),
          ...(d.Locator ? { note: d.Locator } : {}),
          ...(d.Quote ? { annote: d.Quote } : {}),
        };
      return (
        "@" +
        (d.Kind === "book"
          ? "book"
          : d.Kind === "article-journal"
            ? "article"
            : "misc") +
        "{remo" +
        (i + 1) +
        ",\n" +
        Object.entries(fields)
          .map(
            ([k, v]) =>
              "  " +
              k +
              " = {" +
              (k === "author" ? "{" + bibEscape(v) + "}" : bibEscape(v)) +
              "}",
          )
          .join(",\n") +
        "\n}"
      );
    })
    .join("\n\n");
}
