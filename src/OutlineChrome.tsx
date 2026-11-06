import * as Sheet from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import {snapshotIndex} from './outline-snapshot.mjs';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Node } from "./data";
import {displayText,tagColor} from "./relations.mjs";
import {tagIndex,rootTags,tagLeaf,isTagQuery,tagKey} from "./tags.mjs";
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

export function OutlineSidebar({ nodes, scope, starred, savedSearches, search = "", onNavigate, onSearch }: {
  nodes: Node[];
  scope: string | null;
  starred: string[];
  savedSearches: string[];
  search?: string;
  disabled?: boolean;
  onNavigate: (id: string | null) => void;
  onSearch: (query: string) => void;
  onAdd?: (parent: string | null) => void;
}) {
  const idx = useMemo(() => snapshotIndex(nodes), [nodes]),
    tags = useMemo(() => tagIndex(nodes), [nodes]),
    [expanded, setExpanded] = useState(new Set<string>()), [showAll, setShowAll] = useState(false);
  const active = isTagQuery(search) ? tagKey(search.trim()) : null;
  useEffect(() => { // Reveal the active nested tag.
    if (!active?.includes("/")) return;
    const parts: string[] = active.split("/");
    setExpanded(previous => new Set([...previous, ...parts.slice(1).map((_, i) => parts.slice(0, i + 1).join("/"))]));
  }, [active]);
  const rows: { tag: ReturnType<typeof tagIndex> extends Map<string, infer T> ? T : never; depth: number }[] = [];
  const roots = rootTags(tags), limit = showAll ? Infinity : 12;
  const walk = (key: string, depth: number) => { const t = tags.get(key)!; rows.push({ tag: t, depth }); if (expanded.has(key)) for (const child of t.children) walk(child, depth + 1); };
  for (const t of roots.slice(0, limit)) walk(t.key, 0);
  const toggle = (key: string) => setExpanded(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  return <div className="root-nav outline-sidebar">
    <div className="sidebar-section-heading"><Icon name="star" size={14} /><span>Starred</span></div>
    {!starred.some(id => idx.byId.has(id)) && !savedSearches.length && <p className="sidebar-empty">Star a page or search for quick access.</p>}
    {starred.filter(id => idx.byId.has(id)).map(id => <button key={id} className={scope === id ? "root-active" : ""} onClick={() => onNavigate(id)}><Icon name="star" size={12} /><span>{displayText(idx.byId.get(id).text) || "Untitled"}</span></button>)}
    {savedSearches.map(query => <button key={query} className={search.trim() === query ? "root-active" : ""} onClick={() => onSearch(query)}><Icon name="search" size={12} /><span>{query}</span></button>)}
    <div className="sidebar-section-heading sidebar-tags-heading"><Icon name="hash" size={14} /><span>Tags</span>{tags.size > 0 && <small>{tags.size}</small>}</div>
    {!tags.size && <p className="sidebar-empty">Type #topic in any bullet to tag it. Tags appear here.</p>}
    <div role="tree" aria-label="Tags" className="sidebar-tags">
      {rows.map(({ tag, depth }) => {
        const open = expanded.has(tag.key), isActive = active === tag.key, color = tagColor("#" + tag.key);
        return <div key={tag.key} role="treeitem" aria-level={depth + 1} aria-selected={isActive} aria-expanded={tag.children.length ? open : undefined} className={`sidebar-tag-row ${isActive ? "root-active" : ""}`} style={{ paddingLeft: 4 + depth * 16 }}>
          <button className="sidebar-tree-toggle" aria-label={`${open ? "Collapse" : "Expand"} #${tag.label}`} disabled={!tag.children.length} onClick={() => toggle(tag.key)}><Icon name="chevron" size={10} /></button>
          <button className="sidebar-tag" title={`Show #${tag.label}`} onClick={() => onSearch("#" + tag.label)}>
            <span className="sidebar-tag-dot" style={{ background: color }} aria-hidden="true" />
            <span className="sidebar-tag-name">{tagLeaf(tag)}</span>
            <small>{tag.count}</small>
          </button>
        </div>;
      })}
    </div>
    {roots.length > 12 && <button className="sidebar-tags-more" onClick={() => setShowAll(v => !v)}>{showAll ? "Show fewer tags" : `Show ${roots.length - 12} more tags`}</button>}
  </div>;
}
