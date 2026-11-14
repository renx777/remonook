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
  moveCanvasCard,
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
function Editor({ boardId, ...p }: Props & { boardId: string }) {
  const b = p.doc.web.canvases?.[boardId],
    flow = useReactFlow(),
    [selected, setSelected] = useState<string | null>(null),
    [edgeId, setEdgeId] = useState<string | null>(null),
    [picker, setPicker] = useState(false),
    [filter, setFilter] = useState(""),
    [error, setError] = useState("");
  const edit = (update: (b: any) => any) => {
    try {
      p.onChange((doc) => changeCanvas(doc, boardId, update));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const patch = (id: string, patch: any) =>
    edit((b) => ({
      ...b,
      nodes: { ...b.nodes, [id]: { ...b.nodes[id], ...patch } },
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
  const gesture = useRef(false),
    ignorePaneUntil = useRef(0);
  const projected = useMemo(
    () =>
      Object.values(b.nodes)
        .filter((n: any) => !n.removed)
        .map((n: any) => {
          const current = rowById.get(n.noteId),
            note = current && !current.deleted ? current : undefined;
          const text = canvasNoteText(note, n);
          return {
            id: n.id,
            type: "card",
            position: { x: n.position[0], y: n.position[1] },
            width: n.size[0],
            height: n.size[1],
            selected: selected === n.id,
            zIndex: n.order,
            style: { width: n.size[0], height: n.size[1] },
            data: {
              ...n,
              kind: n.type,
              disabled: p.disabled,
              missing: n.noteId && !note,
              select: () => {
                setSelected(n.id);
                setEdgeId(null);
              },
              html: n.type === "text" ? renderMarkdown(n.id, text) : "",
              beginResize: () => {
                gesture.current = true;
              },
              resize: (v: any) => {
                gesture.current = false;
                ignorePaneUntil.current = Date.now() + 250;
                patchRef.current(n.id, {
                  position: [Math.round(v.x), Math.round(v.y)],
                  size: [Math.round(v.width), Math.round(v.height)],
                });
              },
            },
          };
        }),
    [b.nodes, rowById, selected, p.disabled],
  );
  // Keep pointer movement local; completed gestures alone enter save, sync and undo.
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>(
    projected as FlowNode[],
  );
  useEffect(() => {
    setFlowNodes((current) => {
      const prior = new Map(current.map((n) => [n.id, n]));
      return (projected as FlowNode[]).map((n) => {
        const old = prior.get(n.id);
        return {
          ...n,
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
  const card = selected ? b.nodes[selected] : null,
    note = card?.noteId
      ? p.doc.tables.bullets.find((n) => n.id === card.noteId && !n.deleted)
      : null,
    edge = edgeId ? b.edges[edgeId] : null;
  const add = (kind: string, noteId?: string) => {
    try {
      const id = crypto.randomUUID(),
        at = flow.screenToFlowPosition({
          x: window.innerWidth * 0.5,
          y: window.innerHeight * 0.4,
        });
      p.onChange((doc) => {
        const board = doc.web.canvases[boardId];
        if (
          Object.values(board.nodes).filter((n: any) => !n.removed).length >=
          CANVAS_LIMITS.nodes
        )
          throw Error("This canvas has reached 400 cards.");
        let rows = doc.tables.bullets,
          ref = noteId ? sourceId(rows, noteId) : undefined;
        if (kind === "text" && !ref) {
          ref = crypto.randomUUID();
          rows = [
            ...rows,
            bullet(ref, {
              parentId: board.rootId,
              text: "",
              position: rows.filter((n) => n.parentId === board.rootId).length,
            }),
          ];
        }
        const existing = Object.values(board.nodes).filter(
          (n: any) => !n.removed && n.type !== "group",
        ) as any[];
        const left = existing.length
            ? Math.min(...existing.map((n) => n.position[0])) - 50
            : at.x - 300,
          top = existing.length
            ? Math.min(...existing.map((n) => n.position[1])) - 60
            : at.y - 210;
        const n = {
          id,
          type: kind,
          position:
            kind === "group"
              ? [Math.round(left), Math.round(top)]
              : [Math.round(at.x - 140), Math.round(at.y - 90)],
          size:
            kind === "group"
              ? [
                  Math.max(
                    600,
                    ...existing.map(
                      (n) => n.position[0] + n.size[0] - left + 50,
                    ),
                  ),
                  Math.max(
                    420,
                    ...existing.map(
                      (n) => n.position[1] + n.size[1] - top + 50,
                    ),
                  ),
                ]
              : [280, 180],
          order:
            kind === "group"
              ? Math.min(
                  -1,
                  ...Object.values(board.nodes).map((n: any) => n.order - 1),
                )
              : Object.keys(board.nodes).length,
          ...(kind === "text"
            ? {
                noteId: ref,
                text: rows.find((n) => n.id === ref)?.text || "",
                markdown: !noteId,
              }
            : kind === "link"
              ? { url: "https://example.com" }
              : kind === "file"
                ? { file: "document.pdf" }
                : { label: "Group" }),
        };
        return changeCanvas(
          { ...doc, tables: { ...doc.tables, bullets: rows } },
          boardId,
          (b: any) => ({ ...b, nodes: { ...b.nodes, [id]: n } }),
        );
      });
      setSelected(id);
      setEdgeId(null);
      setPicker(false);
      setError("");
      requestAnimationFrame(() =>
        flow.fitView({ padding: 0.25, maxZoom: 1, duration: 150 }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const connect = (c: Connection) =>
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
    });
  const remove = () => {
    if (selected) {
      try {
        p.onChange((doc) => removeCanvasCards(doc, boardId, [selected]));
        setSelected(null);
      } catch (e) {
        setError((e as Error).message);
      }
    } else if (edgeId) {
      edit((b) => ({
        ...b,
        edges: { ...b.edges, [edgeId]: { ...b.edges[edgeId], removed: true } },
      }));
      setEdgeId(null);
    }
  };
  return (
    <div className="canvas-workspace">
      <div className="canvas-tools" role="toolbar" aria-label="Canvas tools">
        <button
          disabled={p.disabled}
          aria-label="Undo canvas change"
          onClick={() => p.onUndo(false)}
        >
          ↶
        </button>
        <button
          disabled={p.disabled}
          aria-label="Redo canvas change"
          onClick={() => p.onUndo(true)}
        >
          ↷
        </button>
        <button disabled={p.disabled} onClick={() => add("text")}>
          ＋ Text
        </button>
        <button disabled={p.disabled} onClick={() => setPicker(!picker)}>
          Link note
        </button>
        <button disabled={p.disabled} onClick={() => add("group")}>
          Group
        </button>
        <button disabled={p.disabled} onClick={() => add("link")}>
          URL
        </button>
        <button disabled={p.disabled} onClick={() => add("file")}>
          File reference
        </button>
        <span>Drag handles to connect · select a card to edit</span>
      </div>
      {picker && (
        <div className="canvas-note-picker">
          <label>
            Find an existing note
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
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
      <div className="canvas-stage">
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
          deleteKeyCode={null}
          onNodeClick={(_, n) => {
            setSelected(n.id);
            setEdgeId(null);
          }}
          onEdgeClick={(_, e) => {
            setEdgeId(e.id);
            setSelected(null);
          }}
          onPaneClick={() => {
            if (Date.now() < ignorePaneUntil.current) return;
            setSelected(null);
            setEdgeId(null);
          }}
          onNodeDragStart={() => {
            gesture.current = true;
          }}
          onNodeDrag={(_, n) => {
            const stored = b.nodes[n.id];
            if (stored.type !== "group") return;
            const dx = n.position.x - stored.position[0],
              dy = n.position.y - stored.position[1];
            setFlowNodes((current) =>
              current.map((other) => {
                const original = b.nodes[other.id];
                if (!original || other.id === n.id || original.removed)
                  return other;
                const inside =
                  original.position[0] >= stored.position[0] &&
                  original.position[1] >= stored.position[1] &&
                  original.position[0] + original.size[0] <=
                    stored.position[0] + stored.size[0] &&
                  original.position[1] + original.size[1] <=
                    stored.position[1] + stored.size[1];
                return inside
                  ? {
                      ...other,
                      position: {
                        x: original.position[0] + dx,
                        y: original.position[1] + dy,
                      },
                    }
                  : other;
              }),
            );
          }}
          onNodeDragStop={(_, n) => {
            gesture.current = false;
            ignorePaneUntil.current = Date.now() + 250;
            try {
              p.onChange((doc) =>
                moveCanvasCard(doc, boardId, n.id, [
                  Math.round(n.position.x),
                  Math.round(n.position.y),
                ]),
              );
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
          onConnect={connect}
        >
          <Background gap={24} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {(card || edge) && (
        <aside className="canvas-inspector" aria-label="Selected canvas item">
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
              onClick={() => {
                setSelected(null);
                setEdgeId(null);
              }}
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
                />
                <button onClick={() => p.onOpenNote(note.id)}>
                  Open in Notes ↗
                </button>
              </>
            ) : (
              <>
                <p>
                  Source note unavailable. Its text from when this card was
                  placed is preserved below.
                </p>
                <textarea readOnly value={card.text || ""} />
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
                onBlur={(e) => {
                  const value = e.target.value;
                  if (card.type === "file" && !value.trim()) {
                    setError("A file reference needs a path.");
                    return;
                  }
                  if (card.type === "link" && !safeCanvasUrl(value)) {
                    setError("Use a complete http or https URL.");
                    return;
                  }
                  patch(card.id, {
                    [card.type === "link"
                      ? "url"
                      : card.type === "file"
                        ? "file"
                        : "label"]: value,
                  });
                }}
              />
            </label>
          )}
          {edge && (
            <label>
              Connection label
              <input
                disabled={p.disabled}
                value={edge.label || ""}
                onChange={(e) =>
                  edit((b) => ({
                    ...b,
                    edges: {
                      ...b.edges,
                      [edge.id]: { ...b.edges[edge.id], label: e.target.value },
                    },
                  }))
                }
              />
            </label>
          )}
          {edge && (
            <label>
              Arrow
              <select
                disabled={p.disabled}
                value={edge.toEnd || "arrow"}
                onChange={(e) =>
                  edit((b) => ({
                    ...b,
                    edges: {
                      ...b.edges,
                      [edge.id]: { ...b.edges[edge.id], toEnd: e.target.value },
                    },
                  }))
                }
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
                  : edit((b) => ({
                      ...b,
                      edges: {
                        ...b.edges,
                        [edge.id]: {
                          ...b.edges[edge.id],
                          color: e.target.value || undefined,
                        },
                      },
                    }))
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
              {["Width", "Height"].map((label, i) => (
                <label key={label}>
                  {label}
                  <input
                    type="number"
                    min="80"
                    max="10000"
                    disabled={p.disabled}
                    value={card.size[i]}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (v >= 80 && v <= 10000)
                        patch(card.id, {
                          size: card.size.map((n: number, j: number) =>
                            i === j ? Math.round(v) : n,
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
                  if (e.target.value)
                    connect({
                      source: card.id,
                      target: e.target.value,
                      sourceHandle: "out-right",
                      targetHandle: "in-left",
                    });
                  e.target.value = "";
                }}
              >
                <option value="">Choose a card…</option>
                {Object.values(b.nodes)
                  .filter((n: any) => !n.removed && n.id !== card.id)
                  .map((n: any) => (
                    <option key={n.id} value={n.id}>
                      {(
                        p.doc.tables.bullets.find((row) => row.id === n.noteId)
                          ?.text ||
                        n.label ||
                        n.file ||
                        n.url ||
                        "Untitled text"
                      ).slice(0, 60)}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <button disabled={p.disabled} onClick={remove}>
            Remove {card ? "card" : "connection"}
          </button>
          {card?.noteId && (
            <small>
              Only this placement is removed. The note stays in Notes. Use the
              app’s Undo to restore it.
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
    board = active ? p.doc.web.canvases?.[active] : null;
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
        (board.title.replace(/[^\w -]/g, "").trim() || "Untitled") + ".canvas";
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
              value={board.title}
              onChange={(e) =>
                p.onChange((doc) =>
                  changeCanvas(doc, active!, (b: any) => ({
                    ...b,
                    title: e.target.value,
                  })),
                )
              }
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
                b.title.toLowerCase().includes(query.toLowerCase()),
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
                  <strong>{b.title || "Untitled canvas"}</strong>
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
                    {b.title}{" "}
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
