import { useEffect, useId, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import type { RecordData } from './data';
import { Icon } from './icons';
import { AnimatedEmoji, useEmojiLibrary } from './AnimatedEmoji';
import { catalogEmojis, emojiCollection, emojiCollectionLabel, collectionFilters } from './emoji-catalog.mjs';
import {useEmojiCollection} from './useEmojiCollection';
import { builtinEmojis } from './emoji-builtins.mjs';
import { emojiQuery, emojiSuggestions } from './emoji-suggestions.mjs';

export function InlineEmojiPicker({ editor, nodeId, enabled, keyHandler }: { editor: Editor; nodeId: string; enabled: boolean; keyHandler: MutableRefObject<((event: KeyboardEvent) => boolean) | null> }) {
  const { emojis, assets, onInsert } = useEmojiLibrary(), listId = useId();
  const [collection,setCollection] = useEmojiCollection();
  const [query, setQuery] = useState<ReturnType<typeof emojiQuery>>(null), [active, setActive] = useState(0), [position, setPosition] = useState({ left: 0, top: 0, height: 320 }), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dismissed = useRef(''), lastQuery = useRef(''), pending = useRef(false), mounted = useRef(true), popup = useRef<HTMLDivElement>(null);
  const items = useMemo(() => {
    const catalog = new Map(catalogEmojis.map(item => [item.token, item]));
    return [...new Map([...catalogEmojis, ...builtinEmojis, ...emojis.values()].map(item => [item.token, { ...item, ...catalog.get(item.token) }])).values()].filter(item=>collection==='all'||emojiCollection(item)==='custom'||emojiCollection(item)===collection);
  }, [emojis,collection]);
  const matches: RecordData[] = useMemo(() => query ? emojiSuggestions(items, query.query) : [], [items, query]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const update = () => {
      if (pending.current) return;
      const { from, to, $from } = editor.state.selection;
      const next = enabled && onInsert && editor.isFocused && from === to && !editor.isActive('code') ? emojiQuery($from.parent.textBetween(0, $from.parentOffset, '\n'), $from.parentOffset) : null;
      const identity = next ? `${next.start}:${next.end}:${next.query}` : '';
      if (!next || dismissed.current === identity) { setQuery(null); return; }
      // The outline editor contains one paragraph, so offsets match persisted UTF-16 ranges.
      setQuery(previous => previous?.start === next.start && previous?.end === next.end && previous?.query === next.query ? previous : next);
      try {
        const caret = editor.view.coordsAtPos(from), width = Math.min(296, window.innerWidth - 16), below = window.innerHeight - caret.bottom - 12, above = caret.top - 12;
        const desired = Math.min(420, 170 + Math.ceil(Math.max(1, emojiSuggestions(items, next.query).length) / 4) * 69 + (error ? 72 : 0));
        const placeBelow = below >= desired || below >= above, height = Math.max(60, Math.min(desired, placeBelow ? below : above));
        setPosition({ left: Math.max(8, Math.min(caret.left, window.innerWidth - width - 8)), top: placeBelow ? caret.bottom + 6 : Math.max(8, caret.top - height - 6), height });
      } catch { /* A detached editor cannot provide a caret rectangle. */ }
    };
    const blur = () => { if (!pending.current) setQuery(null); };
    editor.on('transaction', update); editor.on('focus', update); editor.on('blur', blur);
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true); update();
    return () => { editor.off('transaction', update); editor.off('focus', update); editor.off('blur', blur); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [editor, enabled, onInsert, items, error]);
  useEffect(() => {
    if (!query) return;
    const identity = `${query.start}:${query.query}`;
    if (lastQuery.current !== identity) { lastQuery.current = identity; setActive(0); setError(''); }
  }, [query?.query, query?.start,collection]);
  useEffect(() => { popup.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }); }, [active]);
  const dismiss = () => { if (query) dismissed.current = `${query.start}:${query.end}:${query.query}`; setQuery(null); };
  const choose = async (item: RecordData) => {
    if (!query || pending.current || !onInsert) return;
    const selection = query; pending.current = true; setBusy(true); setError('');
    try { await onInsert(item, nodeId, selection.start, selection.end); if (mounted.current) dismiss(); }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Could not insert emoji. Try again.'); }
    finally { pending.current = false; if (mounted.current && !editor.isDestroyed) { setBusy(false); editor.commands.focus(); } }
  };
  keyHandler.current = event => {
    if (!query || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false;
    if (busy && ['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return true;
    if (event.key === 'Escape') { dismiss(); return true; }
    if (matches.length && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) { setActive(value => (value + (event.key === 'ArrowDown' ? 4 : event.key === 'ArrowUp' ? -4 : event.key === 'ArrowRight' ? 1 : -1) + matches.length) % matches.length); return true; }
    if (matches.length && !event.shiftKey && ['Enter', 'Tab'].includes(event.key)) { void choose(matches[Math.min(active, matches.length - 1)]); return true; }
    return false;
  };
  useEffect(() => () => { keyHandler.current = null; }, [keyHandler]);
  useEffect(() => {
    const dom = editor.view.dom;
    if (query) { dom.setAttribute('aria-controls', listId); dom.setAttribute('aria-expanded', 'true'); dom.setAttribute('aria-autocomplete', 'list'); if (matches.length) dom.setAttribute('aria-activedescendant', `${listId}-${Math.min(active, matches.length - 1)}`); else dom.removeAttribute('aria-activedescendant'); }
    else { dom.removeAttribute('aria-controls'); dom.removeAttribute('aria-expanded'); dom.removeAttribute('aria-autocomplete'); dom.removeAttribute('aria-activedescendant'); }
  }, [editor, query, active, matches, listId]);
  if (!query) return null;
  return createPortal(<div ref={popup} className="inline-emoji-picker" style={{ left: position.left, top: position.top, maxHeight: position.height }} onPointerDown={event => event.stopPropagation()} onMouseDown={event => { event.preventDefault(); event.stopPropagation(); }}>
    <div className="inline-emoji-heading"><span><Icon name="emoji" size={16} /> Emojis</span><button type="button" className="inline-emoji-close" aria-label="Close emoji suggestions" disabled={busy} onClick={dismiss}><Icon name="close" size={14} /></button></div>
    <div className="emoji-collection-filters" role="group" aria-label="Emoji artwork collection">{collectionFilters.map(([value,label])=><button type="button" key={value} aria-pressed={collection===value} disabled={busy} onClick={()=>{setCollection(value);setActive(0);setError('');}}>{label}</button>)}</div>
    <div className="inline-emoji-query"><span>{query.query ? `:${query.query}` : 'Type a name to find an emoji'}</span><small>{matches.length} suggestions</small></div>
    <div role="listbox" id={listId} aria-label="Emoji suggestions" aria-busy={busy}>{matches.map((item, index) => <button type="button" role="option" id={`${listId}-${index}`} key={item.token} aria-selected={active === index} aria-label={`${item.label} · ${emojiCollectionLabel(item)}`} title={`${item.label} · ${emojiCollectionLabel(item)}`} disabled={busy} tabIndex={-1} onMouseEnter={() => setActive(index)} onClick={() => void choose(item)}><AnimatedEmoji item={item} blob={assets.get('emoji/' + item.fileName)} data={item.data} preview /><span className="inline-emoji-label">{item.label}</span><small className="inline-emoji-collection">{emojiCollection(item)==='fluent'?'Fluent':emojiCollection(item)==='noto'?'Noto':'Custom'}</small>{assets.has('emoji/' + item.fileName) && <small className="inline-emoji-offline" title="Saved offline"><Icon name="check" size={10} /></small>}</button>)}</div>
    {!matches.length && <p>No emojis found. Keep typing or press Escape.</p>}
    {error && <p role="alert" className="emoji-import-error">{error}</p>}
    <div className="inline-emoji-selection" role="status">{busy ? 'Saving for offline use…' : matches.length ? `${matches[Math.min(active, matches.length - 1)].label} · ${emojiCollectionLabel(matches[Math.min(active, matches.length - 1)])}` : 'Try another name'}</div>
    <footer><span>↑↓←→ browse · ↵ insert · Esc close</span><small>Google Noto · Microsoft Fluent · first use needs internet</small></footer>
  </div>, editor.view.dom.closest('.app') || document.body);
}
