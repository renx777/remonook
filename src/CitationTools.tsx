import { useContext, useMemo, useLayoutEffect, useRef, useState } from "react";
import { NoteMetadataContext } from "./NoteMetadataContext";
import { ReadingCitation } from "./ReadingSources";
import { ImageDialog } from "./ImageTools";
import { accountLocalKey, storageAccountKey, download } from "./data";
import { uuid } from "./domain.mjs";
import {
  citationsFor,
  readingSuggestion,
  saveCitation,
  citationFingerprint,
  plainCitation,
  citationCSL,
  citationBib,
} from "./citations.mjs";
import "./review-planning.css";
const safeURL = (value: string) => {
  try {
    const u = new URL(value);
    return (
      ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
    );
  } catch {
    return false;
  }
};
const blank = () => ({
  Title: "",
  Author: "",
  Published: "",
  URL: "",
  DOI: "",
  Locator: "",
  Quote: "",
  Kind: "webpage",
  "Source note": "",
  "Book hash": "",
  "Bookmark ID": "",
  "Snapshot hash": "",
  "Highlight ID": "",
});
export function CitationTools({ id }: { id: string }) {
  const [open, setOpen] = useState(false),
    account = storageAccountKey();
  useLayoutEffect(() => setOpen(false), [account, id]);
  return (
    <>
      <button
        type="button"
        className="phase6-link"
        onClick={() => setOpen(true)}
      >
        Sources
      </button>
      {open && (
        <CitationPanel
          key={account + ":" + id}
          id={id}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
function CitationPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const ctx = useContext(NoteMetadataContext)!,
    account = storageAccountKey(),
    source =
      ctx.doc.tables.bullets.find((n) => n.id === id)?.mirrorSourceId || id,
    key = accountLocalKey("remo-citation-draft:" + source);
  const load = () => {
    try {
      const d = JSON.parse(localStorage.getItem(key) || "null");
      return d && d.fields && typeof d.fields === "object"
        ? d
        : {
            fields: blank(),
            attempt: { id: uuid(), rootId: uuid() },
            expected: null,
          };
    } catch {
      return {
        fields: blank(),
        attempt: { id: uuid(), rootId: uuid() },
        expected: null,
      };
    }
  };
  const [draft, setDraft] = useState<any>(load),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [stored, setStored] = useState(true),
    [copy, setCopy] = useState(""),
    lock = useRef(false),
    list = useMemo(() => citationsFor(ctx.doc, source), [ctx.doc, source]),
    suggestion = useMemo(
      () => readingSuggestion(ctx.doc, source),
      [ctx.doc, source],
    );
  const change = (next: any) => {
    setDraft(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setStored(true);
    } catch {
      setStored(false);
    }
  };
  const guard = () => {
    if (account !== storageAccountKey())
      throw Error("Open the original workspace to continue.");
  };
  const save = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      guard();
      await ctx.save!((d) => {
        guard();
        return saveCitation(
          d,
          source,
          draft.fields,
          draft.attempt,
          draft.expected,
        );
      });
      guard();
      change({
        fields: blank(),
        attempt: { id: uuid(), rootId: uuid() },
        expected: null,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const exporting = (kind: string) => {
    try {
      guard();
      download(
        new Blob(
          [
            kind === "csl"
              ? JSON.stringify(citationCSL(list), null, 2)
              : citationBib(list),
          ],
          { type: kind === "csl" ? "application/json" : "text/plain" },
        ),
        kind === "csl" ? "citations.json" : "citations.bib",
      );
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <ImageDialog
      title="Sources"
      onClose={() => {
        if (!busy) onClose();
      }}
      className="phase6-dialog"
    >
      <p className="phase6-muted">
        Bibliographic details are entered or copied from your saved reading
        sources. Nothing is fetched or inferred.
      </p>
      {!!list.length && (
        <div className="phase6-actions">
          <button onClick={() => exporting("csl")}>Export CSL-JSON</button>
          <button onClick={() => exporting("bib")}>Export BibTeX</button>
        </div>
      )}
      {list.map((c: any) => (
        <article key={c.id} className="phase6-citation">
          <p>{plainCitation(c)}</p>
          {c.Quote && <blockquote>{c.Quote}</blockquote>}
          <div className="phase6-actions">
            <button
              disabled={busy}
              onClick={() =>
                change({
                  fields: { ...blank(), ...c },
                  attempt: { id: c.id, rootId: uuid() },
                  expected: citationFingerprint(c),
                })
              }
            >
              Edit citation
            </button>
            <button
              onClick={() => {
                onClose();
                ctx.openNote?.(c.id);
              }}
            >
              Open reference note
            </button>
            <button
              onClick={() => {
                const text = plainCitation(c);
                setCopy(text);
                if (!navigator.clipboard)
                  setError(
                    "Clipboard access is unavailable. Select and copy the citation text below.",
                  );
                else
                  void navigator.clipboard
                    .writeText(text)
                    .catch(() =>
                      setError(
                        "Clipboard access is unavailable. Select and copy the citation text below.",
                      ),
                    );
              }}
            >
              Copy citation
            </button>
            {safeURL(c.URL) && (
              <a href={c.URL} target="_blank" rel="noopener noreferrer">
                Source URL
              </a>
            )}
            <ReadingCitation id={c.sourceId || source} />
          </div>
        </article>
      ))}
      {copy && (
        <label>
          Citation text
          <textarea aria-label="Citation text" readOnly value={copy} />
        </label>
      )}
      <details open={!list.length || !!draft.expected}>
        <summary>{draft.expected ? "Edit citation" : "Add a source"}</summary>
        {suggestion && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              change({ ...draft, fields: { ...blank(), ...suggestion } })
            }
          >
            Use saved reading source
          </button>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label>
            Source kind
            <select
              aria-label="Source kind"
              value={draft.fields.Kind}
              onChange={(e) =>
                change({
                  ...draft,
                  fields: { ...draft.fields, Kind: e.target.value },
                })
              }
            >
              <option value="webpage">Web page</option>
              <option value="book">Book</option>
              <option value="article-journal">Journal article</option>
            </select>
          </label>
          {(
            ["Title", "Author", "Published", "URL", "DOI", "Locator"] as const
          ).map((k) => (
            <label key={k}>
              {k}
              <input
                required={k === "Title"}
                maxLength={k === "URL" ? 4096 : 1000}
                value={draft.fields[k] || ""}
                placeholder={
                  k === "Published"
                    ? "Year or YYYY-MM-DD"
                    : k === "Locator"
                      ? "Page, passage or section"
                      : undefined
                }
                onChange={(e) =>
                  change({
                    ...draft,
                    fields: { ...draft.fields, [k]: e.target.value },
                  })
                }
              />
            </label>
          ))}
          <label>
            Quote (optional)
            <textarea
              aria-label="Quote (optional)"
              maxLength={8000}
              value={draft.fields.Quote || ""}
              onChange={(e) =>
                change({
                  ...draft,
                  fields: { ...draft.fields, Quote: e.target.value },
                })
              }
            />
          </label>
          {draft.fields["Source note"] && (
            <button
              type="button"
              onClick={() =>
                change({
                  ...draft,
                  fields: {
                    ...draft.fields,
                    "Source note": "",
                    "Book hash": "",
                    "Bookmark ID": "",
                    "Snapshot hash": "",
                    "Highlight ID": "",
                  },
                })
              }
            >
              Clear reading-source association
            </button>
          )}
          <footer>
            <button disabled={busy || ctx.disabled || !ctx.save}>
              Save citation
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                change({
                  fields: blank(),
                  attempt: { id: uuid(), rootId: uuid() },
                  expected: null,
                })
              }
            >
              New citation draft
            </button>
          </footer>
        </form>
      </details>
      {!stored && (
        <p role="status">
          Browser storage is unavailable. Keep this draft open until saved.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </ImageDialog>
  );
}
