import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Node } from "./data";
import {displayText} from "./relations.mjs";
import { index } from "./domain.mjs";
import { depthIndent } from "./outline-layout.mjs";
import { Icon } from "./icons";

/** A non-modal menu: keep the outline visible and place actions beside their source. */
export function OutlinePopover({ title, anchor, onClose, children, className = "" }: {
  title: string;
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const panel = useRef<HTMLDialogElement>(null),
    close = useRef(onClose),
    [position, setPosition] = useState({ left: 16, top: 56 });
  close.current = onClose;
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const r = anchor?.getBoundingClientRect(),
      width = el.offsetWidth || 280,
      height = el.offsetHeight || 400;
    setPosition({
      left: Math.max(8, Math.min(r?.left ?? 80, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(r ? r.bottom + 5 : 80, window.innerHeight - height - 8)),
    });
    const previous = document.activeElement as HTMLElement | null;
    (el.querySelector<HTMLElement>(".popover-quick-actions button:not(:disabled)") || el.querySelector<HTMLElement>("button:not(:disabled), input, select"))?.focus();
    return () => {
      if (anchor?.isConnected) anchor.focus();
      else if (previous?.isConnected) previous.focus();
    };
  }, [anchor]);
  useEffect(() => {
    const el = panel.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const r = anchor?.getBoundingClientRect();
      setPosition({ left: Math.max(8, Math.min(r?.left ?? 80, window.innerWidth - el.offsetWidth - 8)), top: Math.max(8, Math.min(r ? r.bottom + 5 : 80, window.innerHeight - el.offsetHeight - 8)) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [anchor]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as globalThis.Node) &&
          !anchor?.contains(event.target as globalThis.Node)) close.current();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const elements = [...(panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input, select, summary") || [])].filter(el => !el.closest("details:not([open])") || el.tagName === "SUMMARY" && el.parentElement === el.closest("details:not([open])"));
        const at = elements.indexOf(document.activeElement as HTMLElement);
        if ((event.target as HTMLElement).tagName === "SELECT") return;
        event.preventDefault();
        elements[(at + (event.key === "ArrowDown" ? 1 : -1) + elements.length) % elements.length]?.focus();
      }
    };
    const reposition = () => close.current();
    document.addEventListener("pointerdown", outside);
    panel.current?.addEventListener("keydown", key);
    window.addEventListener("resize", reposition);
    const el = panel.current;
    return () => {
      document.removeEventListener("pointerdown", outside);
      el?.removeEventListener("keydown", key);
      window.removeEventListener("resize", reposition);
    };
  }, [anchor]);
  return <dialog open ref={panel} className={`outline-popover ${className}`} aria-label={title} style={position}>
    <div className="popover-heading"><span>{title}</span><button className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" size={14} /></button></div>
    {children}
  </dialog>;
}

export function OutlineSidebar({ nodes, scope, starred, savedSearches, disabled, onNavigate, onSearch, onAdd }: {
  nodes: Node[];
  scope: string | null;
  starred: string[];
  savedSearches: string[];
  disabled: boolean;
  onNavigate: (id: string | null) => void;
  onSearch: (query: string) => void;
  onAdd: (parent: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(new Set<string>()),
    idx = useMemo(() => index(nodes), [nodes]),
    viewportRef = useRef<HTMLDivElement>(null), treeRef = useRef<HTMLDivElement>(null), lastScrolled = useRef<string | null>(null),
    [viewport, setViewport] = useState({ top: 0, height: 600 }),
    visible: { node: Node; depth: number }[] = [],
    stack = (idx.children.get(null) || []).filter((n: Node) => !n.id.startsWith("journal-")).slice().reverse().map((node: Node) => ({ node, depth: 0 }));
  useEffect(() => {
    if (!scope) return;
    const parents: string[] = [];
    let parent = idx.byId.get(scope)?.parentId;
    while (parent) {
      parents.push(parent);
      parent = idx.byId.get(parent)?.parentId;
    }
    setExpanded(previous => new Set([...previous, ...parents]));
  }, [scope]);
  while (stack.length) {
    const row = stack.pop()!;
    visible.push(row);
    if (expanded.has(row.node.id)) {
      const children = idx.children.get(row.node.id) || [];
      for (let i = children.length - 1; i >= 0; i--)
        stack.push({ node: children[i], depth: row.depth + 1 });
    }
  }
  const measureViewport = () => {
    const el = viewportRef.current, tree = treeRef.current;
    if (!el || !tree) return;
    const top = Math.max(0, el.getBoundingClientRect().top - tree.getBoundingClientRect().top), height = el.clientHeight || 600;
    setViewport(previous => previous.top === top && previous.height === height ? previous : { top, height });
  };
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measureViewport);
    observer?.observe(el); window.addEventListener("resize", measureViewport); measureViewport();
    return () => { observer?.disconnect(); window.removeEventListener("resize", measureViewport); };
  }, []);
  useLayoutEffect(() => {
    const el = viewportRef.current, tree = treeRef.current;
    if (!scope) { lastScrolled.current = null; return; }
    if (!el || !tree || lastScrolled.current === scope) return;
    const at = visible.findIndex(item => item.node.id === scope);
    if (at < 0) return; // Ancestors are expanded by the effect above on the next render.
    const start = tree.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    if (start + at * 30 < el.scrollTop || start + (at + 1) * 30 > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, start + at * 30 - (el.clientHeight || 300) / 2);
    lastScrolled.current = scope; measureViewport();
  }, [scope, expanded, visible.length]);
  const virtual = visible.length > 200, first = virtual ? Math.max(0, Math.floor(viewport.top / 30) - 10) : 0,
    shown = virtual ? visible.slice(first, Math.min(visible.length, first + Math.ceil(viewport.height / 30) + 20)) : visible;
  const toggle = (id: string) => setExpanded(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return <div ref={viewportRef} className="root-nav outline-sidebar" onScroll={measureViewport}>
    <div className="sidebar-section-heading"><Icon name="star" size={14} /><span>Starred</span></div>
    {!starred.some(id => idx.byId.has(id)) && !savedSearches.length && <p className="sidebar-empty">Star a page or search for quick access.</p>}
    {starred.filter(id => idx.byId.has(id)).map(id => <button key={id} className={scope === id ? "root-active" : ""} onClick={() => onNavigate(id)}><Icon name="star" size={12} /><span>{displayText(idx.byId.get(id).text) || "Untitled"}</span></button>)}
    {savedSearches.map(query => <button key={query} onClick={() => onSearch(query)}><Icon name="search" size={12} /><span>{query}</span></button>)}
    <div className="sidebar-section-heading"><button className="sidebar-home" onClick={() => onNavigate(null)}><Icon name="home" size={14} /><span>Home</span></button><button className="sidebar-tree-add" aria-label="New root note" title="New root note" disabled={disabled} onClick={() => onAdd(null)}><Icon name="plus" size={14} /></button></div>
    <div ref={treeRef} role="tree" aria-label="Notes tree" style={virtual ? { height: visible.length * 30, position: "relative" } : undefined}>
      {shown.map(({ node, depth }, i) => {
        const hasChildren = (idx.children.get(node.id) || []).length > 0;
        return <div key={node.id} className={`sidebar-tree-row ${scope === node.id ? "root-active" : ""}`} role="treeitem" aria-level={depth + 1} aria-selected={scope === node.id} aria-expanded={hasChildren ? expanded.has(node.id) : undefined} style={{ paddingLeft: depthIndent(depth, 280), ...(virtual ? { position: "absolute", top: (first + i) * 30, width: "100%" } : {}) }}>
          <button className="sidebar-tree-toggle" aria-label={`${expanded.has(node.id) ? "Collapse" : "Expand"} ${node.text || "Untitled"} in sidebar`} disabled={!hasChildren} onClick={() => toggle(node.id)}><Icon name="chevron" size={10} /></button>
          <button className="sidebar-tree-label" title={node.text || "Untitled"} onClick={() => onNavigate(node.id)}><span>{displayText(node.text) || "Untitled"}</span></button>
          <button className="sidebar-tree-add" title="Add child note" aria-label={`Add child to ${node.text || "Untitled"}`} disabled={disabled} onClick={() => { setExpanded(previous => new Set(previous).add(node.id)); onAdd(node.id); }}><Icon name="plus" size={13} /></button>
        </div>;
      })}
    </div>
  </div>;
}

export function JumpTo({ nodes, onChoose }: { nodes: Node[]; onChoose: (id: string) => void }) {
  const [query, setQuery] = useState(""), [active, setActive] = useState(0),
    idx = index(nodes),
    matches = nodes.filter(node => node.text.trim() && node.text.toLowerCase().includes(query.toLowerCase())).slice(0, 40);
  useEffect(() => { document.querySelector<HTMLInputElement>(".jump-search")?.focus(); }, []);
  useEffect(() => { document.querySelector<HTMLElement>('.jump-results [aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" }); }, [active]);
  return <div className="jump-picker">
    <div className="jump-search-wrap"><Icon name="search" /><input className="jump-search" data-autofocus aria-label="Jump to a note" placeholder="Find a page or bullet…" value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive(value => Math.max(0, Math.min(matches.length - 1, value + (event.key === "ArrowDown" ? 1 : -1))));
      } else if (event.key === "Enter" && matches[active]) { event.preventDefault(); onChoose(matches[active].id); }
    }} /></div>
    <div className="jump-results" role="listbox" aria-label="Matching notes">
      {matches.map((node, i) => <button key={node.id} role="option" aria-selected={i === active} className={i === active ? "jump-active" : ""} onClick={() => onChoose(node.id)}><Icon name="notes" size={16} /><span><strong>{node.text}</strong><small>{idx.byId.get(node.parentId)?.text || "Home"}</small></span><Icon name="chevron" size={13} /></button>)}
      {!matches.length && <p className="jump-empty">No notes found. Try another search.</p>}
    </div>
    <div className="jump-hint">↑ ↓ to navigate <span>Enter to open</span></div>
  </div>;
}
