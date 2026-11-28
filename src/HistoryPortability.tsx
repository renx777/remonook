import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { NoteMetadataContext } from "./NoteMetadataContext";
import {
  noteHistory,
  historicalFiles,
  exportNoteHistory,
  prepareHistoryImport,
  importNoteHistory,
  storageAccountKey,
  download,
  getAssets,
} from "./data";
import { uuid } from "./domain.mjs";
import { restoreHistoricalNote } from "./note-history.mjs";
import {
  exportPortable,
  preparePortable,
  applyPortable,
} from "./note-portability.mjs";
import { ImageDialog } from "./ImageTools";
import "./history-portability.css";
export function NoteHistory({ id }: { id?: string }) {
  const ctx = useContext(NoteMetadataContext),
    account = storageAccountKey(),
    [open, setOpen] = useState(false),
    [entries, setEntries] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [side, setSide] = useState("before"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [limit, setLimit] = useState(100),
    [prepared, setPrepared] = useState<any>(null),
    lock = useRef(false),
    generation = useRef(0),
    input = useRef<HTMLInputElement>(null),
    restoreFiles = useRef(new Map<string, Blob>()),
    restoreAttempt = useRef<{
      key: string;
      ids: string[];
    } | null>(null);
  useLayoutEffect(() => {
    setOpen(false);
    setEntries([]);
    setSelected(null);
    setPrepared(null);
    restoreAttempt.current = null;
  }, [account]);
  const source = id
    ? ctx?.doc.tables.bullets.find((n) => n.id === id)?.mirrorSourceId || id
    : undefined;
  useEffect(() => {
    const token = ++generation.current;
    setSelected(null);
    setPrepared(null);
    if (open) {
      setBusy(true);
      void noteHistory(source, limit, account)
        .then((v) => {
          if (token === generation.current) setEntries(v);
        })
        .catch((e) => {
          if (token === generation.current) setError(e.message);
        })
        .finally(() => {
          if (token === generation.current) setBusy(false);
        });
    }
    return () => {
      generation.current++;
    };
  }, [open, source, account, limit]);
  if (!ctx) return null;
  const guard = () => {
    if (account !== storageAccountKey())
      throw Error("Open the original workspace to continue.");
  };
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      guard();
      await action();
    } catch (e: any) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const restore = () =>
    run(async () => {
      const current = selected,
        version = side,
        files = await historicalFiles(current, version, account);
      guard();
      const attemptKey = current.id + ":" + version;
      if (restoreAttempt.current?.key !== attemptKey)
        restoreAttempt.current = { key: attemptKey, ids: [] };
      const ids = restoreAttempt.current.ids;
      let target = "";
      await ctx.saveAssets!(
        (d) => {
          guard();
          let cursor = 0;
          const stableMake = () => {
            const at = cursor++;
            return ids[at] || (ids[at] = uuid());
          };
          const r = restoreHistoricalNote(d, current, version, stableMake);
          target = r.id;
          if (d.tables.bullets.some((n) => n.id === target)) return d;
          const mapped = new Map<string, Blob>();
          for (const [old, path] of r.fileRemap) {
            const blob = files.get(old);
            if (!blob) throw Error("A historical attachment is unavailable.");
            mapped.set(
              path,
              new Blob([blob], {
                type:
                  current[version + "Media"].find(
                    (m: any) => "media/" + m.fileName === old,
                  )?.mimeType || blob.type,
              }),
            );
          }
          for (const [path, blob] of files)
            if (path.startsWith("emoji/")) mapped.set(path, blob);
          restoreFiles.current = mapped;
          return r.doc;
        },
        () => restoreFiles.current,
      );
      setOpen(false);
      ctx.openNote?.(target);
    });
  return (
    <>
      <button
        type="button"
        className="history-action"
        onClick={() => {
          restoreAttempt.current = null;
          setOpen(true);
          setError("");
        }}
      >
        History
      </button>
      {open && (
        <ImageDialog
          title={id ? "Bullet history" : "Workspace history"}
          onClose={() => {
            if (!busy) setOpen(false);
          }}
          className="history-dialog"
        >
          <p className="history-caption">
            Saved on this device. Restore creates a new note and keeps the
            current version. Child bullets have their own histories.
          </p>
          <div className="history-toolbar">
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const blob = await exportNoteHistory(account, source);
                  guard();
                  download(blob, "remonook-history.zip");
                })
              }
            >
              Export local history
            </button>
            {!id && (
              <>
                <button disabled={busy} onClick={() => input.current?.click()}>
                  Import history ZIP
                </button>
                <input
                  ref={input}
                  type="file"
                  accept=".zip"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file)
                      void run(async () => {
                        const value = await prepareHistoryImport(file);
                        guard();
                        setPrepared(value);
                      });
                  }}
                />
              </>
            )}
          </div>
          {prepared && (
            <div>
              <p>
                {prepared.entries.length} history entries will be added to this
                device. Notes will remain unchanged.
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    guard();
                    await importNoteHistory(prepared, account);
                    setPrepared(null);
                    setEntries(await noteHistory(source, limit, account));
                  })
                }
              >
                Add history entries
              </button>
            </div>
          )}
          <div className="history-browser">
            <div className="history-list">
              {!entries.length && !busy && (
                <p>
                  No saved history yet. Revisions appear after notes are saved.
                </p>
              )}
              {entries.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={selected?.id === e.id}
                  disabled={busy}
                  onClick={() => {
                    setSelected(e);
                    setSide(e.before ? "before" : "after");
                  }}
                >
                  <strong>
                    {(e.after?.text || e.before?.text || "Untitled").slice(
                      0,
                      90,
                    )}
                  </strong>
                  <small>
                    {new Date(e.at).toLocaleString()} ·{" "}
                    {e.after ? "Saved" : "Deleted"}
                  </small>
                </button>
              ))}
              {entries.length >= limit && (
                <button
                  disabled={busy}
                  onClick={() => setLimit((n) => n + 100)}
                >
                  Load older revisions
                </button>
              )}
            </div>
            {selected && (
              <section
                className="history-preview"
                aria-label="Historical version"
              >
                <div className="history-toolbar">
                  <button
                    aria-pressed={side === "before"}
                    disabled={!selected.before}
                    onClick={() => setSide("before")}
                  >
                    Before
                  </button>
                  <button
                    aria-pressed={side === "after"}
                    disabled={!selected.after}
                    onClick={() => setSide("after")}
                  >
                    After
                  </button>
                </div>
                <pre>{selected[side]?.text}</pre>
                <p>
                  {(selected[side + "Media"] || []).length} attachments ·
                  formatting retained
                </p>
                <button
                  disabled={
                    busy || ctx.disabled || !ctx.saveAssets || !selected[side]
                  }
                  onClick={() => void restore()}
                >
                  Restore as new note
                </button>
              </section>
            )}
          </div>
          {busy && <p role="status">Working…</p>}
          {error && <p role="alert">{error}</p>}
        </ImageDialog>
      )}
    </>
  );
}
export function PortabilityTools() {
  const ctx = useContext(NoteMetadataContext),
    account = storageAccountKey(),
    [prepared, setPrepared] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false),
    lock = useRef(false),
    input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    setPrepared(null);
    setOpen(false);
    setError("");
  }, [account]);
  if (!ctx) return null;
  const guard = () => {
    if (account !== storageAccountKey())
      throw Error("Open the original workspace to continue.");
  };
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      guard();
      await action();
    } catch (e: any) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="portability-tools" aria-label="Markdown and OPML">
      <h4>Markdown & OPML</h4>
      <p>
        Portable notes and attachments. Study progress and workspace settings
        remain in full backups; local history has its own export.
      </p>
      <div className="history-toolbar">
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const assets = ctx.getAssets?.() || (await getAssets(account)),
                result = await exportPortable(ctx.doc, assets);
              guard();
              download(result.blob, "remonook-notes.zip");
              setError(result.warnings.join(" "));
            })
          }
        >
          Export Markdown + OPML ZIP
        </button>
        <button
          disabled={busy || ctx.disabled || !ctx.saveAssets}
          onClick={() => input.current?.click()}
        >
          Import notes…
        </button>
        <NoteHistory />
      </div>
      <input
        ref={input}
        type="file"
        accept=".md,.markdown,.opml,.zip"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file)
            void run(async () => {
              const result = await preparePortable(file);
              guard();
              setPrepared(result);
              setOpen(true);
            });
        }}
      />
      {error && <p role="status">{error}</p>}
      {open && prepared && (
        <ImageDialog
          title="Review note import"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
          className="history-dialog"
        >
          <p>
            {prepared.count} notes · {prepared.media.length} attachments · new
            branch: {prepared.name}
          </p>
          <ul>
            {prepared.warnings.map((w: string) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p>
            A new branch and import report will be added at My notes. Existing
            notes stay unchanged.
          </p>
          <button
            disabled={busy || ctx.disabled}
            onClick={() =>
              void run(async () => {
                guard();
                await ctx.saveAssets!(
                  (d) => {
                    guard();
                    return applyPortable(d, prepared);
                  },
                  () => prepared.assets,
                );
                setOpen(false);
                setPrepared(null);
              })
            }
          >
            Import as new branch
          </button>
          {error && <p role="alert">{error}</p>}
        </ImageDialog>
      )}
    </section>
  );
}
