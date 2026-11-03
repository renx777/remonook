import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Search,
  Plus,
  Star,
  Check,
  Archive,
  ExternalLink,
  Tag,
  Trash2,
  ArrowUpDown,
  BookOpen,
  Download,
  Link as LinkIcon,
  X,
  CheckSquare,
  MoreHorizontal,
} from "lucide-react";
import { ActionMenu, ActionMenuItem } from "./ActionMenu";
import { queryBookmarks } from "./bookmarks.mjs";
import "./bookmark-library.css";
type Bookmark = {
  id: string;
  url: string;
  title: string;
  excerpt?: string;
  createdAt: number;
  tags: string[];
  read: boolean;
  favourite: boolean;
  archived: boolean;
  snapshotHash?: string;
  snapshotPath?: string;
  readingMinutes?: number;
};
type Props = {
  bookmarks: Bookmark[];
  noteCounts: Record<string, number>;
  offline: Set<string>;
  thumbnails: Map<string, string>;
  assets: Map<string, Blob>;
  busy: string;
  error: string;
  disabled: boolean;
  onSave: (url: string) => Promise<boolean>;
  onOpen: (id: string, notes?: boolean) => void;
  onPatch: (ids: string[], patch: Record<string, unknown>) => void;
  onTags: (bookmark: Bookmark) => void;
};
export function BookmarkLibrary({
  bookmarks,
  noteCounts,
  offline,
  thumbnails,
  assets,
  busy,
  error,
  disabled,
  onSave,
  onOpen,
  onPatch,
  onTags,
}: Props) {
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [tag, setTag] = useState(""),
    [sort, setSort] = useState(() => {
      try {
        const value = localStorage.getItem("remo-bookmark-sort") || "";
        return ["newest", "oldest", "title", "domain"].includes(value)
          ? value
          : "newest";
      } catch {
        return "newest";
      }
    }),
    [adding, setAdding] = useState(false),
    [selecting, setSelecting] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [menu, setMenu] = useState<string | null>(null),
    [remove, setRemove] = useState<string[] | null>(null),
    [notice, setNotice] = useState("");
  const rows = useMemo(
    () => queryBookmarks(bookmarks, { query, filter, tag, sort }) as Bookmark[],
    [bookmarks, query, filter, tag, sort],
  );
  const counts = useMemo(
    () => ({
      all: bookmarks.filter((b) => !b.archived).length,
      unread: bookmarks.filter((b) => !b.archived && !b.read).length,
      read: bookmarks.filter((b) => !b.archived && b.read).length,
      favourites: bookmarks.filter((b) => !b.archived && b.favourite).length,
      archived: bookmarks.filter((b) => b.archived).length,
    }),
    [bookmarks],
  );
  const tags = useMemo(() => {
    const names = new Map<string, string>();
    for (const b of bookmarks)
      for (const t of b.tags)
        if (t.trim() && !names.has(t.toLocaleLowerCase()))
          names.set(t.toLocaleLowerCase(), t);
    return [...names.values()].sort((a, b) => a.localeCompare(b));
  }, [bookmarks]);
  useEffect(() => {
    setSelected([]);
    setNotice("");
  }, [filter, query, tag]);
  useEffect(() => {
    const visible = new Set(rows.map((b) => b.id));
    setSelected((prev) =>
      prev.every((id) => visible.has(id))
        ? prev
        : prev.filter((id) => visible.has(id)),
    );
  }, [rows]);
  const update = (
    ids: string[],
    patch: Record<string, unknown>,
    message: string,
  ) => {
    onPatch(ids, patch);
    setNotice(message);
    setSelected([]);
  };
  const changeSort = (value: string) => {
    setSort(value);
    try {
      localStorage.setItem("remo-bookmark-sort", value);
    } catch {}
  };
  const toggle = (id: string) =>
    setSelected((v) =>
      v.includes(id) ? v.filter((x) => x !== id) : [...v, id],
    );
  const clear = () => {
    setQuery("");
    setTag("");
    setFilter("all");
  };
  return (
    <div className="bookmark-library">
      <header className="bl-heading">
        <div>
          <h1>
            Bookmarks <span>{bookmarks.length}</span>
          </h1>
          <p>
            {counts.unread
              ? `${counts.unread} unread · a little room for a good read`
              : "Your reading list, ready when you are"}
          </p>
        </div>
        <button
          className="bl-save"
          aria-label="Add bookmark"
          disabled={disabled || !!busy}
          onClick={() => setAdding(true)}
        >
          <Plus size={17} />
          <span>Save a page</span>
        </button>
      </header>
      <nav className="bl-views" aria-label="Bookmark views">
        <div className="bl-view-tabs">
          {[
            ["all", "All"],
            ["unread", "Unread"],
            ["read", "Read"],
            ["favourites", "Favourites"],
            ["archived", "Archive"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
              <span>{counts[value as keyof typeof counts]}</span>
            </button>
          ))}
        </div>
        <button
          className="bl-select"
          aria-pressed={selecting}
          onClick={() => {
            setSelecting(!selecting);
            setSelected([]);
          }}
        >
          <CheckSquare size={15} />
          {selecting ? "Done" : "Select"}
        </button>
      </nav>
      <div className="bl-tools">
        <label className="bl-search">
          <Search size={17} />
          <span className="bl-sr">Search bookmarks</span>
          <input
            type="search"
            value={query}
            placeholder="Search titles, websites or tags"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              aria-label="Clear bookmark search"
              onClick={() => setQuery("")}
            >
              <X size={15} />
            </button>
          )}
        </label>
        <div className="bl-organise">
          <label className="bl-sort">
            <ArrowUpDown size={15} />
            <span className="bl-sr">Sort bookmarks</span>
            <select value={sort} onChange={(e) => changeSort(e.target.value)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="title">Title A–Z</option>
              <option value="domain">Website A–Z</option>
            </select>
          </label>
          {tags.length > 0 && (
            <label className="bl-tag-filter">
              <Tag size={15} />
              <span className="bl-sr">Filter by tag</span>
              <select value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">All tags</option>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
      {(query || tag) && (
        <div className="bl-results">
          <span>
            {rows.length} {rows.length === 1 ? "result" : "results"}
            {tag ? " · #" + tag : ""}
          </span>
          <button
            onClick={() => {
              setQuery("");
              setTag("");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      {selecting && rows.length > 0 && (
        <div className="bl-selection">
          <label>
            <input
              type="checkbox"
              checked={!!rows.length && selected.length === rows.length}
              ref={(el) => {
                if (el)
                  el.indeterminate =
                    selected.length > 0 && selected.length < rows.length;
              }}
              onChange={(e) =>
                setSelected(e.target.checked ? rows.map((b) => b.id) : [])
              }
            />
            Select visible
          </label>
          <span>{selected.length} selected</span>
          <div>
            <button
              disabled={disabled || !selected.length}
              onClick={() =>
                update(selected, { read: true }, "Selected pages marked read")
              }
            >
              <Check size={15} />
              Mark read
            </button>
            <button
              disabled={disabled || !selected.length}
              onClick={() =>
                update(
                  selected,
                  { archived: filter !== "archived" },
                  filter === "archived"
                    ? "Selected pages returned to your list"
                    : "Selected pages archived",
                )
              }
            >
              <Archive size={15} />
              {filter === "archived" ? "Unarchive" : "Archive"}
            </button>
            <button
              disabled={disabled || !selected.length}
              aria-label="Remove selected bookmarks"
              onClick={() => setRemove([...selected])}
            >
              <Trash2 size={15} />
              <span>Remove</span>
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p className="bl-notice" role="status">
          {notice}
        </p>
      )}
      {error && !adding && (
        <p className="bl-error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="bl-notice" role="status">
          Preparing your saved article…
        </p>
      )}
      <ul className="bl-list" aria-label="Saved webpages">
        {rows.map((b) => {
          const cached =
              !!b.snapshotHash &&
              (offline.has(b.snapshotHash) ||
                (!!b.snapshotPath && assets.has(b.snapshotPath))),
            source = new URL(b.url).hostname.replace(/^www\./, ""),
            thumb = b.snapshotHash && thumbnails.get(b.snapshotHash);
          return (
            <li
              key={b.id}
              className={
                "bl-item" +
                (b.read ? " is-read" : "") +
                (selected.includes(b.id) ? " is-selected" : "")
              }
            >
              {selecting && (
                <label className="bl-checkbox">
                  <span className="bl-sr">{"Select " + b.title}</span>
                  <input
                    type="checkbox"
                    checked={selected.includes(b.id)}
                    onChange={() => toggle(b.id)}
                  />
                </label>
              )}
              <div className="bl-item-content">
                <button
                  className="bookmark-open bl-open"
                  data-bookmark-url={b.url}
                  onClick={() => (selecting ? toggle(b.id) : onOpen(b.id))}
                >
                  <div className="bl-item-copy">
                    <div className="bl-source">
                      <span>{source}</span>
                      {b.readingMinutes && (
                        <>
                          <i>·</i>
                          <span>{b.readingMinutes} min</span>
                        </>
                      )}
                      {b.read && (
                        <span className="bl-read-label">
                          <Check size={11} />
                          Read
                        </span>
                      )}
                    </div>
                    <h2>{b.title}</h2>
                    {b.excerpt && <p>{b.excerpt}</p>}
                  </div>
                  {thumb && (
                    <img
                      className="bl-thumbnail"
                      src={thumb}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                </button>
                <div className="bl-item-footer">
                  <div className="bl-details">
                    <span
                      className="bl-availability"
                      title={
                        cached
                          ? "Saved copy available on this device"
                          : b.snapshotHash
                            ? "Open once to download the saved copy"
                            : "Link saved; open to prepare reader mode"
                      }
                    >
                      {cached ? (
                        <Download size={12} />
                      ) : b.snapshotHash ? (
                        <BookOpen size={12} />
                      ) : (
                        <LinkIcon size={12} />
                      )}
                      <span>
                        {cached
                          ? "Offline"
                          : b.snapshotHash
                            ? "Saved article"
                            : "Saved link"}
                      </span>
                    </span>
                    {(noteCounts[b.id] || 0) > 0 && (
                      <button
                        className="bl-note-count"
                        aria-label={`Open ${noteCounts[b.id]} article notes for ${b.title}`}
                        onClick={() => onOpen(b.id, true)}
                      >
                        {noteCounts[b.id]}{" "}
                        {noteCounts[b.id] === 1 ? "note" : "notes"}
                      </button>
                    )}
                    {b.tags.slice(0, 2).map((t) => (
                      <button
                        className="bl-tag"
                        key={t}
                        title={"Filter by " + t}
                        onClick={() => setTag(t)}
                      >
                        #{t}
                      </button>
                    ))}
                    {b.tags.length > 2 && (
                      <span className="bl-more-tags" title={b.tags.join(", ")}>
                        +{b.tags.length - 2}
                      </span>
                    )}
                  </div>
                  <div className="bl-row-actions">
                    <button
                      aria-label={
                        (b.favourite ? "Unfavourite " : "Favourite ") + b.title
                      }
                      aria-pressed={b.favourite}
                      title={b.favourite ? "Remove favourite" : "Favourite"}
                      disabled={disabled}
                      onClick={() =>
                        onPatch([b.id], { favourite: !b.favourite })
                      }
                    >
                      <Star
                        size={16}
                        fill={b.favourite ? "currentColor" : "none"}
                      />
                    </button>
                    <button
                      aria-label={
                        (b.read ? "Mark unread: " : "Mark read: ") + b.title
                      }
                      aria-pressed={b.read}
                      title={b.read ? "Mark unread" : "Mark read"}
                      disabled={disabled}
                      onClick={() => onPatch([b.id], { read: !b.read })}
                    >
                      <Check size={17} />
                    </button>
                    <ActionMenu
                      open={menu === b.id}
                      onOpenChange={(open) => setMenu(open ? b.id : null)}
                      trigger={
                        <button
                          aria-label={"Actions for " + b.title}
                          title="More actions"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      }
                    >
                      <div className="bookmark-action-menu bl-action-menu">
                        <ActionMenuItem
                          disabled={disabled}
                          onClick={() => {
                            update(
                              [b.id],
                              { archived: !b.archived },
                              b.archived
                                ? "Page returned to your reading list"
                                : "Page archived",
                            );
                            setMenu(null);
                          }}
                        >
                          <Archive size={16} />
                          {b.archived ? "Unarchive" : "Archive"}
                        </ActionMenuItem>
                        <ActionMenuItem
                          disabled={disabled}
                          onClick={() => {
                            onTags(b);
                            setMenu(null);
                          }}
                        >
                          <Tag size={16} />
                          Edit tags
                        </ActionMenuItem>
                        <ActionMenuItem
                          onClick={() => {
                            window.open(b.url, "_blank", "noopener,noreferrer");
                            setMenu(null);
                          }}
                        >
                          <ExternalLink size={16} />
                          Open original
                        </ActionMenuItem>
                        <ActionMenuItem
                          disabled={disabled}
                          onClick={() => {
                            setRemove([b.id]);
                            setMenu(null);
                          }}
                        >
                          <Trash2 size={16} />
                          Remove from library
                        </ActionMenuItem>
                      </div>
                    </ActionMenu>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {!rows.length && (
        <section className="bl-empty">
          <BookOpen size={27} />
          <h2>
            {query || tag
              ? "No matching pages"
              : filter === "archived"
                ? "Your archive is empty"
                : filter === "favourites"
                  ? "Keep your favourites close"
                  : filter === "unread"
                    ? "You’re all caught up"
                    : "Your next good read starts here"}
          </h2>
          <p>
            {query || tag
              ? "Try another title, website or tag."
              : filter === "archived"
                ? "Archived pages stay here, along with their notes."
                : filter === "favourites"
                  ? "Use the star beside a page to find it here."
                  : filter === "unread"
                    ? "Save another page, or revisit your reading list."
                    : "Save an article to read, highlight and turn ideas into notes."}
          </p>
          {query || tag || filter !== "all" ? (
            <button onClick={clear}>Show all pages</button>
          ) : (
            <button disabled={disabled} onClick={() => setAdding(true)}>
              <Plus size={16} />
              Save your first page
            </button>
          )}
        </section>
      )}
      {adding && (
        <SavePage
          disabled={disabled || !!busy}
          error={error}
          onClose={() => setAdding(false)}
          onSave={onSave}
        />
      )}
      {remove && (
        <LibraryDialog
          title={
            remove.length === 1
              ? "Remove this bookmark?"
              : `Remove ${remove.length} bookmarks?`
          }
          onClose={() => setRemove(null)}
        >
          <p className="bl-dialog-copy">
            Remove {remove.length === 1 ? "this page" : "these pages"} from your
            library? Saved notes, highlights and their citations are kept.
          </p>
          <div className="bl-dialog-buttons">
            <button onClick={() => setRemove(null)}>Cancel</button>
            <button
              className="bl-danger"
              disabled={disabled}
              onClick={() => {
                update(
                  remove,
                  { deleted: true },
                  remove.length === 1
                    ? "Bookmark removed. Its notes are kept."
                    : `${remove.length} bookmarks removed. Their notes are kept.`,
                );
                setRemove(null);
              }}
            >
              Remove {remove.length === 1 ? "bookmark" : "bookmarks"}
            </button>
          </div>
        </LibraryDialog>
      )}
    </div>
  );
}
function LibraryDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal
        container={document.querySelector(".app") || document.body}
      >
        <Dialog.Overlay className="bl-overlay" />
        <Dialog.Content className="bl-dialog" aria-describedby={undefined}>
          <header>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close aria-label={"Close " + title}>
              <X size={19} />
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function SavePage({
  disabled,
  error,
  onSave,
  onClose,
}: {
  disabled: boolean;
  error: string;
  onSave: (url: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(""),
    [saving, setSaving] = useState(false),
    alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  return (
    <LibraryDialog
      title="Save a page"
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            if ((await onSave(url)) && alive.current) onClose();
          } finally {
            if (alive.current) setSaving(false);
          }
        }}
      >
        <label>
          Webpage URL
          <input
            type="url"
            required
            autoFocus
            placeholder="https://example.com/article"
            value={url}
            disabled={saving}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <p className="bl-dialog-copy">
          Keep the link in your reading list. Sign in to save a clean article
          copy for offline reading.
        </p>
        {error && (
          <p className="bl-error" role="alert">
            {error}
          </p>
        )}
        <div className="bl-dialog-buttons">
          <button type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button className="bl-primary" disabled={disabled || saving}>
            {saving ? "Saving…" : "Save webpage"}
          </button>
        </div>
      </form>
    </LibraryDialog>
  );
}
