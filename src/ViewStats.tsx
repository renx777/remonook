// The ⓘ button in the top bar: statistics for the view you are in (like Bear's statistics panel).
// Notes: the bullets on screen (the zoomed bullet and below, or everything), with the kinds of
// bullets that used to show as counts on the filter chips. Bookmarks, Bookshelf and Calendar show
// their own figures.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Workspace } from './data';
import { Icon } from './icons';
import { useBackClose } from './back-stack';
import { textStats, notesInView, bookmarkStats, bookStats, calendarStats } from './view-stats.mjs';
import './view-stats.css';

type Props = { doc: Workspace; tab: string; scope: string | null; scopeTitle?: string; calendarDate: string; counts: Record<string, number>; kinds: [string, string, string?][] };
const n = (v: number) => v.toLocaleString();

export function ViewStats({ doc, tab, scope, scopeTitle, calendarDate, counts, kinds }: Props) {
  const [open, setOpen] = useState(false), box = useRef<HTMLDivElement>(null);
  useBackClose(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const body = useMemo(() => {
    if (!open) return null;
    const bullets = doc.tables.bullets;
    if (tab === 'bookmarks') { const s = bookmarkStats(doc); return { title: 'Bookmarks', tiles: [['Saved', s.saved], ['Unread', s.unread], ['Read', s.read], ['Highlights', s.highlights]] }; }
    if (tab === 'bookshelf') { const s = bookStats(doc); return { title: 'Bookshelf', tiles: [['Books', s.books], ['Pages read', s.read], ['Highlights', s.highlights]] }; }
    if (tab === 'calendar') {
      const s = calendarStats(bullets, calendarDate), month = new Date(calendarDate + 'T12:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      return { title: month, tiles: [['Entries', s.entries], ['Done', s.done]] };
    }
    const s = textStats(notesInView(bullets, tab === 'notes' ? scope : null));
    return {
      title: tab === 'notes' && scope ? scopeTitle || 'This page' : 'All notes',
      tiles: [['Words', s.words], ['Characters', s.characters], ['Bullets', s.bullets], ['Read time', s.readTime]],
      extra: [...(s.tasks ? [['Tasks done', `${n(s.done)} of ${n(s.tasks)}`]] : []), ...(tab === 'notes' ? kinds.filter(([k]) => k !== 'all' && counts[k]).map(([k, label, emoji]) => [`${emoji ? emoji + ' ' : ''}${label}`, n(counts[k])]) : [])] as [string, string][],
    };
  }, [open, doc, tab, scope, scopeTitle, calendarDate, counts, kinds]);
  return <div className="view-stats" ref={box}>
    <button className="icon-button" aria-label="Statistics" title="Statistics" aria-expanded={open} onClick={() => setOpen(v => !v)}><Icon name="info" size={17} /></button>
    {open && body && <div className="view-stats-pop" role="dialog" aria-label="Statistics">
      <h3>Statistics</h3>
      <p className="view-stats-scope">{body.title}</p>
      <div className="view-stats-grid">{body.tiles.map(([label, value]) => <div key={String(label)} className="view-stats-tile"><strong>{typeof value === 'number' ? n(value) : value}</strong><span>{label}</span></div>)}</div>
      {'extra' in body && body.extra && body.extra.length > 0 && <ul className="view-stats-list">{body.extra.map(([label, value]) => <li key={label}><span>{label}</span><strong>{value}</strong></li>)}</ul>}
    </div>}
  </div>;
}
