import * as Sheet from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import {snapshotIndex} from './outline-snapshot.mjs';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Node } from "./data";
import {displayText} from "./relations.mjs";
import { index } from "./domain.mjs";
import { depthIndent } from "./outline-layout.mjs";
import { Icon } from "./icons";

/** Mixed controls belong in a non-modal dialog, rather than an ARIA menu. */
export function OutlinePopover({ title, anchor, onClose, children, className = "" }: {
  title: string;
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const panel = useRef<HTMLDialogElement>(null), outside = useRef(false);
  const [viewport,setViewport]=useState(()=>({width:window.innerWidth,height:window.visualViewport?.height||window.innerHeight,bottom:0}));
  useEffect(()=>{const update=()=>{const v=window.visualViewport;setViewport({width:window.innerWidth,height:v?.height||window.innerHeight,bottom:Math.max(0,window.innerHeight-((v?.offsetTop||0)+(v?.height||window.innerHeight)))});};window.addEventListener('resize',update);window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);update();return()=>{window.removeEventListener('resize',update);window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update);};},[]);
  const virtualRef = useMemo(() => ({ current: {
    getBoundingClientRect: () => anchor?.getBoundingClientRect() || new DOMRect(80, 75, 0, 0),
    contextElement: anchor || undefined,
  } }), [anchor]);
  if(viewport.width<=650&&className.includes('bullet-actions-menu'))return <Sheet.Root open onOpenChange={open=>{if(!open)onClose();}}><Sheet.Portal container={anchor?.closest('.app')||document.body}><Sheet.Overlay className="outline-sheet-backdrop"/><Sheet.Content asChild aria-describedby={undefined} onOpenAutoFocus={event=>{event.preventDefault();panel.current?.focus();}} onCloseAutoFocus={event=>{event.preventDefault();const active=document.activeElement;if(active===document.body||panel.current?.contains(active))anchor?.isConnected&&anchor.focus({preventScroll:true});}} onEscapeKeyDown={event=>{if(panel.current?.querySelector('[data-escape-local="true"]'))event.preventDefault();else event.stopPropagation();}}><dialog open tabIndex={-1} ref={panel} className={`outline-popover outline-mobile-sheet ${className}`} style={{maxHeight:viewport.height-12,bottom:viewport.bottom}}><div className="sheet-grabber" aria-hidden="true"/><div className="popover-heading"><Sheet.Title asChild><span>{title}</span></Sheet.Title><Sheet.Close asChild><button className="icon-button" aria-label="Close dialog"><Icon name="close" size={18}/></button></Sheet.Close></div>{children}</dialog></Sheet.Content></Sheet.Portal></Sheet.Root>;
  return <Popover.Root open onOpenChange={open => { if (!open) onClose(); }} modal={false}>
    <Popover.Anchor virtualRef={virtualRef}/>
    <Popover.Portal container={anchor?.closest('.app') || document.body}>
      <Popover.Content asChild side="bottom" align="start" sideOffset={5} collisionPadding={12} aria-describedby={undefined}
        onEscapeKeyDown={event => {
          if (panel.current?.querySelector('[data-escape-local="true"]')) event.preventDefault();
          else event.stopPropagation();
        }}
        onOpenAutoFocus={event => {
          event.preventDefault();
          (panel.current?.querySelector<HTMLElement>('.bullet-action-search input, .popover-quick-actions button:not(:disabled)') || panel.current?.querySelector<HTMLElement>('button:not(:disabled), input, select'))?.focus();
        }}
        onInteractOutside={() => { outside.current = true; }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          // Outside clicks and newly opened dialogs own their focus.
          const active = document.activeElement;
          if (!outside.current && (active === document.body || panel.current?.contains(active))) anchor?.isConnected && anchor.focus({preventScroll:true});
        }}>
        <dialog open ref={panel} className={`outline-popover ${className}`} aria-label={title} onKeyDown={event => {
          if (event.defaultPrevented || (event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return;
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          const elements = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary') || [])].filter(el => el.getClientRects().length > 0);
          const at = elements.indexOf(document.activeElement as HTMLElement);
          event.preventDefault(); event.stopPropagation();
          elements[event.key === 'Home' ? 0 : event.key === 'End' ? elements.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + elements.length) % elements.length]?.focus();
        }}>
          <div className="popover-heading"><Popover.Title asChild><span>{title}</span></Popover.Title><Popover.Close asChild><button className="icon-button" aria-label="Close dialog"><Icon name="close" size={14}/></button></Popover.Close></div>
          {children}
        </dialog>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
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
    idx = useMemo(() => snapshotIndex(nodes), [nodes]),
    viewportRef = useRef<HTMLDivElement>(null), treeRef = useRef<HTMLDivElement>(null), lastScrolled = useRef<string | null>(null),
    [viewport, setViewport] = useState({ top: 0, height: 600 });
  const visible=useMemo(()=>{
    const rows:{node:Node;depth:number}[]=[],stack=(idx.children.get(null)||[]).filter((n:Node)=>!n.id.startsWith('journal-')).slice().reverse().map((node:Node)=>({node,depth:0}));
    while(stack.length){const row=stack.pop()!;rows.push(row);if(expanded.has(row.node.id)){const children=idx.children.get(row.node.id)||[];for(let i=children.length-1;i>=0;i--)stack.push({node:children[i],depth:row.depth+1});}}
    return rows;
  },[idx,expanded]);
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
