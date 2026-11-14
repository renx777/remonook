import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  applyNodeChanges,
  type NodeChange,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  NodeResizer,
  MarkerType,
  useReactFlow,
  type NodeProps,
  type Node as FlowNode,
  type Edge as FlowEdge,
  type Connection,
} from "@xyflow/react";
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
} from "./json-canvas.mjs";
import { bullet } from "./domain.mjs";
import { sourceId } from "./relations.mjs";
import { NoteField } from "./ReaderBookNotes";
import type { Workspace, Node } from "./data";
import "./canvas.css";
type Props = {
  doc: Workspace;
  disabled: boolean;
  onChange: (update: (doc: Workspace) => Workspace) => void;
  onText: (id: string, value: { text: string; formatting: string }) => void;
  readCurrentNode: (id: string) => Node | undefined;
  onUndo: (redo: boolean) => void;
  onOpenNote: (id: string) => void;
};
const palette: Record<string, string> = {
  "1": "#d97878",
  "2": "#d99b69",
  "3": "#c6af60",
  "4": "#74ae86",
  "5": "#70abbc",
  "6": "#ac8bc8",
};
const tint = (color?: string) =>
  color ? palette[color] || color : "var(--line)";
const types = {
  card: memo(function CanvasCard({ data, selected }: NodeProps) {
    const d = data as any;
    return (
      <div
        tabIndex={0}
        aria-label={d.kind === "text" ? "Edit text card" : d.kind + " card"}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target === e.currentTarget) {
            e.preventDefault();
            d.select();
          }
        }}
        className={"canvas-card " + (d.kind === "group" ? "canvas-group" : "")}
        style={{ borderColor: tint(d.color) }}
      >
        <NodeResizer
          isVisible={selected && !d.disabled}
          minWidth={120}
          minHeight={80}
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
                d.html || '<span class="canvas-muted">Select to write…</span>',
            }}
          />
        ) : d.kind === "link" ? (
          <>
            <small>WEB LINK</small>
            <p>{d.url}</p>
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
            <small>FILE REFERENCE</small>
            <p>
              {d.file}
              {d.subpath}
            </p>
            <span className="canvas-muted">
              External file · path preserved in export
            </span>
          </>
        ) : (
          <strong>{d.label || "Group"}</strong>
        )}
        {d.missing && (
          <small className="canvas-missing">
            Source note unavailable · preserved text
          </small>
        )}
      </div>
    );
  }),
};
type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
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
function Editor({ boardId, ...p }: Props & { boardId: string }) {
  const b = p.doc.web.canvases?.[boardId],
    flow = useReactFlow(),
    stage = useRef<HTMLDivElement>(null),
    [edgeId, setEdgeId] = useState<string | null>(null),
    [picker, setPicker] = useState(false),
    [ask, setAsk] = useState<null | "link" | "file">(null),
    [askValue, setAskValue] = useState(""),
    [filter, setFilter] = useState(""),
    [error, setError] = useState("");
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
  // While a drag, resize or nudge is under way, positions stay local; the finished move is saved once.
  const gesture = useRef(false),
    pendingSelect = useRef<string[] | null>(null),
    justAdded = useRef<string | null>(null);
  const projected = useMemo(
    () =>
      Object.values(b.nodes)
        .filter((n: any) => !n.removed)
        .map((n: any) => {
          const current = rowById.get(n.noteId),
            note = current && !current.deleted ? current : undefined;
          const text = canvasNoteText(
            note || (n.noteId ? trashedBullet(p.doc, n.noteId) : undefined),
            n,
          );
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
              select: () => selectOnly([n.id]),
              html: n.type === "text" ? renderMarkdown(n.id, text) : "",
              beginResize: () => {
                gesture.current = true;
              },
              resize: (v: any) => {
                gesture.current = false;
                patchRef.current(n.id, {
                  position: [Math.round(v.x), Math.round(v.y)],
                  size: [Math.round(v.width), Math.round(v.height)],
                });
              },
            },
          };
        }),
    [b.nodes, rowById, p.doc.tables.trash, p.disabled],
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
  const handleNodeChanges = (changes: NodeChange<FlowNode>[]) =>
    setFlowNodes((current) => applyNodeChanges<FlowNode>(changes, current));
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
  const live = Object.values(b.nodes).filter((n: any) => !n.removed) as any[];
  const edges: FlowEdge[] = Object.values(b.edges)
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
      style: { stroke: tint(e.color) },
      markerStart:
        e.fromEnd === "arrow" ? { type: MarkerType.ArrowClosed } : undefined,
      markerEnd:
        e.toEnd !== "none" ? { type: MarkerType.ArrowClosed } : undefined,
    }));
  const card = sel.length === 1 ? b.nodes[sel[0]] : null,
    note = card?.noteId
      ? p.doc.tables.bullets.find((n) => n.id === card.noteId && !n.deleted)
      : null,
    ownNote = !!note && note.parentId === b.rootId,
    cardId = card?.id;
  // Only a card just made puts the cursor in its editor; selecting an existing card keeps the
  // keyboard on the board (Delete, ⌘D, arrows).
  useEffect(() => {
    if (cardId && justAdded.current !== b.nodes[cardId]?.noteId) justAdded.current = null;
  }, [cardId]);
  const edge = edgeId && !sel.length ? b.edges[edgeId] : null;
  // New cards go beside the selected card, or in the middle of the view, moved on until they
  // overlap nothing. The view only moves if the new card would be out of sight.
  const place = (w: number, h: number) => {
    const near = sel
      .map((id) => b.nodes[id])
      .filter((n: any) => n && n.type !== "group")
      .pop() as any;
    let x: number, y: number;
    if (near) {
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
    const others = live
      .filter((n) => n.type !== "group")
      .map((n) => ({
        x: n.position[0],
        y: n.position[1],
        w: n.size[0],
        h: n.size[1],
      }));
    const free = (cx: number, cy: number) =>
      !others.some((o) => overlaps({ x: cx, y: cy, w, h }, o));
    if (near) {
      for (let i = 0; i < 80 && !free(x, y); i++) y += 40;
    } else if (!free(x, y)) {
      // The nearest free spot to the middle of the view, on a 40px grid.
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
    return [Math.round(x), Math.round(y)];
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
  const add = (kind: "text" | "link" | "file", value?: string) =>
    run(() => {
      const id = crypto.randomUUID(),
        size = kind === "text" ? [280, 180] : [280, 120],
        [x, y] = place(size[0], size[1]);
      withSelection([id], () =>
        p.onChange((doc) => {
          const board = doc.web.canvases[boardId];
          if (
            Object.values(board.nodes).filter((n: any) => !n.removed).length >=
            CANVAS_LIMITS.nodes
          )
            throw Error("This canvas has reached 400 cards.");
          let rows = doc.tables.bullets,
            ref = kind === "text" && value ? sourceId(rows, value) : undefined;
          if (kind === "text" && !ref) {
            ref = crypto.randomUUID();
            justAdded.current = ref;
            rows = [
              ...rows,
              bullet(ref, {
                parentId: board.rootId,
                text: "",
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
                  markdown: !value,
                }
              : kind === "link"
                ? { url: value }
                : { file: value }),
          };
          return changeCanvas(
            { ...doc, tables: { ...doc.tables, bullets: rows } },
            boardId,
            (b: any) => ({ ...b, nodes: { ...b.nodes, [id]: n } }),
          );
        }),
      );
      setPicker(false);
      setAsk(null);
      requestAnimationFrame(() => reveal(x, y, size[0], size[1]));
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
    });
  // Duplicates the selection 40px down and right. A card's own note is copied; a linked note is
  // shown again. Connections between duplicated cards are copied too.
  const duplicate = () => {
    if (!sel.length) return;
    run(() => {
      const map = new Map(sel.map((id) => [id, crypto.randomUUID()]));
      withSelection([...map.values()], () =>
        p.onChange((doc) => {
          const board = doc.web.canvases[boardId];
          if (
            Object.values(board.nodes).filter((n: any) => !n.removed).length +
              map.size >
            CANVAS_LIMITS.nodes
          )
            throw Error("This canvas has reached 400 cards.");
          let rows = doc.tables.bullets,
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
            { ...doc, tables: { ...doc.tables, bullets: rows } },
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
    if (p.disabled || typing(e.target)) return;
    const mod = e.metaKey || e.ctrlKey,
      key = e.key.toLowerCase();
    if (e.key === "Escape") {
      if (picker || ask) {
        setPicker(false);
        setAsk(null);
      } else selectOnly([]);
      return;
    }
    if (mod && key === "a") {
      e.preventDefault();
      selectOnly(live.map((n) => n.id));
    } else if (mod && key === "d") {
      e.preventDefault();
      duplicate();
    } else if (!mod && sel.length && e.key.startsWith("Arrow")) {
      const step = e.shiftKey ? 50 : 10,
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
  useEffect(() => {
    const listen = (e: KeyboardEvent) => keys.current(e);
    document.addEventListener("keydown", listen);
    return () => document.removeEventListener("keydown", listen);
  }, []);
  const label = (n: any) =>
    (
      rowById.get(n.noteId)?.text ||
      n.label ||
      n.file ||
      n.url ||
      "Untitled text"
    ).slice(0, 60);
  return (
    <div className="canvas-workspace">
      <div className="canvas-tools" role="toolbar" aria-label="Canvas tools">
        <button
          disabled={p.disabled}
          aria-label="Undo canvas change"
          title="Undo"
          onClick={() => p.onUndo(false)}
        >
          ↶
        </button>
        <button
          disabled={p.disabled}
          aria-label="Redo canvas change"
          title="Redo"
          onClick={() => p.onUndo(true)}
        >
          ↷
        </button>
        <button disabled={p.disabled} onClick={() => add("text")}>
          ＋ Text
        </button>
        <button
          disabled={p.disabled}
          onClick={() => {
            setAsk(null);
            setPicker(!picker);
          }}
        >
          Link note
        </button>
        <button
          disabled={p.disabled}
          title={
            sel.length ? "Put the selected cards in a group" : "Add an empty group"
          }
          onClick={group}
        >
          Group
        </button>
        <button
          disabled={p.disabled}
          onClick={() => {
            setPicker(false);
            setAskValue("");
            setAsk(ask === "link" ? null : "link");
          }}
        >
          URL
        </button>
        <button
          disabled={p.disabled}
          onClick={() => {
            setPicker(false);
            setAskValue("");
            setAsk(ask === "file" ? null : "file");
          }}
        >
          File reference
        </button>
        <span>
          Shift-click or Shift-drag to select several · Delete removes · ⌘D
          duplicates · arrows nudge
        </span>
      </div>
      {picker && (
        <div className="canvas-note-picker">
          <label>
            Find an existing note
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setPicker(false);
              }}
            />
          </label>
          {p.doc.tables.bullets
            .filter(
              (n) =>
                !n.deleted &&
                n.text &&
                n.text.toLowerCase().includes(filter.toLowerCase()),
            )
            .slice(0, 30)
            .map((n) => (
              <button key={n.id} onClick={() => add("text", n.id)}>
                {n.text.slice(0, 100)}
              </button>
            ))}
          <button onClick={() => setPicker(false)}>Cancel</button>
        </div>
      )}
      {ask && (
        <form
          className="canvas-note-picker canvas-ask"
          onSubmit={(e) => {
            e.preventDefault();
            const v = askValue.trim();
            if (ask === "link") {
              const url = normalUrl(v);
              if (!v || !safeCanvasUrl(url)) {
                setError("Use a complete http or https link.");
                return;
              }
              add("link", url);
            } else {
              if (!v) {
                setError("A file reference needs a path.");
                return;
              }
              add("file", v);
            }
            setAskValue("");
          }}
        >
          <label>
            {ask === "link"
              ? "Web link"
              : "File path (kept as written; nothing is uploaded)"}
            <input
              autoFocus
              value={askValue}
              placeholder={ask === "link" ? "https://…" : "Papers/notes.pdf"}
              onChange={(e) => setAskValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setAsk(null);
              }}
            />
          </label>
          <div className="canvas-ask-actions">
            <button type="submit">Add</button>
            <button type="button" onClick={() => setAsk(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="canvas-stage" ref={stage}>
        <ReactFlow
          nodes={flowNodes}
          onNodesChange={handleNodeChanges}
          edges={edges}
          nodeTypes={types}
          fitView
          fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          minZoom={0.1}
          maxZoom={2}
          nodesDraggable={!p.disabled}
          nodesConnectable={!p.disabled}
          elementsSelectable
          disableKeyboardA11y
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
          }}
          onPaneClick={() => setEdgeId(null)}
          onNodeDragStart={() => {
            gesture.current = true;
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
            commitPositions(dragged);
          }}
          onConnect={(c: Connection) =>
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
                  [id]: {
                    id,
                    fromNode: c.source,
                    toNode: c.target,
                    fromSide: c.sourceHandle?.replace("out-", "") || "right",
                    toSide: c.targetHandle?.replace("in-", "") || "left",
                  },
                },
              };
            })
          }
        >
          <Background gap={24} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {sel.length > 1 && (
        <aside className="canvas-inspector" aria-label="Selected canvas items">
          <header>
            <strong>{sel.length} cards selected</strong>
            <button aria-label="Clear selection" onClick={() => selectOnly([])}>
              ×
            </button>
          </header>
          <button disabled={p.disabled} onClick={group}>
            Group these cards
          </button>
          <button disabled={p.disabled} onClick={duplicate}>
            Duplicate
          </button>
          <button disabled={p.disabled} onClick={() => removeItems(sel, [])}>
            Remove {sel.length} cards
          </button>
          <small>
            Cards made on this canvas move their notes to Trash; linked notes
            stay in Notes. Undo restores everything.
          </small>
        </aside>
      )}
      {(card || edge) && (
        <aside
          className="canvas-inspector"
          aria-label="Selected canvas item"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              (document.activeElement as HTMLElement | null)?.blur();
            }
          }}
        >
          <header>
            <strong>
              {card
                ? card.type === "text"
                  ? "Note"
                  : card.type === "group"
                    ? "Group"
                    : card.type === "file"
                      ? "File reference"
                      : "Web link"
                : "Connection"}
            </strong>
            <button
              aria-label="Close inspector"
              onClick={() => selectOnly([])}
            >
              ×
            </button>
          </header>
          {card?.type === "text" &&
            (note ? (
              <>
                <NoteField
                  key={note.id}
                  node={note as Node}
                  disabled={p.disabled}
                  onText={p.onText}
                  readCurrentNode={p.readCurrentNode}
                  onReady={() => {}}
                  onUndo={p.onUndo}
                  label="Edit canvas note"
                  autoFocus={justAdded.current === note.id}
                />
                <button onClick={() => p.onOpenNote(note.id)}>
                  Open in Notes ↗
                </button>
              </>
            ) : (
              <>
                <p>
                  Source note unavailable (restore it from Trash to edit it
                  again). Its last known text is shown below.
                </p>
                <textarea
                  readOnly
                  value={canvasNoteText(
                    card.noteId ? trashedBullet(p.doc, card.noteId) : undefined,
                    card,
                  )}
                />
              </>
            ))}
          {card && ["link", "file", "group"].includes(card.type) && (
            <label>
              {card.type === "link"
                ? "URL"
                : card.type === "file"
                  ? "File path"
                  : "Group label"}
              <input
                key={card.id}
                disabled={p.disabled}
                defaultValue={card.url ?? card.file ?? card.label ?? ""}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                onBlur={(e) => {
                  const field =
                    card.type === "link"
                      ? "url"
                      : card.type === "file"
                        ? "file"
                        : "label";
                  let value = e.target.value;
                  if (card.type === "link") value = normalUrl(value);
                  if (value === (card[field] ?? "")) return;
                  if (card.type === "file" && !value.trim()) {
                    setError("A file reference needs a path.");
                    return;
                  }
                  if (card.type === "link" && !safeCanvasUrl(value)) {
                    setError("Use a complete http or https URL.");
                    return;
                  }
                  patch(card.id, { [field]: value });
                }}
              />
            </label>
          )}
          {edge && (
            <label>
              Connection label
              <input
                key={edge.id + (edge.label || "")}
                disabled={p.disabled}
                defaultValue={edge.label || ""}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                onBlur={(e) => {
                  if (e.target.value !== (edge.label || ""))
                    patchEdge(edge.id, { label: e.target.value || undefined });
                }}
              />
            </label>
          )}
          {edge && (
            <label>
              Arrow
              <select
                disabled={p.disabled}
                value={edge.toEnd || "arrow"}
                onChange={(e) => patchEdge(edge.id, { toEnd: e.target.value })}
              >
                <option value="arrow">At destination</option>
                <option value="none">No arrow</option>
              </select>
            </label>
          )}
          <label>
            Color
            <select
              disabled={p.disabled}
              value={(card || edge).color || ""}
              onChange={(e) =>
                card
                  ? patch(card.id, { color: e.target.value || undefined })
                  : patchEdge(edge.id, { color: e.target.value || undefined })
              }
            >
              <option value="">Default</option>
              {Object.keys(palette).map((v, i) => (
                <option key={v} value={v}>
                  {["Red", "Orange", "Yellow", "Green", "Cyan", "Purple"][i]}
                </option>
              ))}
              {(card || edge).color?.startsWith("#") && (
                <option value={(card || edge).color}>Custom</option>
              )}
            </select>
          </label>
          {card && (
            <div className="canvas-dimensions">
              {["Width", "Height"].map((name, i) => (
                <label key={name}>
                  {name}
                  <input
                    key={card.id + card.size[i]}
                    type="number"
                    min="80"
                    max="10000"
                    disabled={p.disabled}
                    defaultValue={card.size[i]}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    onBlur={(e) => {
                      const v = Math.round(Number(e.target.value));
                      if (v === card.size[i]) return;
                      if (!(v >= 80 && v <= 10000)) {
                        e.target.value = String(card.size[i]);
                        setError(`${name} must be between 80 and 10000.`);
                        return;
                      }
                      patch(card.id, {
                        size: card.size.map((n: number, j: number) =>
                          i === j ? v : n,
                        ),
                      });
                    }}
                  />
                </label>
              ))}
            </div>
          )}
          {card && (
            <label>
              Connect to
              <select
                aria-label="Connect to"
                disabled={p.disabled}
                defaultValue=""
                key={card.id}
                onChange={(e) => {
                  const target = e.target.value;
                  e.target.value = "";
                  if (target)
                    edit((b) => {
                      const id = crypto.randomUUID();
                      return {
                        ...b,
                        edges: {
                          ...b.edges,
                          [id]: {
                            id,
                            fromNode: card.id,
                            toNode: target,
                            fromSide: "right",
                            toSide: "left",
                          },
                        },
                      };
                    });
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
          <button
            disabled={p.disabled}
            onClick={() =>
              card ? removeItems([card.id], []) : removeItems([], [edge.id])
            }
          >
            Remove {card ? "card" : "connection"}
          </button>
          {card?.noteId && (
            <small>
              {ownNote
                ? "Removing this card moves its note to Trash. Undo brings both back."
                : "Only this placement is removed. The linked note stays in Notes."}
            </small>
          )}
        </aside>
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
export default function CanvasStudio(p: Props) {
  const [active, setActive] = useState<string | null>(null),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    input = useRef<HTMLInputElement>(null);
  const boards = canvasBoards(p.doc),
    board = active ? p.doc.web.canvases?.[active] : null,
    title = board ? canvasTitle(p.doc, board) : "",
    [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [active]);
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
              <button onClick={saveFile}>Export .canvas</button>
              <details className="canvas-options">
                <summary aria-label="Canvas options">⋯</summary>
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
                  <div className="canvas-thumbnail" aria-hidden="true">
                    {Object.values(b.nodes)
                      .filter((n: any) => !n.removed)
                      .slice(0, 18)
                      .map((n: any, i) => (
                        <i
                          key={n.id}
                          style={{
                            left: 15 + (i % 4) * 20 + "%",
                            top: 20 + Math.floor(i / 4) * 14 + "%",
                            borderColor: tint(n.color),
                          }}
                        />
                      ))}
                  </div>
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
            (b: any) => b.removed,
          ) && (
            <details className="canvas-archived">
              <summary>Archived canvases · notes are preserved</summary>
              {Object.values(p.doc.web.canvases)
                .filter((b: any) => b.removed)
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
