import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import "./quick-access.css";

export type QuickPlacement = "rail" | "bar";
export type QuickTool = "flashcards" | "mcqs" | "mindmap" | "bookmarks" | "bookshelf";
export type QuickPrefs = { placement: QuickPlacement; collapsed: boolean };

const KEY = "remo-quick-access";
const DRAG_TYPE = "application/x-remo-quick-access";

/** Per-device preference; falls back to the bar when storage is unavailable. */
export function useQuickPrefs(): [QuickPrefs, (next: Partial<QuickPrefs>) => void] {
  const [prefs, setPrefs] = useState<QuickPrefs>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(KEY) || "null");
      if (saved && (saved.placement === "rail" || saved.placement === "bar"))
        return { placement: saved.placement, collapsed: !!saved.collapsed };
    } catch {}
    return { placement: "bar", collapsed: false };
  });
  const update = (next: Partial<QuickPrefs>) =>
    setPrefs((current) => {
      const value = { ...current, ...next };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(value));
      } catch {}
      return value;
    });
  return [prefs, update];
}

const svg = (children: ReactNode, size = 18) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const ICONS: Record<QuickTool, ReactNode> = {
  flashcards: svg(<><rect x="3" y="7" width="14" height="12" rx="2" /><path d="M7 4h12a2 2 0 0 1 2 2v10" /></>),
  mcqs: svg(<><circle cx="5.5" cy="7" r="2.2" /><circle cx="5.5" cy="17" r="2.2" /><path d="M11 7h9M11 17h9" /></>),
  mindmap: svg(<><circle cx="12" cy="12" r="2.5" /><circle cx="5" cy="5" r="2" /><circle cx="19" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="M6.5 6.5l3.6 3.6M17.5 6.5l-3.6 3.6M6.5 17.5l3.6-3.6M17.5 17.5l-3.6-3.6" /></>),
  bookmarks: svg(<path d="M6 3h12v18l-6-4-6 4z" />, 17),
  bookshelf: svg(<path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5.2l3.4-.9 3.3 15.4-3.4.9z" />),
};
const LABELS: Record<QuickTool, string> = {
  flashcards: "Flashcards",
  mcqs: "MCQs",
  mindmap: "Mindmaps",
  bookmarks: "Bookmarks",
  bookshelf: "Bookshelf",
};
const TOOLS: QuickTool[] = ["flashcards", "mcqs", "mindmap", "bookmarks", "bookshelf"];

type Props = {
  placement: QuickPlacement;
  collapsed: boolean;
  active: QuickTool | null;
  /** Number shown on a tool, e.g. cards due. Zero or missing shows nothing. */
  counts: Partial<Record<QuickTool, { value: number; label: string }>>;
  onOpen: (tool: QuickTool) => void;
  onChange: (next: Partial<QuickPrefs>) => void;
};

export function QuickAccess({ placement, collapsed, active, counts, onOpen, onChange }: Props) {
  const [dragging, setDragging] = useState(false),
    [over, setOver] = useState<QuickPlacement | null>(null);
  useEffect(() => {
    if (!dragging) return;
    const end = () => {
      setDragging(false);
      setOver(null);
    };
    window.addEventListener("dragend", end);
    window.addEventListener("drop", end);
    return () => {
      window.removeEventListener("dragend", end);
      window.removeEventListener("drop", end);
    };
  }, [dragging]);
  const other: QuickPlacement = placement === "rail" ? "bar" : "rail";
  const moveLabel = placement === "rail" ? "Move quick access under the top bar" : "Move quick access to the left edge";
  if (collapsed)
    return (
      <button
        className={`quick-access-reveal is-${placement}`}
        aria-label="Show quick access"
        title="Show quick access"
        onClick={() => onChange({ collapsed: false })}
      >
        {placement === "rail" ? "›" : <>Quick access <span aria-hidden="true">▾</span></>}
      </button>
    );
  const zone = (target: QuickPlacement) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver(target);
    },
    onDragLeave: () => setOver((v) => (v === target ? null : v)),
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      setDragging(false);
      setOver(null);
      if (target !== placement) onChange({ placement: target });
    },
  });
  return (
    <>
      <nav className={`quick-access is-${placement}`} aria-label="Quick access">
        <button
          className="quick-access-grip"
          draggable
          aria-label={moveLabel}
          title="Drag to the left edge or under the top bar · click to switch"
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, placement);
            e.dataTransfer.effectAllowed = "move";
            // Changing the page inside dragstart can cancel the drag in Chrome.
            setTimeout(() => setDragging(true), 0);
          }}
          onClick={() => onChange({ placement: other })}
        >
          <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true">
            <circle cx="3" cy="3" r="1.4" /><circle cx="9" cy="3" r="1.4" /><circle cx="3" cy="8" r="1.4" /><circle cx="9" cy="8" r="1.4" /><circle cx="3" cy="13" r="1.4" /><circle cx="9" cy="13" r="1.4" />
          </svg>
        </button>
        {TOOLS.map((tool) => {
          const count = counts[tool];
          return (
            <button
              key={tool}
              className="quick-access-item"
              aria-current={active === tool ? "page" : undefined}
              aria-label={LABELS[tool] + (count?.value ? `, ${count.label}` : "")}
              title={placement === "rail" ? LABELS[tool] + (count?.value ? ` · ${count.label}` : "") : undefined}
              onClick={() => onOpen(tool)}
            >
              {ICONS[tool]}
              {placement === "bar" && <span className="quick-access-label">{LABELS[tool]}</span>}
              {!!count?.value && (
                <span className="quick-access-count" aria-hidden="true">
                  {placement === "rail" ? (count.value > 99 ? "99+" : count.value) : count.label}
                </span>
              )}
            </button>
          );
        })}
        <span className="quick-access-spacer" />
        <button className="quick-access-hide" aria-label="Hide quick access" title="Hide quick access" onClick={() => onChange({ collapsed: true })}>
          {placement === "rail" ? "‹" : "×"}
        </button>
      </nav>
      {dragging && (
        <div className="quick-access-zones" aria-hidden="true">
          <div className={`quick-access-zone is-rail ${over === "rail" ? "is-over" : ""} ${placement === "rail" ? "is-current" : ""}`} {...zone("rail")}>
            <span>Left edge</span>
          </div>
          <div className={`quick-access-zone is-bar ${over === "bar" ? "is-over" : ""} ${placement === "bar" ? "is-current" : ""}`} {...zone("bar")}>
            <span>Under the top bar</span>
          </div>
        </div>
      )}
    </>
  );
}
