import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Search,
  ListTree,
  Crop,
  ScanLine,
  NotebookPen,
  Check,
  MoreHorizontal,
  ExternalLink,
  RefreshCw,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { ActionMenu, ActionMenuItem } from "./ActionMenu";

export type ReaderDisplay = {
  size: number;
  theme: string;
  font: "serif" | "sans";
  width: "narrow" | "medium" | "wide";
};
type Panel = "find" | "outline" | "display" | null;
type Props = {
  title: string;
  url: string;
  read: boolean;
  progress: string;
  fraction: number;
  noteCount: number;
  notesOpen: boolean;
  outline: string[];
  display: ReaderDisplay;
  canCapture: boolean;
  canUpdate: boolean;
  updating: boolean;
  onDisplay: (display: ReaderDisplay) => void;
  onBack: () => void;
  onNotes: () => void;
  onRead: () => void;
  onFind: (query: string, next: boolean) => boolean;
  onOutline: (index: number) => void;
  onRegion: () => void;
  onCaptureVisible: () => void;
  onUpdate: () => void;
};

// One slim header for the reader: everyday tools as icons, rare ones in "More".
// On phones the everyday tools move to a bottom bar and panels open as sheets.
export function ReaderChrome(p: Props) {
  const [panel, setPanel] = useState<Panel>(null),
    [menu, setMenu] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [missing, setMissing] = useState(false);
  const findInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!panel) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setPanel(null);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [panel]);
  useEffect(() => {
    if (panel === "find") findInput.current?.focus();
  }, [panel]);
  const toggle = (next: Panel) => setPanel((current) => (current === next ? null : next));
  const find = (next: boolean) => {
    if (!query.trim()) return;
    setMissing(!p.onFind(query, next));
  };
  const setDisplay = (patch: Partial<ReaderDisplay>) => p.onDisplay({ ...p.display, ...patch });
  const captureMenu = (id: string, trigger: React.ReactElement) => (
    <ActionMenu open={menu === id} onOpenChange={(open) => setMenu(open ? id : null)} trigger={trigger}>
      <div className="bookmark-action-menu reader-menu">
        <ActionMenuItem
          disabled={!p.canCapture}
          onClick={() => {
            setMenu(null);
            setPanel(null);
            p.onRegion();
          }}
        >
          <Crop size={16} />
          Select screenshot region
        </ActionMenuItem>
        <ActionMenuItem
          disabled={!p.canCapture}
          onClick={() => {
            setMenu(null);
            setPanel(null);
            p.onCaptureVisible();
          }}
        >
          <ScanLine size={16} />
          Capture visible article
        </ActionMenuItem>
      </div>
    </ActionMenu>
  );
  return (
    <>
      <header className="web-reader-toolbar reader-chrome">
        <button className="reader-back" aria-label="Back to bookmarks" onClick={p.onBack}>
          <ArrowLeft size={17} />
          <span>Bookmarks</span>
        </button>
        <strong title={p.title}>{p.title}</strong>
        <span className="reader-progress-label">{p.progress}</span>
        <div className="reader-tools" role="toolbar" aria-label="Reader tools">
          <button
            className="reader-tool"
            aria-label="Find in article"
            title="Find in article"
            aria-pressed={panel === "find"}
            onClick={() => toggle("find")}
          >
            <Search size={18} />
          </button>
          <button
            className="reader-tool"
            aria-label="Outline"
            title="Outline"
            aria-pressed={panel === "outline"}
            disabled={!p.outline.length}
            onClick={() => toggle("outline")}
          >
            <ListTree size={18} />
          </button>
          <button
            className="reader-tool reader-aa"
            aria-label="Text and display"
            title="Text and display"
            aria-pressed={panel === "display"}
            onClick={() => toggle("display")}
          >
            Aa
          </button>
          {captureMenu(
            "capture",
            <button className="reader-tool" aria-label="Capture" title="Capture">
              <Crop size={18} />
            </button>,
          )}
          <span className="reader-tool-divider" aria-hidden="true" />
          <button
            className="reader-notes-button"
            aria-pressed={p.notesOpen}
            aria-label={`Notes, ${p.noteCount}`}
            onClick={() => {
              setPanel(null);
              p.onNotes();
            }}
          >
            <NotebookPen size={16} />
            <span className="reader-notes-label">Notes</span>
            {p.noteCount > 0 && <span className="reader-badge">{p.noteCount}</span>}
          </button>
          <button className="reader-read-button" aria-pressed={p.read} onClick={p.onRead}>
            <Check size={15} />
            {p.read ? "Mark unread" : "Mark read"}
          </button>
          <ActionMenu
            open={menu === "more"}
            onOpenChange={(open) => setMenu(open ? "more" : null)}
            trigger={
              <button className="reader-tool reader-more" aria-label="More reader actions" title="More">
                <MoreHorizontal size={18} />
              </button>
            }
          >
            <div className="bookmark-action-menu reader-menu">
              <ActionMenuItem
                onClick={() => {
                  setMenu(null);
                  window.open(p.url, "_blank", "noopener,noreferrer");
                }}
              >
                <ExternalLink size={16} />
                Open original
              </ActionMenuItem>
              <ActionMenuItem
                disabled={!p.canUpdate}
                onClick={() => {
                  setMenu(null);
                  p.onUpdate();
                }}
              >
                <RefreshCw size={16} />
                {p.updating ? "Updating…" : "Update saved copy"}
              </ActionMenuItem>
              <ActionMenuItem
                className="reader-menu-phone"
                onClick={() => {
                  setMenu(null);
                  p.onRead();
                }}
              >
                <Check size={16} />
                {p.read ? "Mark unread" : "Mark read"}
              </ActionMenuItem>
            </div>
          </ActionMenu>
        </div>
      </header>
      <div className="reader-progress" aria-hidden="true">
        <i style={{ width: Math.round(p.fraction * 100) + "%" }} />
      </div>
      {panel && <div className="reader-panel-backdrop" aria-hidden="true" onPointerDown={() => setPanel(null)} />}
      {panel === "find" && (
        <section className="reader-panel" aria-label="Find in article">
          <form
            className="reader-find"
            onSubmit={(e) => {
              e.preventDefault();
              find(true);
            }}
          >
            <Search size={16} aria-hidden="true" />
            <input
              ref={findInput}
              aria-label="Search article"
              placeholder="Find in article…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setMissing(false);
              }}
            />
            <button type="submit" disabled={!query.trim()}>
              Next
            </button>
            <button type="button" aria-label="Close find" onClick={() => setPanel(null)}>
              <X size={16} />
            </button>
          </form>
          {missing && (
            <p className="reader-panel-note" role="status">
              No matching passage.
            </p>
          )}
        </section>
      )}
      {panel === "outline" && (
        <section className="reader-panel" aria-label="Outline">
          <h2>Outline</h2>
          <ol className="reader-outline">
            {p.outline.map((text, i) => (
              <li key={i}>
                <button
                  onClick={() => {
                    setPanel(null);
                    p.onOutline(i);
                  }}
                >
                  {text}
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
      {panel === "display" && (
        <section className="reader-panel reader-display" aria-label="Text and display">
          <h2>Text and display</h2>
          <div className="reader-setting">
            <span>Text size</span>
            <div className="reader-stepper">
              <button
                aria-label="Smaller text"
                disabled={p.display.size <= 14}
                onClick={() => setDisplay({ size: Math.max(14, p.display.size - 1) })}
              >
                <Minus size={15} />
              </button>
              <output aria-live="polite">{p.display.size} px</output>
              <button
                aria-label="Larger text"
                disabled={p.display.size >= 28}
                onClick={() => setDisplay({ size: Math.min(28, p.display.size + 1) })}
              >
                <Plus size={15} />
              </button>
            </div>
          </div>
          <div className="reader-setting reader-setting-stack">
            <span>Theme</span>
            <div className="reader-themes" role="group" aria-label="Theme">
              {[
                ["default", "App"],
                ["light", "Light"],
                ["sepia", "Sepia"],
                ["dark", "Dark"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={"theme-" + value}
                  aria-pressed={p.display.theme === value}
                  onClick={() => setDisplay({ theme: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="reader-setting">
            <span>Font</span>
            <div className="reader-segments" role="group" aria-label="Font">
              {(
                [
                  ["serif", "Serif"],
                  ["sans", "Sans"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={"font-" + value}
                  aria-pressed={p.display.font === value}
                  onClick={() => setDisplay({ font: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="reader-setting">
            <span>Line width</span>
            <div className="reader-segments" role="group" aria-label="Line width">
              {(
                [
                  ["narrow", "Narrow"],
                  ["medium", "Medium"],
                  ["wide", "Wide"],
                ] as const
              ).map(([value, label]) => (
                <button key={value} aria-pressed={p.display.width === value} onClick={() => setDisplay({ width: value })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
      <nav className="reader-bottom-bar" aria-label="Reader tools">
        <button aria-pressed={panel === "outline"} disabled={!p.outline.length} onClick={() => toggle("outline")}>
          <ListTree size={20} />
          Outline
        </button>
        <button aria-pressed={panel === "find"} onClick={() => toggle("find")}>
          <Search size={20} />
          Find
        </button>
        <button aria-pressed={panel === "display"} onClick={() => toggle("display")}>
          <span className="reader-aa-glyph" aria-hidden="true">
            Aa
          </span>
          Display
        </button>
        {captureMenu(
          "capture-phone",
          <button>
            <Crop size={20} />
            Capture
          </button>,
        )}
        <button
          aria-pressed={p.notesOpen}
          onClick={() => {
            setPanel(null);
            p.onNotes();
          }}
        >
          <NotebookPen size={20} />
          {p.noteCount ? `Notes ${p.noteCount}` : "Notes"}
        </button>
      </nav>
    </>
  );
}
