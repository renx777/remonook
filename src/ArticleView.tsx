// PARKED (2026-11-14): Article mode is not shown in the app for now. To bring it back, render
// <NotesBody article={...}> instead of <OutlineView> for a Notes pane in main.tsx and add an
// Outline / Article switch (see git history: commit 92d5228).
// Article mode: the bullets of the page you are on, read as one document. Top-level bullets that
// have children become section headings, the rest paragraphs; headings, quotes, code, dividers,
// tasks, flashcards and images keep their look. Tap any paragraph to edit it right there with the
// same editor as the outline (Enter adds the next paragraph, Backspace on an empty one removes it).
// Restructuring (moving and nesting) stays in the outline: one tap on Outline.
import React, { useMemo } from 'react';
import type { Node } from './data';
import { index } from './domain.mjs';
import { BulletEditor, RichRead } from './editor';
import { MediaContent } from './MediaContent';
import { OutlineView } from './OutlineView';
import { wordCount, readTime } from './view-stats.mjs';
import './article-view.css';

type OutlineProps = Parameters<typeof OutlineView>[0];

/** The Notes pane body: the outline, or the same bullets as an article. */
export function NotesBody(p: OutlineProps & { article?: boolean }) {
  const { article, ...rest } = p;
  return article ? <ArticleView {...rest} /> : <OutlineView {...rest} />;
}

const plain = (t: string) => String(t || '').replace(/<[^>]*>/g, '').trim();

export function ArticleView(p: OutlineProps) {
  const idx = useMemo(() => index(p.nodes), [p.nodes]);
  const visible = (n: Node) => p.showCompleted || n.taskState !== 'DONE';
  const kids = (id: string | null) => ((idx.children.get(id) || []) as Node[]).filter(visible);
  const mediaByNode = useMemo(() => { const m = new Map<string, any[]>(); for (const x of p.media) { const g = m.get(x.bulletId) || []; g.push(x); m.set(x.bulletId, g); } return m; }, [p.media]);
  const root = p.scope ? idx.byId.get(p.scope) as Node | undefined : undefined;
  const top = p.rootIds ? p.rootIds.map(id => idx.byId.get(id) as Node).filter(Boolean) : kids(p.scope);
  const sections = top.filter(n => kids(n.id).length && !n.blockStyle?.startsWith('h') && n.blockStyle !== 'divider');
  const words = useMemo(() => { let w = 0; const walk = (list: Node[]) => { for (const n of list) { w += wordCount(n.text); walk(kids(n.id)); } }; walk(top); return w; }, [top, p.nodes]);

  const text = (n: Node) => p.editing === n.id
    ? <BulletEditor node={n} caret={p.caret} onChange={p.onEditorChange || p.onChange} readCurrentNode={p.readCurrentNode} onCommand={p.onCommand} onOutlinePaste={p.onOutlinePaste} onImages={p.onImages} onReady={p.onReady} disabled={p.disabled} />
    : n.text ? <RichRead node={n} search={p.search} /> : <span className="article-empty">Empty bullet</span>;
  const edit = (n: Node) => (e: React.MouseEvent) => {
    if (p.disabled || p.editing === n.id) return;
    if ((e.target as HTMLElement).closest('a,button,input,video,audio,iframe,.media-content,.bullet-gallery')) return;
    p.onEdit(n.id);
  };
  const media = (n: Node) => { const list = mediaByNode.get(n.mirrorSourceId || n.id); return list?.length ? <MediaContent nodeId={n.mirrorSourceId || n.id} text={n.text} media={list} assets={p.assets} onEdit={p.disabled ? undefined : () => p.onEdit(n.id)} onResize={p.disabled ? undefined : p.onResizeMedia} onOcclude={p.disabled ? undefined : p.onOccludeMedia} onRemove={p.disabled ? undefined : p.onRemoveMedia} /> : null; };

  function block(n: Node, depth: number): React.ReactNode {
    const children = kids(n.id), editing = p.editing === n.id, common = { 'data-node-id': n.id, className: `article-block${editing ? ' is-editing' : ''}`, onClick: edit(n) };
    if (n.blockStyle === 'divider') return <hr key={n.id} {...common} />;
    if (n.kind === 'QUESTION') return <div key={n.id} {...common} className={common.className + ' article-card'}>
      <span className="article-card-label">Flashcard</span><div className="article-card-q">{text(n)}</div>{media(n)}
      {children.length > 0 && <div className="article-card-a">{children.map(c => block(c, depth + 1))}</div>}
    </div>;
    const heading = /^h[1-3]$/.test(n.blockStyle || '') ? Number(n.blockStyle![1]) + 1 : children.length && depth <= 2 ? depth + 1 : 0;
    let el: React.ReactNode;
    if (n.codeLanguage) el = <pre key={n.id} {...common} className={common.className + ' article-code'}>{editing ? text(n) : <code>{n.text}</code>}</pre>;
    else if (heading) el = React.createElement(`h${Math.min(4, heading)}`, { key: n.id, id: 'article-' + n.id, ...common }, text(n));
    else if (n.blockStyle === 'quote') el = <blockquote key={n.id} {...common}>{text(n)}</blockquote>;
    else if (n.taskState && n.taskState !== 'NONE') el = <div key={n.id} {...common} className={common.className + ' article-task' + (n.taskState === 'DONE' ? ' is-done' : '')}><input type="checkbox" aria-label={`Done: ${plain(n.text)}`} checked={n.taskState === 'DONE'} disabled={p.disabled} onClick={e => e.stopPropagation()} onChange={() => p.onTask(n.id)} /><span>{text(n)}</span></div>;
    else el = <p key={n.id} {...common}>{text(n)}</p>;
    return <React.Fragment key={n.id}>{el}{media(n)}{children.length > 0 && (heading ? children.map(c => block(c, depth + 1)) : <div className="article-nested">{children.map(c => block(c, depth + 1))}</div>)}</React.Fragment>;
  }

  return <div className="article-view">
    <article className="article-body" aria-label="Article">
      <header className="article-head">
        <h1 data-node-id={root?.id} onClick={root ? edit(root) : undefined} className={root && p.editing === root.id ? 'is-editing' : ''}>{root ? text(root) : 'My notes'}</h1>
        <p>{readTime(words)} read · {words.toLocaleString()} words · Tap a paragraph to edit it</p>
      </header>
      {top.length ? top.map(n => block(n, 1)) : <p className="article-empty">Nothing here yet. Switch to Outline to add bullets.</p>}
      {!p.disabled && p.onAdd && <button type="button" className="article-add" onClick={() => p.onAdd?.(p.scope)}>+ Add a paragraph</button>}
    </article>
    {sections.length > 1 && <nav className="article-toc" aria-label="On this page"><span>On this page</span>{sections.map(n => <a key={n.id} href={'#article-' + n.id} onClick={e => { e.preventDefault(); document.getElementById('article-' + n.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{plain(n.text) || 'Untitled'}</a>)}</nav>}
  </div>;
}
