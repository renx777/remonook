// The navigator beside Bookmarks and Bookshelf: the outline bullets your saved articles or books
// sit under, as folders (src/library-outline.mjs), plus a "Move to…" picker that moves an item's
// bullet in Notes.
import React, { useEffect, useMemo, useState } from 'react';
import type { Workspace } from './data';
import { libraryTree, LIBRARY_ID } from './library-outline.mjs';
import { notePath } from './relations.mjs';
import { index } from './domain.mjs';
import { Icon } from './icons';
import './library-navigator.css';

export type Folder = string | null; // null: everything; 'unsorted': not organized yet; else a bullet id
const plain = (t: string) => String(t || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

export function useLibraryTree(doc: Workspace, kind: 'bookmark' | 'book') {
  return useMemo(() => libraryTree(doc, kind), [doc.tables.bullets, doc.web.bookmarks, doc.web.readingBooks, doc.web.bookmarkNoteRoots, doc.web.readingNoteRoots, kind]);
}

export function LibraryNavigator({ doc, kind, folder, onFolder, onOpenNotes }: { doc: Workspace; kind: 'bookmark' | 'book'; folder: Folder; onFolder: (f: Folder) => void; onOpenNotes: (id: string) => void }) {
  const tree = useLibraryTree(doc, kind);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  // Open the chain of the selected folder.
  useEffect(() => { if (!folder || folder === 'unsorted') return; const chain: string[] = []; let f = tree.folders.get(folder); while (f) { chain.push(f.id); f = f.parentId ? tree.folders.get(f.parentId) : undefined; } setOpen(o => new Set([...o, ...chain])); }, [folder, tree]);
  const toggle = (id: string) => setOpen(o => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const row = (f: any, depth: number): React.ReactNode => {
    const kids = tree.children.get(f.id) || [], expanded = open.has(f.id);
    return <li key={f.id}>
      <div className="lib-nav-row" style={{ paddingLeft: 6 + depth * 16 }} aria-current={folder === f.id ? 'true' : undefined}>
        {kids.length ? <button className="lib-nav-toggle" aria-label={(expanded ? 'Collapse ' : 'Expand ') + f.title} aria-expanded={expanded} onClick={() => toggle(f.id)}><Icon name={expanded ? 'down' : 'forward'} size={13} /></button> : <span className="lib-nav-toggle" aria-hidden="true" />}
        <button className="lib-nav-name" onClick={() => onFolder(f.id)} onDoubleClick={() => onOpenNotes(f.id)}><span>{f.title}</span><small>{f.count}</small></button>
      </div>
      {expanded && kids.length > 0 && <ul>{kids.map((k: any) => row(k, depth + 1))}</ul>}
    </li>;
  };
  const top = tree.children.get(null) || [];
  return <nav className="lib-nav" aria-label={kind === 'bookmark' ? 'Bookmark folders from your notes' : 'Book folders from your notes'}>
    <button className="lib-nav-fixed" aria-current={folder === null ? 'true' : undefined} onClick={() => onFolder(null)}><span>All</span><small>{tree.visible.length}</small></button>
    <button className="lib-nav-fixed" aria-current={folder === 'unsorted' ? 'true' : undefined} onClick={() => onFolder('unsorted')}><span>Not organized yet</span><small>{tree.unsorted.length}</small></button>
    {top.length > 0 && <><div className="lib-nav-title">From your notes</div><ul className="lib-nav-tree">{top.map((f: any) => row(f, 0))}</ul></>}
    <p className="lib-nav-hint">These follow the bullets your {kind === 'bookmark' ? 'bookmarks' : 'books'} sit under in Notes. File one with <strong>Move to…</strong> or by moving its bullet in Notes, and this list follows.{doc.tables.bullets.some(n => n.id === LIBRARY_ID) ? <> Filed items you have not placed yet are in <button className="lib-nav-link" onClick={() => onOpenNotes(LIBRARY_ID)}>Library</button>.</> : null}</p>
  </nav>;
}

/** Picks the bullet to move an item under. */
export function MovePicker({ doc, title, exclude, onPick, onClose }: { doc: Workspace; title: string; exclude?: string | null; onPick: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState(''), ref = React.useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const idx = useMemo(() => index(doc.tables.bullets), [doc.tables.bullets]);
  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(), out: { id: string; label: string }[] = [];
    for (const n of doc.tables.bullets) {
      if (out.length >= 40) break;
      if (n.id === exclude || n.codeLanguage || n.blockStyle === 'divider') continue;
      const text = plain(n.text); if (!text) continue;
      if (q ? !text.toLocaleLowerCase().includes(q) : n.parentId !== null && n.parentId !== LIBRARY_ID) continue;
      const path = notePath(doc.tables.bullets, n.parentId, idx);
      out.push({ id: n.id, label: (path ? path + ' / ' : '') + text });
    }
    return out;
  }, [query, doc.tables.bullets, idx, exclude]);
  return <dialog ref={ref} className="lib-move" aria-label={'Move ' + title} onCancel={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}>
    <h2>Move “{title}” to…</h2>
    <input autoFocus placeholder="Find a bullet in your notes" aria-label="Find a bullet" value={query} onChange={e => setQuery(e.target.value)} />
    <ul>{results.map(r => <li key={r.id}><button onClick={() => onPick(r.id)}>{r.label}</button></li>)}
      {!results.length && <li className="lib-move-empty">{query ? 'No bullet matches.' : 'Type to find any bullet.'}</li>}</ul>
    <footer><button onClick={() => onPick(LIBRARY_ID)}>Back to Library</button><button onClick={onClose}>Cancel</button></footer>
  </dialog>;
}
