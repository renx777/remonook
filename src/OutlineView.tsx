import {LiveTitleInput} from './LiveTitleInput';
import {ReadingCitation} from './ReadingSources';
import {snapshotIndex} from './outline-snapshot.mjs';
import {branchMedia,musicItems} from './music.mjs';
import {useMusic} from './Music';
import {GalleryContext} from './Gallery';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { outlineClipboardHtml, type ClipboardInput } from "./clipboard";
import type { Editor } from "@tiptap/core";
import { indexedRows, index, descendants } from "./domain.mjs";
import { rootRows } from "./notes-filter.mjs";
import { BulletEditor, RichRead } from "./editor";
import { Icon } from "./icons";
import type { Node } from "./data";
import { formatDateBadge } from "./CalendarView";
import { MediaContent } from "./MediaContent";
import { mediaLinks } from "./media.mjs";
import { imageType } from "./media.mjs";
import { depthIndent } from "./outline-layout.mjs";
import {bulletTagStyle,toggleTagCheckbox} from "./tags.mjs";
import {TagSettingsContext} from "./TagSettingsContext";
import {marks as markRanges,encode as encodeMarks} from "./domain.mjs";
import {useContext} from "react";
import {SearchContext} from "./SearchBox";
import {searchMatcher} from "./search.mjs";
import { readerSelection } from "./outline-selection";
type Props = {
  hideTitle?: boolean;
  /** Size the canvas to its rows so a parent page can scroll it (short outlines only). */
  fitContent?: boolean;
  /** Show only these bullets (each with its children) instead of the scope's tree. */
  rootIds?: string[] | null;
  /** Hide typed branches in the ordinary Notes filter, including their children. */
  excludedIds?: ReadonlySet<string>;
  nodes: Node[];
  scope: string | null;
  search: string;
  showCompleted: boolean;
  readingSize?: number;
  onImages?: (id: string, files: File[]) => void;
  onRemoveMedia?: (id: string) => void;
  onResizeMedia?: (id:string,width:number)=>void;
  onOccludeMedia?: (id:string)=>void;
  editing: string | null;
  caret: number | null;
  disabled: boolean;
  assets: Map<string, Blob>;
  media: any[];
  onEdit: (id: string | null) => void;
  onZoom: (id: string) => void;
  onOpenPane?: (id:string)=>void;
  onMindmap?: (id: string) => void;
  onToggle: (id: string) => void;
  onChange: (id: string, value: { text: string; formatting: string }) => void;
  onEditorChange?: (id: string, value: { text: string; formatting: string }) => void;
  readCurrentNode?: (id: string) => Node | undefined;
  onCommand: (action: string, id: string, start: number, end: number, selectedIds?: string[]) => void;
  onOutlinePaste: (id: string, start: number, end: number, text: ClipboardInput) => void;
  onReady: (editor: Editor | null) => void;
  onMove: (id: string, target: string, zone: string) => void;
  onTask: (id: string) => void;
  onMenu: (id: string, anchor?: HTMLElement, selectedIds?: string[]) => void;
  onAdd?: (parentId?: string | null) => void;
  onDeleteNodes?: (ids: string[]) => void;
  setNotice?: (msg: string) => void;
};
export function OutlineView(p: Props) {
  const {times}=useContext(SearchContext);
  const tagSettings=useContext(TagSettingsContext);
  const music=useMusic(),galleryContext=useContext(GalleryContext);
  const badges=useMemo(()=>branchMedia(p.nodes,p.media),[p.nodes,p.media]);
  const mindmapBadges=useMemo(()=>{
    const parents=new Map(p.nodes.map(n=>[n.id,n.parentId])),result=new Map<string,[string,number]>();
    for(const root of p.nodes.filter(n=>n.mindmap)){
      let hops=0,id:string|null|undefined=root.id;const seen=new Set<string>();
      while(id&&!seen.has(id)){seen.add(id);const prev=result.get(id);if(!prev||prev[1]>hops)result.set(id,[root.id,hops]);hops++;id=parents.get(id);}
    }
    return result;
  },[p.nodes]);
  const matches=useMemo(()=>p.search.trim()?searchMatcher(p.nodes,p.media,times):()=>true,[p.nodes,p.media,times,p.search]);
  const readingSize = p.readingSize || 16,
    rowHeight = readingSize * 1.5 + 4;
  const idx = useMemo(() => snapshotIndex(p.nodes), [p.nodes]),
    ordinals = useMemo(() => {
      const numbers = new Map<string, number>();
      for (const siblings of idx.children.values()) {
        let ordinal = 0;
        for (const node of siblings) if (node.listType === "ORDERED") numbers.set(node.id, ++ordinal);
      }
      return numbers;
    }, [idx]),
    rs = useMemo(
      () => {
        const expanded = !!p.search,
          all = p.rootIds ? rootRows(idx, p.rootIds, expanded) : indexedRows(idx, p.scope, expanded),
          completion = { depth: -1 },
          available = all.filter((row: any) => {
            if (row.depth <= completion.depth) completion.depth = -1;
            const hidden = !p.showCompleted && !/(?:^|\s)is:complete(?:\s|$)/i.test(p.search) && (row.bullet.taskState === "DONE" || completion.depth >= 0);
            if (hidden && completion.depth < 0) completion.depth = row.depth;
            return !p.excludedIds?.has(row.bullet.id)&&(!hidden || row.bullet.id === p.editing);
          });
        const query = p.search.trim().toLowerCase();
        if (!query) return available;
        const keep = new Set<string>();
        for (const row of available) {
          if (row.bullet.id!==p.editing&&!matches(row.bullet,p.search)) continue;
          let current: any = row.bullet;
          while (current && current.id !== p.scope && !keep.has(current.id)) {
            keep.add(current.id);
            current = idx.byId.get(current.parentId);
          }
        }
        return available.filter((row: any) => keep.has(row.bullet.id));
      },
      [idx, p.scope, p.search, p.showCompleted, p.editing,matches,p.rootIds,p.excludedIds],
    );
  const scroller = useRef<HTMLDivElement>(null),
    [view, setView] = useState({ top: 0, height: 600, width: 800 }),
    [measure, setMeasure] = useState(0),
    heights = useRef(new Map<string, number>()),
    estimates = useRef(new WeakMap<Node,{available:number;size:number;attached:boolean;height:number}>()),
    bounds = useRef(new Map<string, HTMLElement>()),
    [drag, setDrag] = useState<{
      id: string;
      x: number;
      y: number;
      target: string | null;
      zone: string;
      active: boolean;
    } | null>(null),
    dragRef = useRef(drag);
  dragRef.current = drag;
  const moveCallback = useRef(p.onMove);
  moveCallback.current = p.onMove;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()),
    selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const openMenu = (id: string, anchor?: HTMLElement) => p.onMenu(id, anchor, selectedIdsRef.current.has(id) ? [...selectedIdsRef.current] : [id]);
  const [boxSelect, setBoxSelect] = useState(false),
    dragSelectRef = useRef<{
      startX: number;
      startY: number;
      active: boolean;
      textRow: string | null;
      canvasY: number;
      lastY: number;
    } | null>(null),
    didDragSelect = useRef(false);
  const [readerRange, setReaderRange] = useState<{ id: string; anchor: number; head: number } | null>(null);
  const selectedRoots = [...selectedIds].filter(id => !selectedIds.has(idx.byId.get(id)?.parentId));
  const selectedBullets = [...selectedIds].map(id => idx.byId.get(id) as Node | undefined).filter((node): node is Node => !!node);
  const allOrdered = selectedBullets.length > 0 && selectedBullets.every(node => node.listType === "ORDERED");
  const allUnordered = selectedBullets.length > 0 && selectedBullets.every(node => node.listType === "UNORDERED");
  const allPlain = selectedBullets.length > 0 && selectedBullets.every(node => node.listType === "NONE");
  const allTasks = selectedBullets.length > 0 && selectedBullets.every(node => node.taskState === "TODO" || node.taskState === "DONE");
  const selectionAnchor = useRef<string | null>(null);
  const selectBranches = (ids: string[]) => {
    const selected = new Set<string>();
    const stack = [...ids];
    while (stack.length) {
      const id = stack.pop()!;
      if (selected.has(id)) continue;
      selected.add(id);
      for (const child of idx.children.get(id) || []) stack.push(child.id);
    }
    setSelectedIds(selected);
  };
  useEffect(() => {
    if (readerRange && readerRange.id !== p.editing) setReaderRange(null);
  }, [p.editing]);
  const didMoveBranch = useRef(false);
  const mediaByNode = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const m of p.media) {
      const group = groups.get(m.bulletId) || [];
      group.push(m);
      groups.set(m.bulletId, group);
    }
    return groups;
  }, [p.media]);
  const scopedNode = p.scope ? idx.byId.get(p.scope) : null;
  const layout = useMemo(() => {
    let top = p.hideTitle ? 0 : 44;
    return rs.map((r: any, i: number) => {
      const available=Math.max(120,view.width-100-depthIndent(r.depth,view.width));
      let height=heights.current.get(r.bullet.id);
      if(height===undefined){
        const cached=estimates.current.get(r.bullet),attached=mediaByNode.has(r.bullet.id);
        if(cached&&cached.available===available&&cached.size===readingSize&&cached.attached===attached)height=cached.height;
        else{
          const lines=r.bullet.text.split('\n').reduce((sum:number,line:string)=>sum+Math.max(1,Math.ceil(line.length*readingSize*.5/available)),0);
          const hasMedia=attached||mediaLinks(r.bullet.text).some(item=>item?.kind!=='link');
          height=Math.max(rowHeight,lines*readingSize*1.5+4+(hasMedia?180:0));
          estimates.current.set(r.bullet,{available,size:readingSize,attached,height});
        }
      }
      const nextRow = rs[i + 1],
        item = {
          ...r,
          rowIndex: i,
          nextDepth: nextRow ? nextRow.depth : -1,
          top,
          height,
        };
      top += height;
      return item;
    });
  }, [rs, view.width, measure, mediaByNode, scopedNode, readingSize, p.hideTitle]);
  const nextTop = layout.length
    ? layout.at(-1)!.top + layout.at(-1)!.height
      : p.hideTitle ? 0 : 44;
  const total = nextTop + rowHeight;
  useEffect(() => { heights.current.clear(); setMeasure(value => value + 1); }, [readingSize]);
  const visible = layout.filter(
    (r: any) =>
      r.bullet.id === p.editing ||
      (r.top + r.height > view.top - 300 &&
        r.top < view.top + view.height + 300),
  );
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const measureViewport = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setView(v => {
          const width = el.clientWidth || 800, height = el.clientHeight || 600;
          if (v.width === width && v.height === height) return v;
          if (v.width !== width) heights.current.clear();
          return { ...v, width, height };
        });
      });
    };
    measureViewport();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measureViewport);
    observer?.observe(el);
    window.addEventListener("resize", measureViewport);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureViewport);
      cancelAnimationFrame(frame);
    };
  }, []);
  useLayoutEffect(() => {
    const updateHeights = (elements: Element[]) => {
      let changed = false;
      for (const element of elements) {
        const id = (element as HTMLElement).dataset.nodeId!,
          height = element.getBoundingClientRect().height;
        if (height > 0 && Math.abs((heights.current.get(id) || 0) - height) > 1) {
          heights.current.set(id, height);
          changed = true;
        }
      }
      // Publish the measurement with its cache update. Deferring only the render
      // to a cancellable frame can leave the cache and row positions out of sync
      // when scrolling, editing, or image loading reconnects this observer.
      if (changed) setMeasure(m => m + 1);
    };
    const obs = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(entries => updateHeights(entries.map(entry => entry.target)));
    for (const el of bounds.current.values()) obs?.observe(el);
    // Measure before paint on attachment changes as well as text changes. The
    // observer then handles intrinsic image dimensions arriving asynchronously.
    updateHeights([...bounds.current.values()]);
    let settledFrame = 0;
    const mediaLoaded = (event: Event) => {
      const row = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-node-id]') : null;
      if (row) {
        updateHeights([row]);
        // Error handlers can replace an image with a smaller fallback after
        // this capture listener runs. Recheck after that React commit too.
        cancelAnimationFrame(settledFrame);
        settledFrame = requestAnimationFrame(() => updateHeights([...bounds.current.values()]));
      }
    };
    const container = scroller.current;
    container?.addEventListener('load', mediaLoaded, true);
    container?.addEventListener('error', mediaLoaded, true);
    return () => { obs?.disconnect(); cancelAnimationFrame(settledFrame); container?.removeEventListener('load', mediaLoaded, true); container?.removeEventListener('error', mediaLoaded, true); };
  }, [visible.map((r: any) => r.bullet.id).join("|"), typeof ResizeObserver==='undefined'?p.nodes:null, p.media, p.assets, p.editing, view.width, readingSize]);
  useEffect(() => {
    const el = scroller.current,
      r = layout.find((r: any) => r.bullet.id === p.editing);
    if (!el || !r) return;
    if (r.top < el.scrollTop) el.scrollTop = r.top;
    else if (r.top + r.height > el.scrollTop + el.clientHeight)
      el.scrollTop = r.top + r.height - el.clientHeight;
  }, [p.editing]);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [p.scope, p.search]);
  useEffect(() => {
    if (!drag) return;
    const start = { x: drag.x, y: drag.y },
      forbidden = descendants(p.nodes, drag.id);
    let frame = 0;
    const detect = (x: number, y: number) => {
      const current = dragRef.current;
      if (!current) return;
      let target: string | null = null,
        zone = "inside";
      for (const [id, el] of bounds.current) {
        if (forbidden.has(id)) continue;
        const r = el.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom && x >= r.left && x <= r.right) {
          target = id;
          const f = (y - r.top) / r.height;
          zone = f < 0.25 ? "before" : f > 0.75 ? "after" : "inside";
          break;
        }
      }
      setDrag({
        ...current,
        x,
        y,
        target,
        zone,
        active: current.active || Math.hypot(x - start.x, y - start.y) > 5,
      });
    };
    const movement = (e: PointerEvent) => {
      e.preventDefault();
      detect(e.clientX, e.clientY);
    };
    const finish = () => {
      const d = dragRef.current;
      if (d?.active) {
        didMoveBranch.current = true;
        setTimeout(() => { didMoveBranch.current = false; }, 0);
      }
      if (d?.active && d.target && d.id !== d.target)
        moveCallback.current(d.id, d.target, d.zone);
      setDrag(null);
    };
    const cancel = () => setDrag(null);
    const scroll = () => {
      const d = dragRef.current,
        el = scroller.current;
      if (d?.active && el) {
        const r = el.getBoundingClientRect(),
          speed = d.y < r.top + 60 ? -12 : d.y > r.bottom - 60 ? 12 : 0;
        if (speed) {
          el.scrollTop += speed;
          detect(d.x, d.y);
        }
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    window.addEventListener("pointermove", movement, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", movement);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [!!drag]);
  useEffect(() => {
    if (
      drag?.zone !== "inside" ||
      !drag.target ||
      !idx.byId.get(drag.target)?.collapsed ||
      drag.target === drag.id
    )
      return;
    const t = setTimeout(() => p.onToggle(drag.target!), 650);
    return () => clearTimeout(t);
  }, [drag?.target, drag?.zone]);

  useEffect(() => {
    setSelectedIds(new Set());
    selectionAnchor.current = null;
    dragSelectRef.current = null;
    setBoxSelect(false);
  }, [p.scope, p.search]);

  useEffect(() => {
    let scrollFrame = 0;
    const updateSelection = () => {
      const ds = dragSelectRef.current;
      const canvas = scroller.current?.querySelector('.outline-canvas');
      if (!ds?.active || !canvas) return;
      const currentY = ds.lastY - canvas.getBoundingClientRect().top;
      const top = Math.min(ds.canvasY, currentY), bottom = Math.max(ds.canvasY, currentY);
      selectBranches(layout.filter(r => r.top + r.height > top && r.top <= bottom).map(r => r.bullet.id));
      window.getSelection()?.removeAllRanges();
    };
    const autoScroll = () => {
      const ds = dragSelectRef.current, el = scroller.current;
      if (!ds?.active || !el) return;
      const rect = el.getBoundingClientRect();
      const speed = ds.lastY < rect.top + 40 ? -10 : ds.lastY > rect.bottom - 40 ? 10 : 0;
      if (speed) { el.scrollTop += speed; updateSelection(); }
      scrollFrame = requestAnimationFrame(autoScroll);
    };
    const onPointerMove = (e: PointerEvent) => {
      const ds = dragSelectRef.current;
      if (!ds) return;
      ds.lastY = e.clientY;
      if (!ds.active) {
        // Let the browser select characters until the gesture leaves this row.
        const textBounds = ds.textRow ? bounds.current.get(ds.textRow)?.getBoundingClientRect() : null;
        if (textBounds && e.clientY >= textBounds.top && e.clientY < textBounds.bottom) return;
        if (Math.hypot(e.clientX - ds.startX, e.clientY - ds.startY) > 5) {
          ds.active = true;
          didDragSelect.current = true;
          if (p.editing) p.onEdit(null);
          scrollFrame = requestAnimationFrame(autoScroll);
        }
      }
      if (ds.active) {
        e.preventDefault();
        setBoxSelect(true);
        updateSelection();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const ds = dragSelectRef.current;
      if (ds) {
        cancelAnimationFrame(scrollFrame);
        if (ds.active) {
          setBoxSelect(false);
          setTimeout(() => {
            didDragSelect.current = false;
          }, 0);
        } else {
          const target = e.target;
          if (
            target instanceof window.Element && (
            target.classList.contains("outline-canvas") ||
            target.classList.contains("outline-scroll"))
          ) {
            setSelectedIds(new Set());
          }
        }
        dragSelectRef.current = null;
      }
    };

    const clearOutside = (e: PointerEvent) => {
      if (e.target instanceof window.Element && !scroller.current?.contains(e.target) && !e.target.closest('.bullet-actions-menu')) setSelectedIds(new Set());
    };

    window.addEventListener("pointerdown", clearOutside);
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    if (dragSelectRef.current?.active) scrollFrame = requestAnimationFrame(autoScroll);
    return () => {
      cancelAnimationFrame(scrollFrame);
      window.removeEventListener("pointerdown", clearOutside);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [layout, p.editing, idx]);

  const getSelectedText = () => {
    const selectedRows = indexedRows(idx, p.scope, true).filter((r: any) => selectedIds.has(r.bullet.id));
    if (!selectedRows.length) return "";
    const minDepth = selectedRows.reduce((minimum: number, row: any) => Math.min(minimum, row.depth), Infinity);
    return selectedRows
      .map(
        (r: any) =>
          "\t".repeat(Math.max(0, r.depth - minDepth)) +
          "- " +
          (r.bullet.text || "")
      )
      .join("\n");
  };

  const runOnSelection = (action: string) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    p.onCommand(action, ids[0], 0, 0, ids);
  };

  const copySelected = async () => {
    const text = getSelectedText();
    if (!text) return;
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        const selectedRows = indexedRows(idx, p.scope, true).filter((r: any) => selectedIds.has(r.bullet.id));
        const base = Math.min(...selectedRows.map((r: any) => r.depth));
        const html = outlineClipboardHtml(selectedRows.map((r: any) => ({ ...r.bullet, depth: r.depth - base })));
        try { await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]); }
        catch { await navigator.clipboard.writeText(text); }
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (typeof document !== "undefined") {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
    } catch {
      // ignore
    }
    p.setNotice?.(
      `Copied ${selectedRoots.length} bullet${selectedRoots.length === 1 ? "" : "s"}`
    );
  };

  const cutSelected = async () => {
    if (!selectedIds.size) return;
    await copySelected();
    const count = selectedRoots.length;
    p.onDeleteNodes?.(selectedRoots);
    setSelectedIds(new Set());
    p.setNotice?.(`Cut ${count} bullet${count === 1 ? "" : "s"}`);
  };

  const deleteSelected = () => {
    if (!selectedIds.size) return;
    const count = selectedRoots.length;
    p.onDeleteNodes?.(selectedRoots);
    setSelectedIds(new Set());
    p.setNotice?.(`Deleted ${count} bullet${count === 1 ? "" : "s"} — use Undo to restore`);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIds.size === 0) return;
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase?.();
      if (targetTag === "input" || targetTag === "textarea" || (e.target instanceof window.Element && e.target.closest('[contenteditable="true"]'))) {
        if (e.key === "Escape") {
          setSelectedIds(new Set());
        }
        return;
      }

      if (!p.disabled && (e.ctrlKey || e.metaKey) && e.shiftKey && ['7','8','Digit7','Digit8'].includes(e.code || e.key)) {
        e.preventDefault();
        e.stopPropagation();
        const ids = [...selectedIds];
        p.onCommand(e.code === 'Digit7' || e.key === '7' ? 'block:numbered' : 'block:bulleted', ids[0], 0, 0, ids);
        return;
      }

      if (!p.disabled && (e.ctrlKey || e.metaKey) && e.shiftKey && ['9','Digit9'].includes(e.code || e.key)) {
        e.preventDefault();
        e.stopPropagation();
        runOnSelection("task:toggle");
        return;
      }

      if (!p.disabled && e.key === "Tab" && !(e.target instanceof window.Element && e.target.closest(".selection-action-bar"))) {
        e.preventDefault();
        e.stopPropagation();
        runOnSelection(e.shiftKey ? "outdent" : "indent");
        return;
      }

      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        deleteSelected();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        void copySelected();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") {
        e.preventDefault();
        void cutSelected();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedIds(new Set());
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectBranches(layout.map((r: any) => r.bullet.id));
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIds, layout, p.onDeleteNodes, p.onCommand, p.disabled]);

  return (
    <div
      ref={scroller}
      className={"outline-scroll" + (!p.hideTitle && !scopedNode ? " is-root" : "")}
      onScroll={(e) => {
        // React clears currentTarget after dispatch; capture before a deferred update.
        const top = e.currentTarget.scrollTop;
        setView((v) => v.top === top ? v : { ...v, top });
      }}
      aria-label="Outline"
      role="region"
    >
      <div
        className={`outline-canvas ${boxSelect ? "is-drag-selecting" : ""}`}
        style={{ height: p.fitContent ? total + 24 : Math.max(total + 100, view.height) }}
        onPointerDownCapture={(e) => {
          if (p.disabled || e.button !== 0 || e.pointerType === 'touch') return;
          const target = e.target as HTMLElement;
          if (
            target.closest(
              ".bullet-dot-btn, .row-hover-more, .triangle-toggle, .icon-button, .zoomed-header, .zoomed-plus-btn, input, a, .note-image, .media-player, .inline-emoji-picker, .masked-text, .note-tag, .note-reference, .mirror-badge"
            )
          ) {
            return;
          }
          didDragSelect.current = false;
          if (!e.ctrlKey && !e.metaKey && !e.shiftKey) setSelectedIds(new Set());
          const row = target.closest<HTMLElement>('[data-node-id]');
          const text = target.closest('.bullet-read-source, .tiptap');
          if (!e.shiftKey && row) selectionAnchor.current = row.dataset.nodeId || null;
          dragSelectRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            active: false,
            textRow: text ? row?.dataset.nodeId || null : null,
            canvasY: e.clientY - e.currentTarget.getBoundingClientRect().top,
            lastY: e.clientY,
          };
        }}
        onClick={(e) => {
          if (didDragSelect.current) return;
          if (
            !rs.length &&
            (e.target === e.currentTarget ||
              (e.target as HTMLElement).classList.contains("zoomed-empty-screen-hint"))
          ) {
            p.onAdd?.(p.scope);
          }
        }}
      >
        {!p.hideTitle && (scopedNode ? (
          <div className="zoomed-header">
            <LiveTitleInput key={scopedNode.id}
              readCurrent={()=>p.readCurrentNode?.(scopedNode.id)?.text??scopedNode.text}
              className="zoomed-title zoomed-title-input"
              value={scopedNode.text}
              placeholder="Untitled"
              aria-label="Zoomed node title"
              disabled={p.disabled || !!scopedNode.formatting}
              title={scopedNode.formatting ? "Edit this formatted title from its parent page" : undefined}
              onValue={(text) => {
                (p.onEditorChange||p.onChange)(scopedNode.id, {
                  text,
                  formatting: scopedNode.formatting || "",
                });
              }}
              onKeyDown={(e) => {
                if(e.nativeEvent.isComposing||e.keyCode===229)return;
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (rs.length > 0) {
                    p.onEdit(rs[0].bullet.id);
                  } else {
                    p.onAdd?.(p.scope);
                  }
                }
              }}
            />
          </div>
        ) : <h1 className="page-title-hidden">My notes</h1>)}
        {!rs.length && (!scopedNode || p.search) && (
          <div className="empty-state">
            <Icon name="notes" size={30} />
            <h2>{p.search ? "No matching bullets" : "A fresh page"}</h2>
            <p>
              {p.search
                ? "Try a different search."
                : "Add a bullet to start writing."}
            </p>
          </div>
        )}
        {!rs.length && scopedNode && !p.search && (
          <div
            className="zoomed-empty-screen-hint"
            style={{ top: nextTop }}
          />
        )}
        {visible.map((r: any) => {
          const n = r.bullet as Node,
            ts = n.codeLanguage ? null : bulletTagStyle(n.text, tagSettings),
            childCount = (idx.children.get(n.id) || []).length,
            selected = n.id === p.editing,
            drop = drag?.active && drag.target === n.id && drag.id !== n.id;
          return (
            <div
              key={n.id}
              ref={(el) => {
                if (el) bounds.current.set(n.id, el);
                else bounds.current.delete(n.id);
              }}
              data-node-id={n.id}
              data-depth={r.depth}
              data-block-style={n.blockStyle || "paragraph"}
              data-question={n.kind === "QUESTION" || undefined}
              onDragOver={event => { if (!p.disabled && event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
              onDrop={event => {
                if (p.disabled || !p.onImages) return;
                const files = [...event.dataTransfer.files].filter(file => imageType(file.name, file.type));
                if (files.length) { event.preventDefault(); event.stopPropagation(); p.onImages(n.id, files); }
              }}
              onContextMenu={event => {
                // Touch long-press belongs to native text selection, not menus.
                if ((event.nativeEvent as PointerEvent).pointerType === 'touch' || window.matchMedia('(hover: none), (pointer: coarse)').matches) return;
                event.preventDefault();
                if (!p.disabled) openMenu(n.id, event.currentTarget);
              }}
              className={`outline-row ${n.blockStyle === "divider" ? "is-divider" : ""} ${ts?.ring?"is-important":""} ${ts?.classes||""} ${ts?.icon||ts?.question?"has-tag-glyph":""} ${n.mirrorSourceId?"is-mirror":""} ${childCount > 0 ? "has-children" : "no-children"} ${selected ? "selected" : ""} ${selectedIds.has(n.id) ? "is-multi-selected" : ""} ${drag?.active && drag.id === n.id ? "dragging" : ""} ${drop ? "drop-" + drag.zone : ""}`}
              style={{
                top: r.top,
                paddingLeft: depthIndent(r.depth, view.width),
                ...(ts?.ring ? { ["--tag-ring" as any]: ts.ring } : {}),
              }}
            >
              {/* Indent guide lines showing extent of branches */}
              {Array.from({ length: Math.min(r.depth, 8) }, (_, offset) => {
                const k = Math.max(0, r.depth - 8) + offset;
                const isImmediateParent = k === r.depth - 1;
                const isBranchEnd = r.nextDepth <= k;
                if (depthIndent(k + 1, view.width) - depthIndent(k, view.width) < (view.width < 600 ? 20 : 28)) return null;
                return (
                  <span
                    key={k}
                    className="indent-guide-line"
                    style={{
                      left: depthIndent(k, view.width) + readingSize * .65,
                      top: 0,
                      height: isBranchEnd && isImmediateParent ? Math.max(0, r.height - 3) : "100%",
                    }}
                    aria-hidden="true"
                  />
                );
              })}
              {childCount > 0 && !n.collapsed && depthIndent(r.depth + 1, view.width) - depthIndent(r.depth, view.width) >= (view.width < 600 ? 20 : 28) && (
                <span
                  className="indent-guide-line"
                  style={{
                    left: depthIndent(r.depth, view.width) + readingSize * .65,
                    top: "calc(var(--row-first-line) + 3px)",
                    bottom: 0,
                  }}
                  aria-hidden="true"
                />
              )}

              <span className={`outline-gutter ${childCount ? "has-disclosure" : ""}`}>
              {/* Anchor controls to this bullet's content, not the outer row. */}
              <button
                className="row-hover-more"
                style={{ left: childCount ? -50 : -28 }}
                aria-label="Bullet actions"
                title="Bullet actions · right-click also works"
                aria-haspopup="dialog"
                disabled={p.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  openMenu(n.id, e.currentTarget);
                }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="3" cy="9" r="1.5" fill="currentColor" /><circle cx="9" cy="9" r="1.5" fill="currentColor" /><circle cx="15" cy="9" r="1.5" fill="currentColor" /></svg>
              </button>

              {/* Triangle disclosure (Picture 2: ▸ collapsed / ▾ expanded) */}
              {childCount > 0 && (
                <button
                  className={`triangle-toggle ${n.collapsed ? "collapsed" : "expanded"}`}
                  style={{ left: -24 }}
                  aria-label={n.collapsed ? "Expand branch" : "Collapse branch"}
                  aria-expanded={!n.collapsed}
                  title={n.collapsed ? "Expand branch" : "Collapse branch"}
                  disabled={p.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    p.onToggle(n.id);
                  }}
                >
                  <svg className="branch-triangle" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1.5 8 5 3 8.5Z" fill="currentColor" /></svg>
                </button>
              )}

              </span>
              {/* Numbers replace the dot while retaining zoom and drag controls. */}
              <button
                className={`bullet-dot-btn ${n.listType === "ORDERED" ? "is-numbered" : ""} ${childCount > 0 ? "has-children" : "no-children"} ${childCount > 0 && n.collapsed ? "is-collapsed outer-slate" : "is-expanded"}`}
                aria-label="Zoom into bullet"
                title="Click to zoom; drag to move"
                disabled={p.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  if (didMoveBranch.current) return;
                  if(e.altKey&&p.onOpenPane){p.onOpenPane(n.id);return;}
                  p.onZoom(n.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  p.onZoom(n.id);
                }}
                onPointerDown={(e) => {
                  if (p.disabled || p.search || e.button !== 0) return;
                  e.preventDefault();
                  setDrag({
                    id: n.id,
                    x: e.clientX,
                    y: e.clientY,
                    target: null,
                    zone: "inside",
                    active: false,
                  });
                }}
              >
                {n.listType === "ORDERED" ? <span className="list-marker">{`${ordinals.get(n.id)}. `}</span> : ts?.question ? <span className={`tag-glyph tag-glyph-question ${ts.question === "answered" ? "is-answered" : ""}`} aria-hidden="true">{ts.question === "answered" ? "✓" : "?"}</span> : ts?.icon ? <span className="tag-glyph" aria-hidden="true">{ts.icon}</span> : <svg className="bullet-glyph" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <circle className="bullet-outer-circle" cx="10" cy="10" r="7.5" fill="none" />
                  <circle className="bullet-inner-dot" cx="10" cy="10" r="3" />
                </svg>}
              </button>

              {r.depth > 8 && <span className="outline-depth-badge" title={`Nesting level ${r.depth + 1}. Indentation is compressed; click the bullet to zoom into this branch.`}>L{r.depth + 1}</span>}
              {/* Hidden drag handle kept for fallback compatibility */}
              <button
                className="drag-handle icon-button visually-hidden-drag"
                aria-hidden="true"
                tabIndex={-1}
                disabled={p.disabled || !!p.search}
              >
                <Icon name="grip" size={14} />
              </button>

              {n.taskState === "NONE" && ts?.checkbox && (
                <input
                  className="tag-checkbox"
                  aria-label={(ts.checkbox.done ? "Mark not done: " : "Complete ") + n.text}
                  type="checkbox"
                  checked={ts.checkbox.done}
                  disabled={p.disabled}
                  onClick={e => e.stopPropagation()}
                  onChange={() => { const next = toggleTagCheckbox(n, markRanges, encodeMarks); if (next) (p.onEditorChange || p.onChange)(n.id, next); }}
                />
              )}
              {n.taskState !== "NONE" && (
                <input
                  aria-label={"Complete " + n.text}
                  type="checkbox"
                  checked={n.taskState === "DONE"}
                  disabled={p.disabled}
                  onChange={() => p.onTask(n.id)}
                />
              )}
              <div
                data-block-style={n.blockStyle || 'paragraph'}
                className={
                  "row-content " +
                  (n.codeLanguage ? "code-row" : "") +
                  (n.taskState === "DONE" ? " task-done" : "")
                }
              >
                {selected ? (
                  <BulletEditor
                    node={n}
                    caret={p.caret}
                    initialSelection={readerRange?.id === n.id ? readerRange : undefined}
                    onChange={p.onEditorChange || p.onChange}
                    readCurrentNode={p.readCurrentNode}
                    onCommand={p.onCommand}
                    onOutlinePaste={p.onOutlinePaste}
                    onImages={p.onImages}
                    onReady={p.onReady}
                    disabled={p.disabled}
                  />
                ) : (
                  <div
                    className="text-button"
                    role="button"
                    tabIndex={p.disabled ? -1 : 0}
                    aria-label={n.text || "Edit empty bullet"}
                    aria-disabled={p.disabled}
                    onKeyDown={e => {
                      if (!p.disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setReaderRange(n.blockStyle === 'divider' ? {id:n.id,anchor:n.text.length,head:n.text.length} : null); p.onEdit(n.id); }
                    }}
                    onClick={(e) => {
                      if (p.disabled || didDragSelect.current) return;
                      if (e.shiftKey && (selectionAnchor.current || selectedIds.size > 0)) {
                        const allRowIds = layout.map((rowItem: any) => rowItem.bullet.id);
                        const targetIdx = allRowIds.indexOf(n.id);
                        const lastSelectedId = selectionAnchor.current || Array.from(selectedIds)[0];
                        const lastIdx = allRowIds.indexOf(lastSelectedId);
                        if (targetIdx !== -1 && lastIdx !== -1) {
                          const min = Math.min(targetIdx, lastIdx);
                          const max = Math.max(targetIdx, lastIdx);
                          selectBranches(allRowIds.slice(min, max + 1));
                          p.onEdit(null);
                          return;
                        }
                      }
                      if (e.ctrlKey || e.metaKey) {
                        const roots = [...selectedRoots];
                        selectBranches(roots.includes(n.id) ? roots.filter(id => id !== n.id) : [...roots, n.id]);
                        selectionAnchor.current = n.id;
                        window.getSelection()?.removeAllRanges();
                        p.onEdit(null);
                        return;
                      }
                      if (selectedIds.size > 0) {
                        setSelectedIds(new Set());
                      }
                      selectionAnchor.current = n.id;
                      const source = e.currentTarget.querySelector<HTMLElement>('.bullet-read-source');
                      setReaderRange(n.blockStyle === 'divider' ? {id:n.id,anchor:n.text.length,head:n.text.length} : e.detail && source ? { id: n.id, ...readerSelection(source, e.clientX, e.clientY, n.text.length) } : null);
                      p.onEdit(n.id);
                    }}
                  >
                    {n.text || n.blockStyle === 'divider' ? (
                      <>
                        <span className="bullet-read-source"><RichRead node={n} search={p.search} /></span><span className="bullet-inline-media" onKeyDown={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>                {badges.get(n.id)?.has('image')&&<span className="bullet-media-indicator" title="Images in this branch" aria-label="Images in this branch"><Icon name="image" size={14}/></span>}
                {badges.get(n.id)?.has('youtube')&&<span className="bullet-media-indicator youtube-indicator" title="YouTube in this branch" aria-label="YouTube in this branch"><Icon name="youtube" size={15}/></span>}
                {badges.get(n.id)?.has('video')&&<span className="bullet-media-indicator" title="Videos in this branch" aria-label="Videos in this branch"><Icon name="play" size={14}/></span>}
                {mindmapBadges.get(n.id)&&<button className="bullet-mindmap-open" aria-label="Open mindmap" title="Open mindmap" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();p.onMindmap?.(mindmapBadges.get(n.id)![0]);}}><Icon name="mindmap" size={14}/></button>}
                {galleryContext?.doc.web.musicNodes?.[n.mirrorSourceId||n.id]&&<button className="bullet-music-play" aria-label={`Play music in ${n.text}`} title="Play music gallery" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();music?.play(musicItems(galleryContext.doc,n.mirrorSourceId||n.id));}}><Icon name="play" size={14}/></button>}
</span>
                        {n.dueDate && (
                          <span className="row-date-badge">
                            {formatDateBadge(n.dueDate)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="empty-bullet" />
                    )}
                  </div>
                )}
                <ReadingCitation id={n.mirrorSourceId||n.id}/>
                {!n.collapsed&&<MediaContent onEdit={p.disabled?undefined:()=>p.onEdit(n.id)} nodeId={n.mirrorSourceId||n.id} text={n.text} media={mediaByNode.get(n.mirrorSourceId||n.id) || []} assets={p.assets} onResize={p.disabled ? undefined : p.onResizeMedia} onOcclude={p.disabled ? undefined : p.onOccludeMedia} onRemove={p.disabled ? undefined : p.onRemoveMedia} />}
                {n.codeLanguage && (
                  <span className="code-label">{n.codeLanguage}</span>
                )}
              </div>
              <div className="row-end">

                <button
                  className="icon-button"
                  aria-label="Zoom into branch"
                  title="Zoom into branch"
                  onClick={() => p.onZoom(n.id)}
                >
                  <Icon name="link" size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Bullet actions"
                  title="Bullet actions"
                  disabled={p.disabled}
                  onClick={event => openMenu(n.id, event.currentTarget)}
                >
                  <Icon name="more" size={17} />
                </button>
              </div>
            </div>
          );
        })}
        {!p.search && (
          <div
            className="outline-add-row"
            style={{
              top: nextTop,
              paddingLeft: 0,
            }}
          >
            <button
              className="zoomed-plus-btn"
              title="Add bullet"
              data-tour="add-bullet" aria-label="Add bullet"
              disabled={p.disabled}
              onClick={(e) => {
                e.stopPropagation();
                p.onAdd?.(p.scope);
              }}
            >
              <span className="zoomed-plus-icon">+</span>
            </button>
          </div>
        )}
      </div>
      {selectedIds.size > 0 && (
        <div
          className="selection-action-bar"
          role="toolbar"
          aria-label="Selected bullets actions"
        >
          <span className="selection-count">
            {selectedRoots.length} bullet{selectedRoots.length === 1 ? "" : "s"} selected
          </span>
          <span className="separator" />
          <div className="selection-segment" role="group" aria-label="Selected list style">
            <button
              type="button"
              className="selection-btn"
              aria-pressed={allOrdered}
              title="Numbered list"
              aria-label="Numbered list"
              disabled={p.disabled}
              onClick={() => runOnSelection("list:ORDERED")}
            >
              <Icon name="numbered" size={15} />
            </button>
            <button
              type="button"
              className="selection-btn"
              aria-pressed={allUnordered}
              title="Bulleted list"
              aria-label="Bulleted list"
              disabled={p.disabled}
              onClick={() => runOnSelection("list:UNORDERED")}
            >
              <Icon name="notes" size={15} />
            </button>
            <button
              type="button"
              className="selection-btn"
              aria-pressed={allPlain}
              title="Plain text"
              aria-label="Plain text"
              disabled={p.disabled}
              onClick={() => runOnSelection("list:NONE")}
            >
              <Icon name="format" size={15} />
            </button>
          </div>
          <button
            type="button"
            className="selection-btn"
            title="Indent (Tab)"
            aria-label="Indent selected"
            disabled={p.disabled}
            onClick={() => runOnSelection("indent")}
          >
            <Icon name="indent" size={15} />
          </button>
          <button
            type="button"
            className="selection-btn"
            title="Outdent (Shift+Tab)"
            aria-label="Outdent selected"
            disabled={p.disabled}
            onClick={() => runOnSelection("outdent")}
          >
            <Icon name="outdent" size={15} />
          </button>
          <button
            type="button"
            className="selection-btn"
            aria-pressed={allTasks}
            title="Toggle task (Ctrl+Shift+9)"
            aria-label="Toggle task"
            disabled={p.disabled}
            onClick={() => runOnSelection("task:toggle")}
          >
            <Icon name="check" size={15} />
          </button>
          <span className="separator" />
          <button
            className="selection-btn"
            title="Copy (Ctrl+C)"
            aria-label="Copy selected"
            onClick={() => void copySelected()}
          >
            <Icon name="copy" size={14} />
            <span>Copy</span>
          </button>
          <button
            className="selection-btn"
            title="Cut (Ctrl+X)"
            aria-label="Cut selected"
            onClick={() => void cutSelected()}
          >
            <Icon name="cut" size={14} />
            <span>Cut</span>
          </button>
          <button
            className="selection-btn selection-btn-danger"
            title="Delete (Backspace)"
            aria-label="Delete selected"
            onClick={deleteSelected}
          >
            <Icon name="trash" size={14} />
            <span>Delete</span>
          </button>
          <button
            className="selection-btn"
            title="Deselect (Escape)"
            aria-label="Deselect"
            onClick={() => setSelectedIds(new Set())}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {drag?.active && (
        <div
          className="drag-badge"
          style={{
            left: Math.min(drag.x + 15, window.innerWidth - 180),
            top: drag.y + 15,
          }}
        >
          Move {drag.zone === "inside" ? "inside" : drag.zone} branch
        </div>
      )}
    </div>
  );
}
