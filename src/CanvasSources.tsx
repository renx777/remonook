// Canvas side panel: notes, highlights (books and web articles), flashcards and bookmarks to put on
// the board. Drag a row onto the board (desktop), or click / tap it, or pick it with the arrow keys
// and Enter. Notes show where they live and recent ones come first; a note with children can be laid
// out as a small tree of cards.
import React, { useMemo, useRef, useState } from "react";
import { X, GitFork, BookOpen, Globe } from "lucide-react";
import { index } from "./domain.mjs";
import { displayText, notePath } from "./relations.mjs";
import { readingBook } from "./reading.mjs";
import type { Workspace, Node } from "./data";

export const CANVAS_DRAG = "application/x-remonook-canvas";
export type SourceItem =
  | { type: "note"; id: string }
  | { type: "link"; url: string };
type Row = {
  key: string;
  item: SourceItem;
  title: string;
  detail: string;
  icon?: "book" | "web";
  children?: boolean;
};
const TABS = [
  ["notes", "Notes"],
  ["highlights", "Highlights"],
  ["flashcards", "Flashcards"],
  ["bookmarks", "Bookmarks"],
] as const;
const LIMIT = 120;

export function CanvasSources({
  doc,
  homeId,
  onAdd,
  onLayout,
  onClose,
}: {
  doc: Workspace;
  homeId: string | null;
  onAdd: (item: SourceItem) => void;
  onLayout: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("notes"),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(0),
    list = useRef<HTMLUListElement>(null);
  const bullets = doc.tables.bullets as Node[];
  const idx = useMemo(() => index(bullets), [bullets]);
  // Bullets that belong to boards (under "Canvases") are already on a canvas: leave them out.
  const onBoards = useMemo(() => {
    const ids = new Set<string>();
    if (!homeId) return ids;
    const stack = [homeId];
    while (stack.length) {
      const id = stack.pop()!;
      ids.add(id);
      for (const c of idx.children.get(id) || []) stack.push(c.id);
    }
    return ids;
  }, [idx, homeId]);
  const times = doc.web.noteTimes || {};
  const recent = (a: Node, b: Node) =>
    (times[b.id]?.updatedAt || 0) - (times[a.id]?.updatedAt || 0);
  const path = (n: Node) =>
    n.parentId ? notePath(bullets, n.parentId, idx) : "Top level";
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = (...texts: string[]) => {
    const hay = texts.join(" ").toLocaleLowerCase();
    return terms.every((t) => hay.includes(t));
  };
  const rows: Row[] = useMemo(() => {
    if (tab === "notes" || tab === "flashcards")
      return bullets
        .filter(
          (n) =>
            !n.deleted &&
            n.text.trim() &&
            !onBoards.has(n.id) &&
            !n.mirrorSourceId &&
            (tab === "notes" || n.kind === "QUESTION") &&
            matches(displayText(n.text)),
        )
        .sort(recent)
        .slice(0, LIMIT)
        .map((n) => ({
          key: n.id,
          item: { type: "note", id: n.id },
          title: displayText(n.text).slice(0, 140),
          detail: path(n),
          children: (idx.children.get(n.id) || []).length > 0,
        }));
    if (tab === "highlights") {
      const live = new Set(bullets.filter((n) => !n.deleted).map((n) => n.id)),
        byId = idx.byId;
      const book = Object.values(doc.web.readingHighlights || {})
        .filter((h: any) => !h.deleted && live.has(h.bulletId))
        .map((h: any) => ({
          key: h.id,
          item: { type: "note", id: h.bulletId } as SourceItem,
          title: displayText(byId.get(h.bulletId)?.text || "").slice(0, 160),
          detail: readingBook(doc, h.bookHash)?.title || "Book",
          icon: "book" as const,
          at: times[h.bulletId]?.createdAt || 0,
        }));
      const web = Object.values(doc.web.webHighlights || {})
        .filter((h: any) => !h.deleted && h.bulletId && live.has(h.bulletId))
        .map((h: any) => ({
          key: h.id,
          item: { type: "note", id: h.bulletId } as SourceItem,
          title: displayText(byId.get(h.bulletId)?.text || h.exact || "").slice(0, 160),
          detail: doc.web.bookmarks?.[h.bookmarkId]?.title || "Web article",
          icon: "web" as const,
          at: times[h.bulletId]?.createdAt || 0,
        }));
      return [...book, ...web]
        .filter((r) => r.title && matches(r.title, r.detail))
        .sort((a, b) => b.at - a.at)
        .slice(0, LIMIT);
    }
    return Object.values(doc.web.bookmarks || {})
      .filter((b: any) => !b.deleted && matches(b.title || "", b.url))
      .sort((a: any, b: any) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
      .slice(0, LIMIT)
      .map((b: any) => ({
        key: b.id,
        item: { type: "link", url: b.url } as SourceItem,
        title: b.title || b.url,
        detail: (() => {
          try {
            return new URL(b.url).hostname.replace(/^www\./, "");
          } catch {
            return b.url;
          }
        })(),
        icon: "web" as const,
      }));
  }, [tab, query, bullets, doc.web, onBoards, idx]);
  const pick = (i: number) => rows[i] && onAdd(rows[i].item);
  const move = (to: number) => {
    const next = Math.max(0, Math.min(rows.length - 1, to));
    setActive(next);
    list.current
      ?.querySelectorAll("li")
      [next]?.scrollIntoView({ block: "nearest" });
  };
  return (
    <aside className="canvas-sources" aria-label="Add from your library">
      <header>
        <div className="canvas-sources-tabs" role="tablist" aria-label="Source">
          {TABS.map(([id, name]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                setActive(0);
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <button className="canvas-sources-close" aria-label="Close panel" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <input
        autoFocus
        aria-label={"Search " + tab}
        placeholder={"Search " + tab + "…"}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            move(active + 1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            move(active - 1);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(active);
          } else if (e.key === "Escape") onClose();
        }}
        aria-controls="canvas-sources-list"
        aria-activedescendant={rows[active] ? "canvas-src-" + rows[active].key : undefined}
      />
      <p className="canvas-sources-hint">
        Drag onto the board, or click to add. {tab === "notes" && "Recent first."}
      </p>
      <ul id="canvas-sources-list" role="listbox" aria-label={tab} ref={list}>
        {rows.map((r, i) => (
          <li
            key={r.key}
            id={"canvas-src-" + r.key}
            role="option"
            aria-selected={i === active}
            className={i === active ? "is-active" : ""}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(CANVAS_DRAG, JSON.stringify(r.item));
              e.dataTransfer.effectAllowed = "copy";
            }}
            onMouseEnter={() => setActive(i)}
            onClick={() => onAdd(r.item)}
          >
            <span className="canvas-src-title">
              {r.icon === "book" && <BookOpen size={12} />}
              {r.icon === "web" && <Globe size={12} />}
              {r.title}
            </span>
            <small>{r.detail}</small>
            {r.children && r.item.type === "note" && (
              <button
                className="canvas-src-layout"
                aria-label={"Lay out " + r.title.slice(0, 40) + " with its children"}
                title="Lay out with its children as connected cards"
                onClick={(e) => {
                  e.stopPropagation();
                  onLayout((r.item as { id: string }).id);
                }}
              >
                <GitFork size={14} />
              </button>
            )}
          </li>
        ))}
        {!rows.length && (
          <li className="canvas-src-empty" role="presentation">
            {query ? "Nothing matches." : "Nothing here yet."}
          </li>
        )}
        {rows.length >= LIMIT && (
          <li className="canvas-src-empty" role="presentation">
            Showing the first {LIMIT}. Type to narrow it down.
          </li>
        )}
      </ul>
    </aside>
  );
}
