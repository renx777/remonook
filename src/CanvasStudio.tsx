// Canvas: boards of cards (text, notes, images, links and videos, files, groups) joined by
// connections, stored as JSON Canvas. Cards are edited where they sit, Obsidian-style: double-click
// (or Enter) to type, a floating bar above the selection for colour, edit, zoom and remove, a
// toolbar at the bottom to add cards, and paste or drop images, links and text onto the board.
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  applyNodeChanges,
  type NodeChange,
  ReactFlowProvider,
  Background,
  Controls,
  ControlButton,
  MiniMap,
  NodeToolbar,
  Handle,
  Position,
  NodeResizer,
  MarkerType,
  useReactFlow,
  useViewport,
  ViewportPortal,
  type NodeProps,
  type Node as FlowNode,
  type Edge as FlowEdge,
  type Connection,
} from "@xyflow/react";
import {
  Type,
  ImagePlus,
  Link as LinkIcon,
  SquareDashed,
  FileText,
  Palette,
  Trash2,
  Pencil,
  Focus,
  Copy,
  Ellipsis,
  Undo2,
  Redo2,
  Magnet,
  Map as MapIcon,
  ExternalLink,
  Play,
  Group as GroupIcon,
  ArrowRight,
  Scaling,
  ListTree,
  Library,
  Presentation,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { User } from "firebase/auth";
import { aiRequest } from "./ai-client";
import { validateAiResult } from "./ai-contract.mjs";
import { CanvasSources, CANVAS_DRAG, type SourceItem } from "./CanvasSources";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  canvasBoards,
  changeCanvas,
  createCanvas,
  exportCanvas,
  parseCanvas,
  removeCanvasCards,
  safeCanvasUrl,
  CANVAS_LIMITS,
  canvasNoteText,
  moveCanvasCards,
  nextCanvasOrder,
  trashedBullet,
  canvasTitle,
  renameCanvas,
  adoptCanvasRoots,
  canvasToOutline,
  purgeCanvas,
  cardsInGroup,
  canvasHomeId,
} from "./json-canvas.mjs";
import { bullet } from "./domain.mjs";
import { withNodes } from "./workspace-nodes.mjs";
import { sourceId } from "./relations.mjs";
import { mediaLink } from "./media.mjs";
import { NoteField } from "./ReaderBookNotes";
import { ReadingCitation } from "./ReadingSources";
import { bulletMarkdown } from "./ai-markdown.mjs";
import type { Workspace, Node } from "./data";
import "./canvas.css";
type StoredImage = {
  id: string;
  fileName: string;
  mimeType: string;
  sourceUrl: string;
  credit: string;
  licenseUrl: string;
};
type Props = {
  doc: Workspace;
  disabled: boolean;
  onChange: (update: (doc: Workspace) => Workspace) => void;
  onText: (id: string, value: { text: string; formatting: string }) => void;
  readCurrentNode: (id: string) => Node | undefined;
  onUndo: (redo: boolean) => void;
  onOpenNote: (id: string) => void;
  assets?: Map<string, Blob>;
  onStoreImages?: (files: File[]) => Promise<StoredImage[]>;
  // Opens this board (from an "Open canvas" button in Notes); n changes on every request.
  open?: { id: string; n: number } | null;
  // Signed-in account, for AI on the board.
  user?: User | null;
};
const palette: Record<string, string> = {
  "1": "#d97878",
  "2": "#d99b69",
  "3": "#c6af60",
  "4": "#74ae86",
  "5": "#70abbc",
  "6": "#ac8bc8",
};
const colorNames = ["Red", "Orange", "Yellow", "Green", "Cyan", "Purple"];
const tint = (color?: string) =>
  color ? palette[color] || color : "var(--line)";
// Video and audio players a link card can show in place (YouTube, Vimeo, Spotify).
const playable = (url?: string) => {
  const m = url ? mediaLink(url) : null;
  return m?.embed && ["youtube", "vimeo", "spotify"].includes(m.kind)
    ? m
    : null;
};
const youtubeId = (embed: string) =>
  embed.match(/youtube-nocookie\.com\/embed\/([a-zA-Z0-9_-]{11})/)?.[1];
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
function VideoBody({ url }: { url: string }) {
  const m = playable(url)!,
    [playing, setPlaying] = useState(m.kind === "spotify"),
    id = youtubeId(m.embed!);
  if (playing) {
    const src = new URL(m.embed!);
    if (m.kind !== "spotify") src.searchParams.set("autoplay", "1");
    return (
      <iframe
        className="canvas-video nodrag nowheel"
        src={src.href}
        title={m.title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );
  }
  // The poster moves and selects the card like any other; only the play button plays.
  return (
    <div
      className="canvas-video-poster"
      style={
        id
          ? { backgroundImage: `url(https://i.ytimg.com/vi/${id}/hqdefault.jpg)` }
          : undefined
      }
    >
      <button
        type="button"
        className="canvas-play nodrag"
        aria-label={"Play " + m.title}
        onClick={() => setPlaying(true)}
      >
        <Play size={22} fill="currentColor" />
      </button>
    </div>
  );
}
function GroupLabel({ d }: { d: any }) {
  if (!d.renaming) return <strong className="canvas-group-label">{d.label || "Group"}</strong>;
  return (
    <input
      className="canvas-group-input nodrag nokey"
      aria-label="Group label"
      autoFocus
      defaultValue={d.label || "Group"}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") d.rename(null);
      }}
      onBlur={(e) => d.rename(e.target.value)}
    />
  );
}
const types = {
  card: memo(function CanvasCard({ data, selected }: NodeProps) {
    const d = data as any,
      video = d.kind === "link" && playable(d.url);
    return (
      <div
        tabIndex={0}
        aria-label={
          d.kind === "text"
            ? "Text card"
            : d.image
              ? "Image card"
              : video
                ? "Video card"
                : d.kind + " card"
        }
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest(".nodrag")) return;
          d.startEdit();
        }}
        className={
          "canvas-card is-" +
          d.kind +
          (d.kind === "group" ? " canvas-group" : "") +
          (d.image ? " is-image" : "") +
          (video ? " is-video" : "") +
          (d.editing ? " is-editing" : "") +
          (d.color ? " has-color" : "")
        }
        style={{ "--card-tint": tint(d.color) } as React.CSSProperties}
      >
        <NodeResizer
          isVisible={selected && !d.disabled}
          minWidth={d.image ? 60 : video ? 200 : 120}
          minHeight={d.image ? 40 : video ? 120 : 60}
          keepAspectRatio={false}
          onResizeStart={() => d.beginResize()}
          onResizeEnd={(_, p) => d.resize(p)}
        />
        {["top", "right", "bottom", "left"].map((side) => (
          <React.Fragment key={side}>
            <Handle
              type="source"
              position={side as Position}
              id={"out-" + side}
              isConnectable={!d.disabled}
            />
            <Handle
              type="target"
              position={side as Position}
              id={"in-" + side}
              isConnectable={!d.disabled}
            />
          </React.Fragment>
        ))}
        {d.kind === "text" ? (
          d.editing && d.note ? (
            <div
              className="canvas-card-editor nodrag nowheel nopan nokey"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  d.stopEdit();
                }
              }}
            >
              <NoteField
                key={d.note.id}
                node={d.note}
                disabled={d.disabled}
                onText={d.onText}
                readCurrentNode={d.readCurrentNode}
                onReady={() => {}}
                onUndo={d.onUndo}
                label="Edit canvas note"
              />
            </div>
          ) : (
            <div
              className="canvas-markdown"
              onClick={(e) => {
                const a = (e.target as HTMLElement).closest("a");
                if (a) {
                  e.preventDefault();
                  if (safeCanvasUrl(a.href))
                    window.open(a.href, "_blank", "noopener,noreferrer");
                }
              }}
              dangerouslySetInnerHTML={{
                __html:
                  d.html ||
                  `<span class="canvas-muted">${d.disabled ? "Empty card" : "Double-click to write…"}</span>`,
              }}
            />
          )
        ) : d.image ? (
          <div className="canvas-card-body">
            <img
              className="canvas-image"
              src={d.image}
              alt={d.alt || "Canvas image"}
              draggable={false}
            />
          </div>
        ) : video ? (
          <div className="canvas-card-body">
            <div className="canvas-card-strip">
              <Play size={12} />
              <span>{video.title}</span>
              <a
                className="nodrag"
                href={video.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={"Open on " + hostOf(video.href)}
              >
                <ExternalLink size={12} />
              </a>
            </div>
            <VideoBody url={d.url} />
          </div>
        ) : d.kind === "link" ? (
          <>
            <small className="canvas-kicker">{hostOf(d.url)}</small>
            {d.title && <strong className="canvas-link-title">{d.title}</strong>}
            <p className="canvas-url">{d.url}</p>
            <a
              className="nodrag"
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open link ↗
            </a>
          </>
        ) : d.kind === "file" ? (
          <>
            <small className="canvas-kicker">FILE</small>
            <p>
              {d.file}
              {d.subpath}
            </p>
            <span className="canvas-muted">
              {d.noteId ? "Image not on this device yet" : "Path kept in export"}
            </span>
          </>
        ) : (
          <GroupLabel d={d} />
        )}
        {d.kind === "text" && d.noteId && !d.editing && (
          <div className="canvas-source nodrag">
            <ReadingCitation id={d.noteId} />
          </div>
        )}
        {d.missing && d.kind === "text" && (
          <small className="canvas-missing">
            Note in Trash · last text shown
          </small>
        )}
      </div>
    );
  }),
};
type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// Images and videos keep their shape: whichever way a handle is dragged, the bigger change wins and
// the other side follows; the opposite corner stays put (the image letterboxes during the drag).
function fitResize(n: any, v: { x: number; y: number; width: number; height: number }) {
  const keep = (n.type === "file" && n.noteId) || (n.type === "link" && playable(n.url));
  if (!keep)
    return {
      position: [Math.round(v.x), Math.round(v.y)],
      size: [Math.round(v.width), Math.round(v.height)],
    };
  const [ow, oh] = n.size,
    [ox, oy] = n.position,
    ratio = oh / ow,
    byWidth = Math.abs(v.width / ow - 1) >= Math.abs(v.height / oh - 1),
    w = Math.round(byWidth ? v.width : v.height / ratio),
    h = Math.round(byWidth ? v.width * ratio : v.height),
    x = Math.round(v.x) !== ox ? ox + ow - w : ox,
    y = Math.round(v.y) !== oy ? oy + oh - h : oy;
  return { position: [Math.round(x), Math.round(y)], size: [w, h] };
}
// Keys typed into a field, the note editor or a dialog belong to it, not to the board.
const typing = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.isContentEditable ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
      !!el.closest?.('[role="dialog"], dialog'))
  );
};
const normalUrl = (value: string) => {
  const v = value.trim();
  return /^[a-z][\w+.-]*:/i.test(v) ? v : "https://" + v;
};
const inside = (card: any, group: any) =>
  card.position[0] >= group.position[0] &&
  card.position[1] >= group.position[1] &&
  card.position[0] + card.size[0] <= group.position[0] + group.size[0] &&
  card.position[1] + card.size[1] <= group.position[1] + group.size[1];
const stored = (key: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
};
const store = (key: string, value: boolean) => {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
};
// Images over the 2 MB attachment limit (large screenshots) are scaled down and saved as WebP.
async function fitImage(file: File): Promise<File> {
  if (file.size <= 2 * 1024 * 1024 || file.type === "image/svg+xml") return file;
  const bitmap = await createImageBitmap(file);
  for (const [max, quality] of [
    [2400, 0.86],
    [1800, 0.78],
    [1200, 0.7],
  ]) {
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height)),
      c = document.createElement("canvas");
    c.width = Math.round(bitmap.width * scale);
    c.height = Math.round(bitmap.height * scale);
    c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) =>
      c.toBlob(r, "image/webp", quality),
    );
    if (blob && blob.size <= 2 * 1024 * 1024)
      return new File(
        [blob],
        (file.name.replace(/\.[^.]+$/, "") || "image") + ".webp",
        { type: "image/webp" },
      );
  }
  throw Error("This image is too large even after shrinking it.");
}
async function cardSize(file: File) {
  try {
    const b = await createImageBitmap(file),
      w = Math.min(420, Math.max(80, b.width));
    return [Math.round(w), Math.max(40, Math.round((w * b.height) / b.width))];
  } catch {
    return [320, 240];
  }
}
function Editor({ boardId, ...p }: Props & { boardId: string }) {
  const b = p.doc.web.canvases?.[boardId],
    flow = useReactFlow(),
    stage = useRef<HTMLDivElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    [edgeId, setEdgeId] = useState<string | null>(null),
    [editingId, setEditingId] = useState<string | null>(null),
    [renamingId, setRenamingId] = useState<string | null>(null),
    [picker, setPicker] = useState(false),
    [ask, setAsk] = useState<null | { kind: "link" | "file"; target?: string }>(null),
    [askValue, setAskValue] = useState(""),
    [menu, setMenu] = useState<null | "color" | "more" | "edge-color" | "size" | "ai">(null),
    [filter, setFilter] = useState(""),
    [error, setError] = useState(""),
    [info, setInfo] = useState<null | { text: string; open?: string }>(null),
    [busy, setBusy] = useState(false),
    [dragging, setDragging] = useState(false),
    [resizing, setResizing] = useState(false),
    [guides, setGuides] = useState<{ x?: number; y?: number; box?: number[] } | null>(null),
    [sections, setSections] = useState(false),
    [presenting, setPresenting] = useState<number | null>(null),
    [aiBusy, setAiBusy] = useState(""),
    [askAi, setAskAi] = useState(""),
    workspace = useRef<HTMLDivElement>(null),
    [snap, setSnap] = useState(() => stored("remo-canvas-snap", true)),
    [minimap, setMinimap] = useState(() => stored("remo-canvas-minimap", false));
  const run = (fn: () => void) => {
    try {
      fn();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const edit = (update: (b: any) => any) =>
    run(() => p.onChange((doc) => changeCanvas(doc, boardId, update)));
  const patch = (id: string, patch: any) =>
    edit((b) => ({
      ...b,
      nodes: { ...b.nodes, [id]: { ...b.nodes[id], ...patch } },
    }));
  const patchMany = (ids: string[], patch: any) =>
    edit((b) => ({
      ...b,
      nodes: {
        ...b.nodes,
        ...Object.fromEntries(
          ids.filter((id) => b.nodes[id]).map((id) => [id, { ...b.nodes[id], ...patch }]),
        ),
      },
    }));
  const patchEdge = (id: string, patch: any) =>
    edit((b) => ({
      ...b,
      edges: { ...b.edges, [id]: { ...b.edges[id], ...patch } },
    }));
  const patchRef = useRef(patch);
  patchRef.current = patch;
  const rowById = useMemo(
    () => new Map(p.doc.tables.bullets.map((row) => [row.id, row])),
    [p.doc.tables.bullets],
  );
  // A note's child bullets show under it on the card (a flashcard shows its answer), up to 3 levels.
  const childrenOf = useMemo(() => {
    const map = new Map<string, Node[]>();
    for (const row of p.doc.tables.bullets as Node[])
      if (row.parentId && !row.deleted) {
        const list = map.get(row.parentId) || [];
        list.push(row);
        map.set(row.parentId, list);
      }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [p.doc.tables.bullets]);
  const withChildren = (id: string | undefined, text: string) => {
    if (!id || !childrenOf.has(id)) return text;
    const lines: string[] = [];
    const walk = (parent: string, depth: number) => {
      for (const child of childrenOf.get(parent) || []) {
        if (lines.length >= 40) return;
        lines.push("  ".repeat(depth) + "- " + bulletMarkdown(child).replace(/\n/g, " "));
        if (depth < 2) walk(child.id, depth + 1);
      }
    };
    walk(id, 0);
    return text + "\n\n" + lines.join("\n");
  };
  const bookmarkTitles = useMemo(
    () =>
      new Map(
        Object.values(p.doc.web.bookmarks || {})
          .filter((m: any) => !m.deleted)
          .map((m: any) => [m.url, m.title]),
      ),
    [p.doc.web.bookmarks],
  );
  const htmlCache = useRef(new Map<string, { text: string; html: string }>());
  const renderMarkdown = (id: string, text: string) => {
    const prior = htmlCache.current.get(id);
    if (prior?.text === text) return prior.html;
    const html = DOMPurify.sanitize(
      marked.parse(text, { async: false, breaks: true }) as string,
      { FORBID_TAGS: ["img", "video", "audio", "iframe", "object", "embed"] },
    );
    htmlCache.current.set(id, { text, html });
    return html;
  };
  // Image cards show the image stored with their bullet (object URLs are reused and released).
  const urls = useRef(new Map<string, { blob: Blob; url: string }>());
  useEffect(
    () => () => {
      for (const { url } of urls.current.values()) URL.revokeObjectURL(url);
    },
    [],
  );
  const imageFor = (n: any) => {
    if (n.type !== "file" || !n.noteId) return null;
    const media = p.doc.tables.media.find(
      (m: any) => m.bulletId === n.noteId && m.fileName === n.file,
    );
    const blob = media && p.assets?.get("media/" + media.fileName);
    if (!blob) return null;
    const prior = urls.current.get(n.id);
    if (prior?.blob === blob) return prior.url;
    if (prior) URL.revokeObjectURL(prior.url);
    const url = URL.createObjectURL(blob);
    urls.current.set(n.id, { blob, url });
    return url;
  };
  // While a drag, resize or nudge is under way, positions stay local; the finished move is saved once.
  const gesture = useRef(false),
    pendingSelect = useRef<string[] | null>(null),
    callbacks = useRef<any>({});
  callbacks.current = {
    startEdit: (id: string) => startEdit(id),
    stopEdit: () => setEditingId(null),
    setResizing,
    rename: (id: string, value: string | null) => {
      setRenamingId(null);
      if (value !== null && value.trim() !== (b.nodes[id]?.label || "Group"))
        patch(id, { label: value.trim() || "Group" });
    },
  };
  const projected = useMemo(
    () =>
      Object.values(b.nodes)
        .filter((n: any) => !n.removed)
        .map((n: any) => {
          const current = rowById.get(n.noteId),
            note = current && !current.deleted ? current : undefined;
          const text =
            n.type === "text"
              ? canvasNoteText(
                  note || (n.noteId ? trashedBullet(p.doc, n.noteId) : undefined),
                  n,
                )
              : "";
          return {
            id: n.id,
            type: "card",
            position: { x: n.position[0], y: n.position[1] },
            width: n.size[0],
            height: n.size[1],
            zIndex: n.order,
            style: { width: n.size[0], height: n.size[1] },
            data: {
              ...n,
              kind: n.type,
              disabled: p.disabled,
              missing: n.noteId && !note,
              note: editingId === n.id ? note : undefined,
              editing: editingId === n.id,
              renaming: renamingId === n.id,
              image: imageFor(n),
              alt: n.type === "file" ? n.file : undefined,
              onText: p.onText,
              readCurrentNode: p.readCurrentNode,
              onUndo: p.onUndo,
              startEdit: () => callbacks.current.startEdit(n.id),
              stopEdit: () => callbacks.current.stopEdit(),
              rename: (v: string | null) => callbacks.current.rename(n.id, v),
              html:
                n.type === "text"
                  ? renderMarkdown(n.id + (n.compact ? ":c" : ""), note && !n.compact ? withChildren(note.id, text) : text)
                  : "",
              title: n.type === "link" ? bookmarkTitles.get(n.url) : undefined,
              beginResize: () => {
                gesture.current = true;
                callbacks.current.setResizing(true);
              },
              resize: (v: any) => {
                gesture.current = false;
                callbacks.current.setResizing(false);
                patchRef.current(n.id, fitResize(n, v));
              },
            },
          };
        }),
    [
      b.nodes,
      rowById,
      p.doc.tables.trash,
      p.doc.tables.media,
      p.assets,
      childrenOf,
      bookmarkTitles,
      p.disabled,
      editingId,
      renamingId,
    ],
  );
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>(
    projected as FlowNode[],
  );
  const flowRef = useRef(flowNodes);
  flowRef.current = flowNodes;
  useEffect(() => {
    const select = pendingSelect.current;
    pendingSelect.current = null;
    setFlowNodes((current) => {
      const prior = new Map(current.map((n) => [n.id, n]));
      return (projected as FlowNode[]).map((n) => {
        const old = prior.get(n.id);
        return {
          ...n,
          selected: select ? select.includes(n.id) : !!old?.selected,
          ...(old?.measured ? { measured: old.measured } : {}),
          ...(gesture.current && old
            ? {
                position: old.position,
                width: old.width,
                height: old.height,
                style: old.style,
              }
            : {}),
        };
      });
    });
  }, [projected]);
  // Alignment guides: dragging one card lines its edges or centre up with any other card's when
  // they come within a few pixels, and shows the line.
  const handleNodeChanges = (changes: NodeChange<FlowNode>[]) => {
    const moving = changes.filter(
      (c) => c.type === "position" && c.dragging && c.position,
    ) as any[];
    if (moving.length === 1) {
      const c = moving[0],
        self = flowRef.current.find((n) => n.id === c.id);
      if (self) {
        const w = self.width ?? self.measured?.width ?? 0,
          h = self.height ?? self.measured?.height ?? 0,
          tol = 6 / flow.getZoom();
        let bestX: number[] | null = null,
          bestY: number[] | null = null,
          box: number[] = [];
        for (const o of flowRef.current) {
          if (o.id === c.id || o.selected) continue;
          const ow = o.width ?? o.measured?.width ?? 0,
            oh = o.height ?? o.measured?.height ?? 0;
          for (const a of [0, w / 2, w])
            for (const t of [o.position.x, o.position.x + ow / 2, o.position.x + ow]) {
              const d = t - (c.position.x + a);
              if (Math.abs(d) < tol && (!bestX || Math.abs(d) < Math.abs(bestX[0]))) {
                bestX = [d, t];
                box[0] = Math.min(o.position.y, c.position.y);
                box[1] = Math.max(o.position.y + oh, c.position.y + h);
              }
            }
          for (const a of [0, h / 2, h])
            for (const t of [o.position.y, o.position.y + oh / 2, o.position.y + oh]) {
              const d = t - (c.position.y + a);
              if (Math.abs(d) < tol && (!bestY || Math.abs(d) < Math.abs(bestY[0]))) {
                bestY = [d, t];
                box[2] = Math.min(o.position.x, c.position.x);
                box[3] = Math.max(o.position.x + ow, c.position.x + w);
              }
            }
        }
        if (bestX) c.position = { ...c.position, x: c.position.x + bestX[0] };
        if (bestY) c.position = { ...c.position, y: c.position.y + bestY[0] };
        setGuides(bestX || bestY ? { x: bestX?.[1], y: bestY?.[1], box } : null);
      }
    }
    setFlowNodes((current) => applyNodeChanges<FlowNode>(changes, current));
  };
  const sel = flowNodes.filter((n) => n.selected).map((n) => n.id);
  const selectOnly = (ids: string[]) => {
    setEdgeId(null);
    setFlowNodes((current) =>
      current.map((n) =>
        !!n.selected === ids.includes(n.id)
          ? n
          : { ...n, selected: ids.includes(n.id) },
      ),
    );
  };
  // Leaving a card (selecting something else) ends typing or renaming in it.
  const selKey = sel.join();
  useEffect(() => {
    if (editingId && !sel.includes(editingId)) setEditingId(null);
    if (renamingId && !sel.includes(renamingId)) setRenamingId(null);
    setMenu(null);
  }, [selKey]);
  // Built once per board change, not on every frame of a drag (React Flow re-diffs whatever it gets).
  const live = useMemo(
    () => Object.values(b.nodes).filter((n: any) => !n.removed) as any[],
    [b.nodes],
  );
  const edges: FlowEdge[] = useMemo(() => Object.values(b.edges)
    .filter(
      (e: any) =>
        !e.removed &&
        !b.nodes[e.fromNode]?.removed &&
        !b.nodes[e.toNode]?.removed,
    )
    .map((e: any) => ({
      id: e.id,
      source: e.fromNode,
      target: e.toNode,
      sourceHandle: "out-" + (e.fromSide || "right"),
      targetHandle: "in-" + (e.toSide || "left"),
      label: e.label,
      selected: edgeId === e.id,
      style: { stroke: tint(e.color), strokeWidth: edgeId === e.id ? 2.5 : 1.5 },
      markerStart:
        e.fromEnd === "arrow"
          ? { type: MarkerType.ArrowClosed, color: tint(e.color) }
          : undefined,
      markerEnd:
        e.toEnd !== "none"
          ? { type: MarkerType.ArrowClosed, color: tint(e.color) }
          : undefined,
    })), [b.edges, b.nodes, edgeId]);
  const card = sel.length === 1 ? b.nodes[sel[0]] : null,
    note = card?.noteId ? rowById.get(card.noteId) : null,
    edge = edgeId && !sel.length ? b.edges[edgeId] : null;
  function startEdit(id: string) {
    const n = b.nodes[id];
    if (!n || p.disabled) return;
    selectOnly([id]);
    if (n.type === "text") {
      if (n.noteId && rowById.has(n.noteId)) setEditingId(id);
    } else if (n.type === "group") setRenamingId(id);
    else if (n.type === "link" || (n.type === "file" && !n.noteId)) {
      setPicker(false);
      setAskValue(n.type === "link" ? n.url : n.file);
      setAsk({ kind: n.type, target: id });
    }
  }
  // New cards go at the given point, beside the selected card, or in the middle of the view,
  // moved to the nearest free spot. The view only moves if the new card would be out of sight.
  const place = (w: number, h: number, extra: Rect[] = [], at?: number[]) => {
    const near = at
      ? null
      : (sel
          .map((id) => b.nodes[id])
          .filter((n: any) => n && n.type !== "group")
          .pop() as any);
    let x: number, y: number;
    if (at) {
      x = at[0] - w / 2;
      y = at[1] - h / 2;
    } else if (near) {
      x = near.position[0] + near.size[0] + 60;
      y = near.position[1];
    } else {
      const r = stage.current!.getBoundingClientRect(),
        c = flow.screenToFlowPosition({
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
        });
      x = c.x - w / 2;
      y = c.y - h / 2;
    }
    const others = [
      ...live
        .filter((n) => n.type !== "group")
        .map((n) => ({
          x: n.position[0],
          y: n.position[1],
          w: n.size[0],
          h: n.size[1],
        })),
      ...extra,
    ];
    const free = (cx: number, cy: number) =>
      !others.some((o) => overlaps({ x: cx, y: cy, w, h }, o));
    if (near) {
      for (let i = 0; i < 80 && !free(x, y); i++) y += 40;
    } else if (!at && !free(x, y)) {
      const spots: number[][] = [];
      for (let dx = -1200; dx <= 1200; dx += 40)
        for (let dy = -800; dy <= 800; dy += 40) spots.push([dx, dy]);
      spots.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2));
      const spot = spots.find(([dx, dy]) => free(x + dx, y + dy));
      if (spot) {
        x += spot[0];
        y += spot[1];
      }
    }
    // On the grid, so a multi-card drag with snapping keeps cards lined up with each other.
    const g = snap ? 20 : 1;
    return [Math.round(x / g) * g, Math.round(y / g) * g];
  };
  const reveal = (x: number, y: number, w: number, h: number) => {
    const r = stage.current?.getBoundingClientRect();
    if (!r) return;
    const a = flow.screenToFlowPosition({ x: r.left, y: r.top }),
      z = flow.screenToFlowPosition({ x: r.right, y: r.bottom });
    if (x < a.x || y < a.y || x + w > z.x || y + h > z.y)
      flow.setCenter(x + w / 2, y + h / 2, {
        zoom: flow.getZoom(),
        duration: 200,
      });
  };
  const withSelection = (ids: string[], change: () => void) => {
    pendingSelect.current = ids;
    try {
      change();
    } catch (e) {
      pendingSelect.current = null;
      throw e;
    }
  };
  const roomFor = (board: any, count: number) => {
    if (
      Object.values(board.nodes).filter((n: any) => !n.removed).length + count >
      CANVAS_LIMITS.nodes
    )
      throw Error("This canvas has reached 400 cards.");
  };
  type AddOptions = {
    noteId?: string;
    text?: string;
    url?: string;
    file?: string;
    at?: number[];
    edit?: boolean;
  };
  const add = (kind: "text" | "link" | "file", o: AddOptions = {}) =>
    run(() => {
      const id = crypto.randomUUID(),
        video = kind === "link" && playable(o.url),
        size =
          kind === "text"
            ? [260, 140]
            : video
              ? video.kind === "spotify"
                ? [360, 190]
                : [400, 260]
              : [280, 120],
        [x, y] = place(size[0], size[1], [], o.at);
      let created = "";
      withSelection([id], () =>
        p.onChange((doc) => {
          const board = doc.web.canvases[boardId];
          roomFor(board, 1);
          let rows = doc.tables.bullets,
            ref = kind === "text" && o.noteId ? sourceId(rows, o.noteId) : undefined;
          if (kind === "text" && !ref) {
            ref = created = crypto.randomUUID();
            rows = [
              ...rows,
              bullet(ref, {
                parentId: board.rootId,
                text: o.text || "",
                position: rows.filter((n) => n.parentId === board.rootId)
                  .length,
              }),
            ];
          }
          const n = {
            id,
            type: kind,
            position: [x, y],
            size,
            order: nextCanvasOrder(board),
            ...(kind === "text"
              ? {
                  noteId: ref,
                  text: rows.find((n) => n.id === ref)?.text || "",
                  markdown: !o.noteId,
                }
              : kind === "link"
                ? { url: o.url }
                : { file: o.file }),
          };
          return changeCanvas(
            { ...doc, tables: { ...doc.tables, bullets: rows } },
            boardId,
            (b: any) => ({ ...b, nodes: { ...b.nodes, [id]: n } }),
          );
        }),
      );
      setAsk(null);
      if (kind === "text" && created && o.edit !== false) setEditingId(id);
      requestAnimationFrame(() => reveal(x, y, size[0], size[1]));
    });
  // Images (picked, pasted or dropped) become image cards: the file is stored like a bullet
  // image on its own bullet under the board, and the card refers to it.
  const addImages = async (files: File[], at?: number[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length || p.disabled) return;
    if (!p.onStoreImages) {
      setError("Images can't be added here.");
      return;
    }
    setBusy(true);
    try {
      const ready = await Promise.all(images.map(fitImage)),
        sizes = await Promise.all(ready.map(cardSize)),
        saved = await p.onStoreImages(ready);
      const placed: Rect[] = [],
        cards = saved.map((item, i) => {
          const [w, h] = sizes[i],
            spot = at ? [at[0] + i * 40, at[1] + i * 40] : undefined,
            [x, y] = place(w, h, placed, spot);
          placed.push({ x, y, w, h });
          return { item, id: crypto.randomUUID(), noteId: crypto.randomUUID(), x, y, w, h };
        });
      withSelection(
        cards.map((c) => c.id),
        () =>
          p.onChange((doc) => {
            const board = doc.web.canvases[boardId];
            roomFor(board, cards.length);
            let rows = doc.tables.bullets,
              order = nextCanvasOrder(board);
            const nodes = { ...board.nodes };
            for (const c of cards) {
              rows = [
                ...rows,
                bullet(c.noteId, {
                  parentId: board.rootId,
                  text: "",
                  position: rows.filter((n) => n.parentId === board.rootId).length,
                }),
              ];
              nodes[c.id] = {
                id: c.id,
                type: "file",
                file: c.item.fileName,
                noteId: c.noteId,
                position: [c.x, c.y],
                size: [c.w, c.h],
                order: order++,
              };
            }
            const next = {
              ...doc,
              tables: {
                ...doc.tables,
                bullets: rows,
                media: [
                  ...doc.tables.media,
                  ...cards.map((c) => ({ ...c.item, bulletId: c.noteId })),
                ],
              },
            };
            return changeCanvas(next, boardId, (b: any) => ({ ...b, nodes }));
          }),
      );
      setError("");
      const first = cards[0];
      requestAnimationFrame(() => reveal(first.x, first.y, first.w, first.h));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  // Pasted or dropped text: a web address becomes a link (videos play in place), anything else a text card.
  const addText = (value: string, at?: number[]) => {
    const v = value.trim();
    if (!v) return;
    const url = !/\s/.test(v) && /^(https?:\/\/|www\.)/i.test(v) ? normalUrl(v) : null;
    if (url && safeCanvasUrl(url)) add("link", { url, at });
    else add("text", { text: v.slice(0, 20000), at, edit: false });
  };
  // From the side panel: a note (or highlight, flashcard) becomes a live card; a bookmark a link card.
  const addSource = (item: SourceItem, at?: number[]) => {
    if (item.type === "note") add("text", { noteId: item.id, at, edit: false });
    else add("link", { url: item.url, at });
    if (window.matchMedia?.("(max-width: 700px)").matches) setPicker(false);
  };
  // A bullet laid out as a small tree: the bullet's card, its children's cards to the right, connected.
  const layoutBullet = (id: string, at?: number[]) =>
    run(() => {
      const kids = (childrenOf.get(id) || []).slice(0, 24),
        ps = [260, 120],
        cs = [260, 120],
        gap = 20,
        h = Math.max(ps[1], kids.length * (cs[1] + gap) - gap),
        w = ps[0] + 120 + cs[0],
        [x, y] = place(w, h, [], at),
        parentId = crypto.randomUUID(),
        childIds = kids.map(() => crypto.randomUUID());
      withSelection([parentId, ...childIds], () =>
        p.onChange((doc) => {
          const board = doc.web.canvases[boardId],
            rows = doc.tables.bullets;
          roomFor(board, 1 + kids.length);
          let order = nextCanvasOrder(board);
          const nodes = { ...board.nodes },
            edges = { ...board.edges },
            card = (cid: string, noteId: string, pos: number[], size: number[], compact = false) => {
              const src = sourceId(rows, noteId);
              nodes[cid] = {
                id: cid,
                type: "text",
                noteId: src,
                markdown: false,
                text: rows.find((r) => r.id === src)?.text || "",
                position: pos.map(Math.round),
                size,
                order: order++,
                ...(compact ? { compact: true } : {}),
              };
            };
          card(parentId, id, [x, y + Math.round((h - ps[1]) / 40) * 20], ps, kids.length > 0);
          kids.forEach((k, i) => {
            card(childIds[i], k.id, [x + ps[0] + 120, y + i * (cs[1] + gap)], cs);
            const eid = crypto.randomUUID();
            edges[eid] = { id: eid, fromNode: parentId, toNode: childIds[i], fromSide: "right", toSide: "left" };
          });
          return changeCanvas(doc, boardId, (b: any) => ({ ...b, nodes, edges }));
        }),
      );
      requestAnimationFrame(() => reveal(x, y, w, h));
    });
  // A group's cards (or the selected cards) become an outline: a new bullet at the end of Notes.
  const toOutline = () =>
    run(() => {
      const isGroup = card?.type === "group",
        ids = isGroup ? cardsInGroup(b, card.id) : sel,
        title = isGroup ? card.label || "Group" : canvasTitle(p.doc, b);
      let created = "";
      p.onChange((doc) => {
        const r = canvasToOutline(doc, boardId, ids, title);
        created = r.id;
        return r.doc;
      });
      setInfo({ text: `“${title}” added to Notes as an outline.`, open: created });
    });
  // Group wraps the selected cards; with nothing selected it makes an empty frame.
  const group = () =>
    run(() => {
      const chosen = sel.map((id) => b.nodes[id]).filter(Boolean) as any[];
      const id = crypto.randomUUID();
      let position: number[], size: number[];
      if (chosen.length) {
        const l = Math.min(...chosen.map((n) => n.position[0])) - 40,
          t = Math.min(...chosen.map((n) => n.position[1])) - 56,
          r = Math.max(...chosen.map((n) => n.position[0] + n.size[0])) + 40,
          d = Math.max(...chosen.map((n) => n.position[1] + n.size[1])) + 40;
        position = [l, t];
        size = [r - l, d - t];
      } else {
        size = [480, 320];
        position = place(480, 320);
      }
      withSelection([id], () =>
        edit((b) => ({
          ...b,
          nodes: {
            ...b.nodes,
            [id]: {
              id,
              type: "group",
              label: "Group",
              position: position.map(Math.round),
              size: size.map(Math.round),
              order: Math.min(
                -1,
                ...Object.values(b.nodes).map((n: any) => n.order - 1),
              ),
            },
          },
        })),
      );
      setRenamingId(id);
    });
  // Duplicates the selection 40px down and right. A card's own note (and image) is copied; a linked
  // note is shown again. Connections between duplicated cards are copied too.
  const duplicate = () => {
    if (!sel.length) return;
    run(() => {
      const map = new Map(sel.map((id) => [id, crypto.randomUUID()]));
      withSelection([...map.values()], () =>
        p.onChange((doc) => {
          const board = doc.web.canvases[boardId];
          roomFor(board, map.size);
          let rows = doc.tables.bullets,
            media = doc.tables.media,
            order = nextCanvasOrder(board);
          const nodes = { ...board.nodes },
            edges = { ...board.edges };
          for (const [from, to] of map) {
            const n = board.nodes[from];
            if (!n || n.removed) continue;
            let noteId = n.noteId;
            const row = noteId && rows.find((r) => r.id === noteId);
            if (row && row.parentId === board.rootId) {
              noteId = crypto.randomUUID();
              rows = [
                ...rows,
                bullet(noteId, {
                  parentId: board.rootId,
                  text: row.text,
                  formatting: row.formatting,
                  position: rows.filter((r) => r.parentId === board.rootId)
                    .length,
                }),
              ];
              media = [
                ...media,
                ...media
                  .filter((m: any) => m.bulletId === row.id)
                  .map((m: any) => ({ ...m, id: crypto.randomUUID(), bulletId: noteId })),
              ];
            }
            nodes[to] = {
              ...n,
              id: to,
              position: [n.position[0] + 40, n.position[1] + 40],
              order: n.type === "group" ? n.order : order++,
              ...(noteId ? { noteId } : {}),
            };
          }
          for (const e of Object.values(board.edges) as any[])
            if (!e.removed && map.has(e.fromNode) && map.has(e.toNode)) {
              const id = crypto.randomUUID();
              edges[id] = {
                ...e,
                id,
                fromNode: map.get(e.fromNode),
                toNode: map.get(e.toNode),
              };
            }
          return changeCanvas(
            { ...doc, tables: { ...doc.tables, bullets: rows, media } },
            boardId,
            (b: any) => ({ ...b, nodes, edges }),
          );
        }),
      );
    });
  };
  const removeItems = (nodeIds: string[], edgeIds: string[]) => {
    run(() =>
      p.onChange((doc) => {
        let next = nodeIds.length
          ? removeCanvasCards(doc, boardId, nodeIds)
          : doc;
        const board = next.web.canvases[boardId],
          extra = edgeIds.filter(
            (id) => board.edges[id] && !board.edges[id].removed,
          );
        if (extra.length)
          next = changeCanvas(next, boardId, (b: any) => ({
            ...b,
            edges: {
              ...b.edges,
              ...Object.fromEntries(
                extra.map((id) => [id, { ...b.edges[id], removed: true }]),
              ),
            },
          }));
        return next;
      }),
    );
    setEdgeId(null);
    setEditingId(null);
  };
  const connect = (from: string, to: string, fromSide = "right", toSide = "left") =>
    edit((b) => {
      if (
        Object.values(b.edges).filter((e: any) => !e.removed).length >=
        CANVAS_LIMITS.edges
      )
        throw Error("Connection limit reached.");
      const id = crypto.randomUUID();
      return {
        ...b,
        edges: {
          ...b.edges,
          [id]: { id, fromNode: from, toNode: to, fromSide, toSide },
        },
      };
    });
  const restack = (front: boolean) =>
    edit((b) => {
      const orders = Object.values(b.nodes).map((n: any) => n.order);
      let next = front ? Math.max(...orders) + 1 : Math.min(...orders) - 1;
      const nodes = { ...b.nodes };
      for (const id of sel)
        if (nodes[id]) nodes[id] = { ...nodes[id], order: front ? next++ : next-- };
      return { ...b, nodes };
    });
  const zoomTo = (ids: string[]) =>
    flow.fitView({ nodes: ids.map((id) => ({ id })), padding: 0.3, maxZoom: 1.5, duration: 250 });
  // Sections are the board's groups, top to bottom then left to right. Present steps through them
  // full screen (arrow keys or the bar at the bottom; Esc ends).
  const sectionList = useMemo(
    () =>
      live
        .filter((n) => n.type === "group")
        .sort((a, c) => a.position[1] - c.position[1] || a.position[0] - c.position[0]),
    [live],
  );
  const present = (i: number | null) => {
    if (i === null) {
      setPresenting(null);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      return;
    }
    if (!sectionList.length) {
      setError("Add groups to present them as sections.");
      return;
    }
    const at = Math.max(0, Math.min(sectionList.length - 1, i));
    if (presenting === null) {
      selectOnly([]);
      setSections(false);
      void workspace.current?.requestFullscreen?.().catch(() => {});
    }
    setPresenting(at);
  };
  const presentKey = presenting === null ? "" : sectionList[presenting]?.id;
  // Fit the section, and fit again once the window has settled into full screen (or is resized).
  useEffect(() => {
    if (!presentKey) return;
    const fit = (duration: number) =>
      flow.fitView({ nodes: [{ id: presentKey }], padding: 0.1, duration });
    const timers = [setTimeout(() => fit(450), 60), setTimeout(() => fit(250), 500)],
      resized = () => fit(0);
    window.addEventListener("resize", resized);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", resized);
    };
  }, [presentKey]);
  useEffect(() => {
    const left = () => {
      if (!document.fullscreenElement) setPresenting(null);
    };
    document.addEventListener("fullscreenchange", left);
    return () => document.removeEventListener("fullscreenchange", left);
  }, []);
  // AI on the selection (or a group's cards), with the app's AI service: summarize into a new card,
  // answer a question about them, or make flashcards (real flashcards, reviewed in Study Desk).
  const aiCards = () =>
    card?.type === "group" ? cardsInGroup(b, card.id) : sel;
  const aiContext = (ids: string[]) => {
    const parts: string[] = [];
    let bytes = 0;
    for (const id of ids) {
      const n = b.nodes[id];
      if (!n || n.removed || n.type === "group") continue;
      const note = n.noteId ? rowById.get(n.noteId) : undefined;
      const text =
        n.type === "text"
          ? withChildren(note?.id, canvasNoteText(note, n))
          : n.type === "link"
            ? `${bookmarkTitles.get(n.url) || ""} ${n.url}`.trim()
            : n.file || "";
      if (!text.trim()) continue;
      const size = new TextEncoder().encode(text).length + 8;
      if (bytes + size > 5800) break;
      parts.push(text);
      bytes += size;
    }
    return parts.join("\n\n---\n\n");
  };
  const runAi = async (operation: "summarize" | "answer" | "flashcards", question = "") => {
    setMenu(null);
    if (!p.user) {
      setError("Sign in to use AI on the board.");
      return;
    }
    const ids = aiCards(),
      context = aiContext(ids);
    if (!context) {
      setError("Select cards with text first.");
      return;
    }
    const chosen = ids.map((id) => b.nodes[id]).filter(Boolean) as any[],
      right = Math.max(...chosen.map((n) => n.position[0] + n.size[0])) + 80,
      top = Math.min(...chosen.map((n) => n.position[1])),
      from = card?.type === "group" ? card.id : sel.length === 1 ? sel[0] : null;
    setAiBusy(operation === "flashcards" ? "Making flashcards…" : operation === "summarize" ? "Summarizing…" : "Thinking…");
    try {
      let result: any = null;
      await aiRequest(
        p.user,
        "generate",
        {
          requestId: crypto.randomUUID(),
          operation,
          mode: "general",
          question: question.slice(0, 1000),
          context,
        },
        new AbortController().signal,
        (event) => {
          if (event.type === "done") result = validateAiResult(operation, event.result, event.sources || []);
        },
      );
      if (!result) throw Error("AI didn't return anything. Try again.");
      const items: { text: string; answer?: string }[] =
        operation === "flashcards"
          ? result.candidates.map((c: any) => ({ text: c.question, answer: c.answer }))
          : [{ text: (operation === "answer" && question ? `**${question}**\n\n` : "") + result.text }];
      const made = items.map(() => ({ id: crypto.randomUUID(), noteId: crypto.randomUUID() }));
      withSelection(
        made.map((m) => m.id),
        () =>
          p.onChange((doc) => {
            const board = doc.web.canvases[boardId];
            roomFor(board, made.length);
            let order = nextCanvasOrder(board),
              rows = [...doc.tables.bullets];
            const nodes = { ...board.nodes },
              edges = { ...board.edges },
              g = snap ? 20 : 1;
            items.forEach((item, i) => {
              const m = made[i],
                base = rows.filter((r) => r.parentId === board.rootId).length;
              rows.push(
                bullet(m.noteId, {
                  parentId: board.rootId,
                  text: item.text,
                  position: base,
                  ...(item.answer ? { kind: "QUESTION" } : {}),
                }),
              );
              if (item.answer)
                rows.push(bullet(crypto.randomUUID(), { parentId: m.noteId, text: item.answer, position: 0 }));
              nodes[m.id] = {
                id: m.id,
                type: "text",
                noteId: m.noteId,
                markdown: false,
                text: item.text,
                position: [Math.round(right / g) * g, Math.round((top + i * 200) / g) * g],
                size: item.answer ? [300, 180] : [340, 260],
                order: order++,
                color: "6",
              };
              if (from) {
                const eid = crypto.randomUUID();
                edges[eid] = { id: eid, fromNode: from, toNode: m.id, fromSide: "right", toSide: "left" };
              }
            });
            return changeCanvas(withNodes(doc, rows), boardId, (b: any) => ({ ...b, nodes, edges }));
          }),
      );
      setInfo({ text: operation === "flashcards" ? `${items.length} flashcard${items.length === 1 ? "" : "s"} added; review them in Study Desk.` : "AI card added. Check it before you rely on it." });
      setAskAi("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAiBusy("");
    }
  };
  // Image and video cards: one-click sizes that keep the shape (images) or 16:9 (videos).
  const sizable = (n: any) => (n.type === "file" && !!n.noteId) || (n.type === "link" && !!playable(n.url));
  const resizeTo = async (n: any, width: number) => {
    setMenu(null);
    let w = width,
      ratio = n.size[1] / n.size[0];
    if (n.type === "link") ratio = playable(n.url)?.kind === "spotify" ? 0.5 : 9 / 16 + 30 / Math.max(width, 1);
    if (n.type === "file") {
      const url = imageFor(n);
      if (url)
        try {
          const img = new Image();
          img.src = url;
          await img.decode();
          ratio = img.naturalHeight / img.naturalWidth;
          if (!width) w = Math.min(1600, img.naturalWidth);
        } catch {
          /* keep the current shape */
        }
      if (!w) w = n.size[0];
    }
    patch(n.id, { size: [Math.round(w), Math.max(40, Math.round(w * ratio))] });
  };
  const commitPositions = (nodes: FlowNode[]) =>
    nodes.length &&
    run(() =>
      p.onChange((doc) =>
        moveCanvasCards(
          doc,
          boardId,
          Object.fromEntries(
            nodes.map((n) => [
              n.id,
              [Math.round(n.position.x), Math.round(n.position.y)],
            ]),
          ),
        ),
      ),
    );
  // Arrow keys nudge the selection (Shift for bigger steps); a burst of nudges is saved once.
  const nudgeTimer = useRef(0);
  const nudge = (dx: number, dy: number) => {
    gesture.current = true;
    setFlowNodes((current) =>
      current.map((n) =>
        n.selected
          ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
          : n,
      ),
    );
    clearTimeout(nudgeTimer.current);
    nudgeTimer.current = window.setTimeout(() => {
      gesture.current = false;
      commitPositions(flowRef.current.filter((n) => n.selected));
    }, 400);
  };
  useEffect(() => () => clearTimeout(nudgeTimer.current), []);
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    if (presenting !== null) {
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        present(presenting + 1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        present(presenting - 1);
      } else if (e.key === "Escape") present(null);
      return;
    }
    if (p.disabled || typing(e.target)) return;
    const mod = e.metaKey || e.ctrlKey,
      key = e.key.toLowerCase();
    if (e.key === "Escape") {
      if (picker || ask || menu) {
        setPicker(false);
        setAsk(null);
        setMenu(null);
      } else selectOnly([]);
      return;
    }
    if (e.key === "Enter" && sel.length === 1 && !mod) {
      e.preventDefault();
      startEdit(sel[0]);
    } else if (mod && key === "a") {
      e.preventDefault();
      selectOnly(live.map((n) => n.id));
    } else if (mod && key === "d") {
      e.preventDefault();
      duplicate();
    } else if (!mod && sel.length && e.key.startsWith("Arrow")) {
      const step = e.shiftKey ? 50 : snap ? 20 : 10,
        move = (
          {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          } as Record<string, number[]>
        )[e.key];
      if (move) {
        e.preventDefault();
        nudge(move[0], move[1]);
      }
    }
  };
  const pasted = useRef<(e: ClipboardEvent) => void>(() => {});
  pasted.current = (e) => {
    if (p.disabled || typing(e.target) || !e.clipboardData) return;
    const files = [...e.clipboardData.files].filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length) {
      e.preventDefault();
      void addImages(files);
      return;
    }
    const text = e.clipboardData.getData("text/plain");
    if (text.trim()) {
      e.preventDefault();
      addText(text);
    }
  };
  useEffect(() => {
    const listen = (e: KeyboardEvent) => keys.current(e),
      paste = (e: ClipboardEvent) => pasted.current(e);
    document.addEventListener("keydown", listen);
    document.addEventListener("paste", paste);
    return () => {
      document.removeEventListener("keydown", listen);
      document.removeEventListener("paste", paste);
    };
  }, []);
  const dropPoint = (e: React.DragEvent) => {
    const at = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    return [at.x, at.y];
  };
  const label = (n: any) =>
    (
      rowById.get(n.noteId)?.text ||
      n.label ||
      n.file ||
      n.url ||
      "Untitled text"
    ).slice(0, 60);
  const swatches = (current: string | undefined, choose: (c: string | undefined) => void) => (
    <div className="canvas-swatches" role="menu" aria-label="Card color">
      <button
        role="menuitemradio"
        aria-checked={!current}
        aria-label="No color"
        className="canvas-swatch is-none"
        onClick={() => choose(undefined)}
      />
      {Object.entries(palette).map(([v, hex], i) => (
        <button
          key={v}
          role="menuitemradio"
          aria-checked={current === v}
          aria-label={"Color: " + colorNames[i]}
          className="canvas-swatch"
          style={{ background: hex }}
          onClick={() => choose(v)}
        />
      ))}
    </div>
  );
  const selColor = sel.length ? b.nodes[sel[0]]?.color : undefined;
  // The floating bar sits above the selection, or below it when the selection is at the top of the view.
  useViewport();
  const selTop = sel.length
      ? Math.min(...sel.map((id) => b.nodes[id]?.position[1] ?? Infinity))
      : 0,
    stageTop = stage.current?.getBoundingClientRect().top ?? 0,
    barBelow =
      sel.length > 0 &&
      Number.isFinite(selTop) &&
      flow.flowToScreenPosition({ x: 0, y: selTop }).y - stageTop < 64;
  const ownNote = !!note && note.parentId === b.rootId;
  return (
    <div
      className={"canvas-workspace" + (presenting !== null ? " is-presenting" : "")}
      ref={workspace}
    >
      {picker && (
        <CanvasSources
          doc={p.doc}
          homeId={canvasHomeId(p.doc)}
          onAdd={(item) => addSource(item)}
          onLayout={(id) => layoutBullet(id)}
          onClose={() => setPicker(false)}
        />
      )}
      {ask && (
        <form
          className="canvas-note-picker canvas-ask"
          onSubmit={(e) => {
            e.preventDefault();
            const v = askValue.trim();
            if (ask.kind === "link") {
              const url = normalUrl(v);
              if (!v || !safeCanvasUrl(url)) {
                setError("Use a complete http or https link.");
                return;
              }
              if (ask.target) {
                patch(ask.target, { url });
                setAsk(null);
              } else add("link", { url });
            } else {
              if (!v) {
                setError("A file reference needs a path.");
                return;
              }
              if (ask.target) {
                patch(ask.target, { file: v });
                setAsk(null);
              } else add("file", { file: v });
            }
            setAskValue("");
          }}
        >
          <label>
            {ask.kind === "link"
              ? "Web link (YouTube, Vimeo and Spotify play on the card)"
              : "File path (kept as written; nothing is uploaded)"}
            <input
              autoFocus
              value={askValue}
              placeholder={ask.kind === "link" ? "https://…" : "Papers/notes.pdf"}
              onChange={(e) => setAskValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setAsk(null);
              }}
            />
          </label>
          <div className="canvas-ask-actions">
            <button type="submit">{ask.target ? "Save" : "Add"}</button>
            <button type="button" onClick={() => setAsk(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <div
        className={
          "canvas-stage" +
          (busy ? " is-busy" : "") +
          (dragging || resizing ? " is-gesturing" : "")
        }
        ref={stage}
        // Pressing on a card or a resize handle switches embedded players off at once, before the
        // first move, so a drag or resize over a playing video keeps going.
        onPointerDownCapture={(e) => {
          const el = e.target as HTMLElement;
          if (!el.closest(".react-flow__resize-control, .react-flow__node")) return;
          const host = stage.current!;
          host.classList.add("is-pointer-down");
          const up = () => {
            host.classList.remove("is-pointer-down");
            window.removeEventListener("pointerup", up, true);
            window.removeEventListener("pointercancel", up, true);
          };
          window.addEventListener("pointerup", up, true);
          window.addEventListener("pointercancel", up, true);
        }}
        onDragOver={(e) => {
          if (p.disabled) return;
          const t = e.dataTransfer.types;
          if (t.includes(CANVAS_DRAG) || t.includes("Files") || t.includes("text/uri-list") || t.includes("text/plain")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(e) => {
          if (p.disabled) return;
          const internal = e.dataTransfer.getData(CANVAS_DRAG);
          if (internal) {
            e.preventDefault();
            try {
              addSource(JSON.parse(internal), dropPoint(e));
            } catch {
              /* not ours */
            }
            return;
          }
          const files = [...e.dataTransfer.files];
          const text =
            e.dataTransfer.getData("text/uri-list").split("\n").find((l) => l && !l.startsWith("#")) ||
            e.dataTransfer.getData("text/plain");
          if (!files.length && !text) return;
          e.preventDefault();
          if (files.length) void addImages(files, dropPoint(e));
          else addText(text, dropPoint(e));
        }}
      >
        <ReactFlow
          nodes={flowNodes}
          onNodesChange={handleNodeChanges}
          edges={edges}
          nodeTypes={types}
          fitView
          fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          minZoom={0.1}
          maxZoom={2}
          onlyRenderVisibleElements={live.length > 150}
          snapToGrid={snap}
          snapGrid={[20, 20]}
          zoomOnDoubleClick={false}
          nodesDraggable={!p.disabled && presenting === null}
          nodesConnectable={!p.disabled && presenting === null}
          elementsSelectable={presenting === null}
          disableKeyboardA11y
          proOptions={{ hideAttribution: true }}
          multiSelectionKeyCode={["Meta", "Control", "Shift"]}
          deleteKeyCode={p.disabled ? null : ["Delete", "Backspace"]}
          onBeforeDelete={async ({ nodes, edges }) => {
            removeItems(
              nodes.map((n) => n.id),
              edges.map((e) => e.id),
            );
            return false;
          }}
          onNodeClick={() => setEdgeId(null)}
          onEdgeClick={(_, e) => {
            selectOnly([]);
            setEdgeId(e.id);
            setMenu(null);
          }}
          onPaneClick={(e) => {
            setEdgeId(null);
            setEditingId(null);
            setMenu(null);
            // Double-click empty space: a new text card there, ready to type.
            if (e.detail === 2 && !p.disabled) {
              const at = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
              add("text", { at: [at.x, at.y] });
            }
          }}
          onNodeDragStart={() => {
            gesture.current = true;
            setDragging(true);
          }}
          onNodeDrag={(_, _node, dragged) => {
            const groups = dragged.filter(
              (n) => b.nodes[n.id]?.type === "group",
            );
            if (!groups.length) return;
            const moving = new Set(dragged.map((n) => n.id));
            setFlowNodes((current) =>
              current.map((other) => {
                const original = b.nodes[other.id];
                if (moving.has(other.id) || !original || original.removed)
                  return other;
                for (const g of groups) {
                  const stored = b.nodes[g.id];
                  if (inside(original, stored))
                    return {
                      ...other,
                      position: {
                        x: original.position[0] + g.position.x - stored.position[0],
                        y: original.position[1] + g.position.y - stored.position[1],
                      },
                    };
                }
                return other;
              }),
            );
          }}
          onNodeDragStop={(_, _node, dragged) => {
            gesture.current = false;
            setDragging(false);
            setGuides(null);
            const ids = new Set(dragged.map((n) => n.id));
            commitPositions(flowRef.current.filter((n) => ids.has(n.id)));
          }}
          onConnect={(c: Connection) =>
            connect(
              c.source,
              c.target,
              c.sourceHandle?.replace("out-", "") || "right",
              c.targetHandle?.replace("in-", "") || "left",
            )
          }
        >
          <Background gap={snap ? 20 : 24} size={1} />
          {minimap && (
            <MiniMap
              pannable
              zoomable
              ariaLabel="Canvas overview"
              nodeColor={(n: any) => (n.data?.color ? tint(n.data.color) : "var(--line)")}
              nodeStrokeWidth={2}
            />
          )}
          <Controls showInteractive={false} position="bottom-right">
            <ControlButton
              aria-label="Undo canvas change"
              title="Undo"
              disabled={p.disabled}
              onClick={() => p.onUndo(false)}
            >
              <Undo2 />
            </ControlButton>
            <ControlButton
              aria-label="Redo canvas change"
              title="Redo"
              disabled={p.disabled}
              onClick={() => p.onUndo(true)}
            >
              <Redo2 />
            </ControlButton>
            <ControlButton
              aria-label="Snap to grid"
              aria-pressed={snap}
              title={snap ? "Snap to grid: on" : "Snap to grid: off"}
              className={snap ? "is-on" : ""}
              onClick={() => {
                store("remo-canvas-snap", !snap);
                setSnap(!snap);
              }}
            >
              <Magnet />
            </ControlButton>
            <ControlButton
              aria-label="Overview map"
              aria-pressed={minimap}
              title={minimap ? "Hide overview map" : "Show overview map"}
              className={minimap ? "is-on" : ""}
              onClick={() => {
                store("remo-canvas-minimap", !minimap);
                setMinimap(!minimap);
              }}
            >
              <MapIcon />
            </ControlButton>
          </Controls>
          {guides && (
            <ViewportPortal>
              {guides.x !== undefined && (
                <div
                  className="canvas-guide is-v"
                  style={{ left: guides.x, top: (guides.box?.[0] ?? 0) - 24, height: (guides.box?.[1] ?? 0) - (guides.box?.[0] ?? 0) + 48 }}
                />
              )}
              {guides.y !== undefined && (
                <div
                  className="canvas-guide is-h"
                  style={{ top: guides.y, left: (guides.box?.[2] ?? 0) - 24, width: (guides.box?.[3] ?? 0) - (guides.box?.[2] ?? 0) + 48 }}
                />
              )}
            </ViewportPortal>
          )}
          <NodeToolbar
            nodeId={sel}
            isVisible={sel.length > 0 && !dragging && !p.disabled}
            position={barBelow ? Position.Bottom : Position.Top}
            offset={12}
          >
            <div className="canvas-selbar" role="toolbar" aria-label="Selected cards">
              <button aria-label="Remove" title="Remove (Delete)" onClick={() => removeItems(sel, [])}>
                <Trash2 size={16} />
              </button>
              <div className="canvas-selbar-menu">
                <button
                  aria-label="Color"
                  title="Color"
                  aria-expanded={menu === "color"}
                  onClick={() => setMenu(menu === "color" ? null : "color")}
                >
                  <Palette size={16} />
                  {selColor && <i className="canvas-dot" style={{ background: tint(selColor) }} />}
                </button>
                {menu === "color" &&
                  swatches(selColor, (c) => {
                    patchMany(sel, { color: c });
                    setMenu(null);
                  })}
              </div>
              {card && !(card.type === "file" && card.noteId) && (
                <button
                  aria-label={card.type === "group" ? "Rename group" : card.type === "link" ? "Edit link" : "Edit"}
                  title={card.type === "group" ? "Rename" : "Edit (Enter)"}
                  onClick={() => startEdit(card.id)}
                >
                  <Pencil size={16} />
                </button>
              )}
              {card && sizable(card) && (
                <div className="canvas-selbar-menu">
                  <button
                    aria-label="Size"
                    title="Size"
                    aria-expanded={menu === "size"}
                    onClick={() => setMenu(menu === "size" ? null : "size")}
                  >
                    <Scaling size={16} />
                  </button>
                  {menu === "size" && (
                    <div className="canvas-more canvas-sizes" role="menu" aria-label="Card size">
                      {(
                        [
                          ["Small", 240],
                          ["Medium", 400],
                          ["Large", 640],
                          ["Extra large", 960],
                        ] as [string, number][]
                      ).map(([name, w]) => (
                        <button key={name} role="menuitem" onClick={() => resizeTo(card, w)}>
                          {name}
                          <kbd>{w}px</kbd>
                        </button>
                      ))}
                      {card.type === "file" && (
                        <button role="menuitem" onClick={() => resizeTo(card, 0)}>
                          Original size
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {sel.length > 1 && (
                <button aria-label="Group" title="Put these cards in a group" onClick={group}>
                  <GroupIcon size={16} />
                </button>
              )}
              {(card?.type === "group" || sel.length > 1) && (
                <button aria-label="Turn into outline" title="Turn into an outline in Notes" onClick={toOutline}>
                  <ListTree size={16} />
                </button>
              )}
              <button aria-label="Zoom to selection" title="Zoom to selection" onClick={() => zoomTo(sel)}>
                <Focus size={16} />
              </button>
              {card?.type === "text" && note && (
                <button aria-label="Open in Notes" title="Open in Notes" onClick={() => p.onOpenNote(note.id)}>
                  <ExternalLink size={16} />
                </button>
              )}
              <div className="canvas-selbar-menu">
                <button
                  aria-label="AI"
                  title="AI: summarize, ask or make flashcards"
                  aria-expanded={menu === "ai"}
                  disabled={!!aiBusy}
                  onClick={() => setMenu(menu === "ai" ? null : "ai")}
                >
                  <Sparkles size={16} />
                </button>
                {menu === "ai" && (
                  <div className="canvas-more canvas-ai" role="menu" aria-label="AI">
                    {!p.user && <small>Sign in to use AI on the board.</small>}
                    <button role="menuitem" disabled={!p.user} onClick={() => void runAi("summarize")}>
                      Summarize into a card
                    </button>
                    <button role="menuitem" disabled={!p.user} onClick={() => void runAi("flashcards")}>
                      Make flashcards
                    </button>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (askAi.trim()) void runAi("answer", askAi.trim());
                      }}
                    >
                      <input
                        aria-label="Ask about these cards"
                        placeholder="Ask about these cards…"
                        value={askAi}
                        disabled={!p.user}
                        onChange={(e) => setAskAi(e.target.value)}
                      />
                      <button type="submit" disabled={!p.user || !askAi.trim()}>
                        Ask
                      </button>
                    </form>
                    <small>Uses the cards' text. AI can be wrong; check what it adds.</small>
                  </div>
                )}
              </div>
              <div className="canvas-selbar-menu">
                <button
                  aria-label="More actions"
                  title="More"
                  aria-expanded={menu === "more"}
                  onClick={() => setMenu(menu === "more" ? null : "more")}
                >
                  <Ellipsis size={16} />
                </button>
                {menu === "more" && (
                  <div className="canvas-more" role="menu">
                    <button role="menuitem" onClick={() => { setMenu(null); duplicate(); }}>
                      <Copy size={14} /> Duplicate <kbd>⌘D</kbd>
                    </button>
                    <button role="menuitem" onClick={() => { setMenu(null); restack(true); }}>
                      Bring to front
                    </button>
                    <button role="menuitem" onClick={() => { setMenu(null); restack(false); }}>
                      Send to back
                    </button>
                    {card && (
                      <label>
                        <span>
                          <ArrowRight size={14} /> Connect to
                        </span>
                        <select
                          aria-label="Connect to"
                          defaultValue=""
                          onChange={(e) => {
                            const target = e.target.value;
                            setMenu(null);
                            if (target) connect(card.id, target);
                          }}
                        >
                          <option value="">Choose a card…</option>
                          {live
                            .filter((n) => n.id !== card.id)
                            .map((n) => (
                              <option key={n.id} value={n.id}>
                                {label(n)}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    {card?.noteId && (
                      <small>
                        {ownNote || card.type === "file"
                          ? "Removing this card moves its note to Trash. Undo brings it back."
                          : "Removing this card leaves the linked note in Notes."}
                      </small>
                    )}
                  </div>
                )}
              </div>
            </div>
          </NodeToolbar>
        </ReactFlow>
        {edge && !p.disabled && (
          <div className="canvas-selbar canvas-edgebar" role="toolbar" aria-label="Selected connection">
            <button aria-label="Remove connection" title="Remove (Delete)" onClick={() => removeItems([], [edge.id])}>
              <Trash2 size={16} />
            </button>
            <div className="canvas-selbar-menu">
              <button
                aria-label="Connection color"
                aria-expanded={menu === "edge-color"}
                onClick={() => setMenu(menu === "edge-color" ? null : "edge-color")}
              >
                <Palette size={16} />
              </button>
              {menu === "edge-color" &&
                swatches(edge.color, (c) => {
                  patchEdge(edge.id, { color: c });
                  setMenu(null);
                })}
            </div>
            <input
              key={edge.id + (edge.label || "")}
              aria-label="Connection label"
              placeholder="Label"
              defaultValue={edge.label || ""}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              onBlur={(e) => {
                if (e.target.value !== (edge.label || ""))
                  patchEdge(edge.id, { label: e.target.value || undefined });
              }}
            />
            <button
              aria-label="Arrow"
              aria-pressed={edge.toEnd !== "none"}
              title={edge.toEnd !== "none" ? "Hide arrow" : "Show arrow"}
              className={edge.toEnd !== "none" ? "is-on" : ""}
              onClick={() => patchEdge(edge.id, { toEnd: edge.toEnd === "none" ? "arrow" : "none" })}
            >
              <ArrowRight size={16} />
            </button>
          </div>
        )}
        <div className="canvas-dock" role="toolbar" aria-label="Add to canvas">
          <button disabled={p.disabled} aria-label="Add text card" title="Text card (or double-click the board)" onClick={() => add("text")}>
            <Type size={18} />
          </button>
          <button
            disabled={p.disabled}
            aria-label="Add from Notes and library"
            title="Notes, highlights, flashcards and bookmarks"
            aria-pressed={picker}
            onClick={() => {
              setAsk(null);
              setPicker(!picker);
            }}
          >
            <Library size={18} />
          </button>
          <button
            disabled={p.disabled || busy}
            aria-label="Add image"
            title="Image (or paste / drop one)"
            onClick={() => imageInput.current?.click()}
          >
            <ImagePlus size={18} />
          </button>
          <button
            disabled={p.disabled}
            aria-label="Add web link"
            title="Web link or video"
            onClick={() => {
              setPicker(false);
              setAskValue("");
              setAsk(ask?.kind === "link" && !ask.target ? null : { kind: "link" });
            }}
          >
            <LinkIcon size={18} />
          </button>
          <button
            disabled={p.disabled}
            aria-label="Add group"
            title={sel.length ? "Group the selected cards" : "Group"}
            onClick={group}
          >
            <SquareDashed size={18} />
          </button>
          <button
            disabled={p.disabled}
            aria-label="Add file reference"
            title="File reference"
            onClick={() => {
              setPicker(false);
              setAskValue("");
              setAsk(ask?.kind === "file" && !ask.target ? null : { kind: "file" });
            }}
          >
            <FileText size={18} />
          </button>
          <span className="canvas-dock-divider" aria-hidden="true" />
          <button
            aria-label="Sections and presenting"
            title="Sections (your groups) and Present"
            aria-pressed={sections}
            onClick={() => setSections(!sections)}
          >
            <Presentation size={18} />
          </button>
        </div>
        {sections && (
          <div className="canvas-sections" role="dialog" aria-label="Sections">
            <header>
              <strong>Sections</strong>
              <button className="canvas-sources-close" aria-label="Close sections" onClick={() => setSections(false)}>
                ×
              </button>
            </header>
            {sectionList.length ? (
              <ol>
                {sectionList.map((g, i) => (
                  <li key={g.id}>
                    <button onClick={() => zoomTo([g.id])}>
                      <span>{i + 1}</span>
                      {g.label || "Group"}
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p>Groups are your sections. Add a group around some cards to jump to it here and present it.</p>
            )}
            <button className="canvas-present-start" disabled={!sectionList.length} onClick={() => present(0)}>
              <Presentation size={15} /> Present
            </button>
          </div>
        )}
        {presenting !== null && (
          <div className="canvas-present-bar" role="toolbar" aria-label="Presenting">
            <button aria-label="Previous section" disabled={presenting === 0} onClick={() => present(presenting - 1)}>
              <ChevronLeft size={18} />
            </button>
            <span>
              {presenting + 1} / {sectionList.length} · {sectionList[presenting]?.label || "Group"}
            </span>
            <button
              aria-label="Next section"
              disabled={presenting >= sectionList.length - 1}
              onClick={() => present(presenting + 1)}
            >
              <ChevronRight size={18} />
            </button>
            <button className="canvas-present-exit" onClick={() => present(null)}>
              Exit
            </button>
          </div>
        )}
        {aiBusy && (
          <div className="canvas-busy" role="status">
            {aiBusy}
          </div>
        )}
        <input
          ref={imageInput}
          hidden
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            const files = [...(e.target.files || [])];
            e.target.value = "";
            void addImages(files);
          }}
        />
        {busy && (
          <div className="canvas-busy" role="status">
            Adding image…
          </div>
        )}
      </div>
      {info && (
        <div className="canvas-error canvas-info" role="status">
          {info.text}
          {info.open && (
            <button onClick={() => p.onOpenNote(info.open!)}>Open in Notes</button>
          )}
          <button onClick={() => setInfo(null)}>Dismiss</button>
        </div>
      )}
      {error && (
        <div className="canvas-error" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
// The board's real layout in miniature: each card as a rectangle in its colour.
function Thumbnail({ board }: { board: any }) {
  const cards = Object.values(board.nodes).filter((n: any) => !n.removed) as any[];
  if (!cards.length)
    return <div className="canvas-thumbnail is-empty" aria-hidden="true" />;
  const l = Math.min(...cards.map((n) => n.position[0])),
    t = Math.min(...cards.map((n) => n.position[1])),
    r = Math.max(...cards.map((n) => n.position[0] + n.size[0])),
    d = Math.max(...cards.map((n) => n.position[1] + n.size[1])),
    pad = Math.max(r - l, d - t) * 0.06;
  return (
    <svg
      className="canvas-thumbnail"
      aria-hidden="true"
      viewBox={`${l - pad} ${t - pad} ${r - l + 2 * pad} ${d - t + 2 * pad}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {cards
        .sort((a, b) => a.order - b.order)
        .slice(0, 200)
        .map((n) => (
          <rect
            key={n.id}
            x={n.position[0]}
            y={n.position[1]}
            width={n.size[0]}
            height={n.size[1]}
            rx={Math.min(n.size[0], n.size[1]) * 0.06}
            className={n.type === "group" ? "is-group" : ""}
            style={{ stroke: tint(n.color), fill: n.color ? tint(n.color) : undefined }}
            vectorEffect="non-scaling-stroke"
          />
        ))}
    </svg>
  );
}
const LAST = "remo-canvas-last";
export default function CanvasStudio(p: Props) {
  // The board you had open last opens again.
  const [active, setActiveState] = useState<string | null>(() => {
      try {
        const id = localStorage.getItem(LAST);
        return id && p.doc.web.canvases?.[id] && !p.doc.web.canvases[id].removed ? id : null;
      } catch {
        return null;
      }
    }),
    setActive = (id: string | null) => {
      setActiveState(id);
      try {
        if (id) localStorage.setItem(LAST, id);
        else localStorage.removeItem(LAST);
      } catch {
        /* storage unavailable */
      }
    },
    [copied, setCopied] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    input = useRef<HTMLInputElement>(null);
  const boards = canvasBoards(p.doc),
    board = active ? p.doc.web.canvases?.[active] : null,
    title = board ? canvasTitle(p.doc, board) : "",
    [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [active]);
  useEffect(() => {
    if (p.open && p.doc.web.canvases?.[p.open.id] && !p.doc.web.canvases[p.open.id].removed)
      setActive(p.open.id);
  }, [p.open?.n]);
  // A link to this board for any note: [[Title|board bullet]]; the board's bullet offers "Open canvas".
  const copyLink = async () => {
    if (!board) return;
    try {
      await navigator.clipboard.writeText(`[[${title.replace(/[\[\]|\n]/g, " ")}|${board.rootId}]]`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copying isn't allowed here.");
    }
  };
  // Boards made before the "Canvases" bullet existed are filed under it once.
  const looseRoots = Object.values(p.doc.web.canvases || {}).some(
    (b: any) =>
      p.doc.tables.bullets.find((r) => r.id === b.rootId)?.parentId === null,
  );
  useEffect(() => {
    if (!looseRoots || p.disabled) return;
    try {
      p.onChange((doc) => adoptCanvasRoots(doc));
    } catch {
      /* tried again next time Canvas opens */
    }
  }, [looseRoots, p.disabled]);
  const saveTitle = () => {
    if (draft === null || !active) return;
    const next = draft.trim() || "Untitled canvas";
    setDraft(null);
    if (next === title) return;
    try {
      p.onChange((doc) => renameCanvas(doc, active, next));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const create = (title: string, parsed?: any) => {
    try {
      let id = "";
      p.onChange((doc) => {
        const result = createCanvas(doc, title, parsed);
        id = result.id;
        return result.doc;
      });
      setActive(id);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const saveFile = () => {
    try {
      const json = JSON.stringify(exportCanvas(p.doc, active!), null, 2),
        url = URL.createObjectURL(
          new Blob([json], { type: "application/json" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download =
        (title.replace(/[^\w -]/g, "").trim() || "Untitled") + ".canvas";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="canvas-page">
      <header className="canvas-header">
        <div>
          <small>CANVAS · WEB PREVIEW</small>
          {board && !board.removed ? (
            <input
              aria-label="Canvas title"
              disabled={p.disabled}
              value={draft ?? title}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setDraft(null);
                  e.currentTarget.blur();
                }
              }}
            />
          ) : (
            <>
              <h1>Room for connections.</h1>
              <p>
                Arrange thoughts, link your notes, and see the bigger picture.
              </p>
            </>
          )}
        </div>
        <div className="canvas-header-actions">
          {board && !board.removed ? (
            <>
              <button onClick={() => setActive(null)}>All canvases</button>
              <button className="canvas-export" onClick={saveFile}>Export .canvas</button>
              <details className="canvas-options">
                <summary aria-label="Canvas options">⋯</summary>
                <div className="canvas-options-menu">
                  <button onClick={saveFile}>Export as .canvas file</button>
                  <button onClick={copyLink}>{copied ? "Link copied: paste it in a note" : "Copy link for notes"}</button>
                  <button
                    disabled={p.disabled}
                    onClick={() => {
                      p.onChange((doc) =>
                        changeCanvas(doc, active!, (b: any) => ({
                          ...b,
                          removed: true,
                        })),
                      );
                      setActive(null);
                    }}
                  >
                    Archive canvas
                  </button>
                </div>
              </details>
            </>
          ) : (
            <>
              <button
                disabled={p.disabled}
                onClick={() => input.current?.click()}
              >
                Import .canvas
              </button>
              <button
                disabled={p.disabled}
                onClick={() => create("Untitled canvas")}
              >
                ＋ New canvas
              </button>
            </>
          )}
        </div>
        <input
          ref={input}
          hidden
          type="file"
          accept=".canvas,application/json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              if (file.size > CANVAS_LIMITS.bytes)
                throw Error("Canvas files can be up to 2 MiB.");
              const data = parseCanvas(await file.text());
              create(file.name.replace(/\.canvas$/i, ""), data);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      </header>
      {error && <p role="alert">{error}</p>}
      {board && !board.removed ? (
        <ReactFlowProvider key={active}>
          <Editor {...p} boardId={active!} />
        </ReactFlowProvider>
      ) : (
        <div className="canvas-library">
          <label>
            Find a canvas
            <input
              placeholder="Search canvases…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="canvas-board-grid">
            {boards
              .filter((b: any) =>
                canvasTitle(p.doc, b)
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((b: any) => (
                <button
                  className="canvas-board"
                  key={b.id}
                  onClick={() => setActive(b.id)}
                >
                  <Thumbnail board={b} />
                  <strong>{canvasTitle(p.doc, b)}</strong>
                  <small>
                    {
                      Object.values(b.nodes).filter((n: any) => !n.removed)
                        .length
                    }{" "}
                    cards
                  </small>
                </button>
              ))}
          </div>
          {Object.values(p.doc.web.canvases || {}).some(
            (b: any) => b.removed && !b.purged,
          ) && (
            <details className="canvas-archived">
              <summary>Archived canvases · notes are preserved</summary>
              {Object.values(p.doc.web.canvases)
                .filter((b: any) => b.removed && !b.purged)
                .map((b: any) => (
                  <p key={b.id}>
                    {canvasTitle(p.doc, b)}{" "}
                    <button
                      disabled={p.disabled}
                      onClick={() =>
                        p.onChange((doc) => ({
                          ...doc,
                          web: {
                            ...doc.web,
                            canvases: {
                              ...doc.web.canvases,
                              [b.id]: {
                                ...doc.web.canvases[b.id],
                                removed: false,
                              },
                            },
                          },
                        }))
                      }
                    >
                      Restore
                    </button>{" "}
                    <button
                      className="canvas-delete"
                      disabled={p.disabled}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Delete “${canvasTitle(p.doc, b)}” for good? Its notes and images move to Trash; the layout can't be restored (Undo works until you leave).`,
                          )
                        )
                          return;
                        try {
                          p.onChange((doc) => purgeCanvas(doc, b.id));
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Delete for good
                    </button>
                  </p>
                ))}
            </details>
          )}
          {!boards.length && (
            <div className="canvas-empty">
              <h2>A thought doesn’t have to stay in a line.</h2>
              <p>
                Create your first canvas, add a text card or link an existing
                note, then drag handles to connect ideas.
              </p>
              <p>
                Imports and exports use the open JSON Canvas 1.0 format. File
                references keep their original paths; external files are not
                uploaded or fetched.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
