// The formatting bar for selected text while reading (articles, PDFs and EPUBs). It looks and
// behaves like the bar in Notes: a highlight button that uses the last colour (its arrow shows
// the colours), text colour where the content allows it, Add note, Copy and Search, with rarer
// actions under "More". Escape or clicking elsewhere closes it.
import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

export const READING_COLOURS = ['yellow', 'green', 'blue', 'rose'] as const;
type Colour = string;
type Props = {
  disabled: boolean;
  /** Highlight colour last used, and the colours offered. */
  highlight: Colour; colours?: readonly Colour[]; onHighlight: (c: Colour) => void;
  /** Text colour (articles only). */
  text?: Colour; onText?: (c: Colour) => void;
  onNote?: () => void; onCopy: () => Promise<void> | void; onSearch?: () => void; onExplain?: () => void;
  more?: { label: string; run: () => void }[];
  status?: string;
};

function Menu({ label, open, onToggle, children }: { label: string; open: boolean; onToggle: (v: boolean) => void; children: React.ReactNode }) {
  return <div className="reading-bar-menu" data-state={open ? 'open' : 'closed'}>
    <button className="reading-bar-chevron" aria-label={label} aria-expanded={open} onClick={() => onToggle(!open)}><Icon name="down" size={12} /></button>
    {open && <div className="reading-bar-pop" role="group" aria-label={label}>{children}</div>}
  </div>;
}

export function ReadingBar({ disabled, highlight, colours = READING_COLOURS, onHighlight, text, onText, onNote, onCopy, onSearch, onExplain, more = [], status }: Props) {
  const [open, setOpen] = useState<'' | 'highlight' | 'text' | 'more'>(''), [copied, setCopied] = useState('');
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(''); }; document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close); }, [open]);
  const toggle = (which: 'highlight' | 'text' | 'more') => (v: boolean) => setOpen(v ? which : '');
  const copy = async () => { try { await onCopy(); setCopied('Copied'); } catch { setCopied('Copy unavailable'); } setTimeout(() => setCopied(''), 1600); };
  return <div ref={root}>
    <div className="reading-bar" role="toolbar" aria-label="Passage formatting" onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(''); } }}>
      <button className="reading-bar-highlight" data-color={highlight} disabled={disabled} aria-label={`Highlight in ${highlight}`} title={`Highlight (${highlight})`} onClick={() => onHighlight(highlight)}><span>H</span></button>
      <Menu label="Highlight colours" open={open === 'highlight'} onToggle={toggle('highlight')}>
        {colours.map(c => <button key={c} className="reading-bar-swatch" data-color={c} aria-pressed={c === highlight} aria-label={`Highlight in ${c}`} disabled={disabled} onClick={() => { setOpen(''); onHighlight(c); }} />)}
      </Menu>
      {onText && text && <>
        <button className="reading-bar-text" data-color={text} disabled={disabled} aria-label={`Text colour ${text}`} title={`Text colour (${text})`} onClick={() => onText(text)}><span>A</span></button>
        <Menu label="Text colours" open={open === 'text'} onToggle={toggle('text')}>
          {colours.map(c => <button key={c} className="reading-bar-swatch is-text" data-color={c} aria-pressed={c === text} aria-label={`Text colour ${c}`} disabled={disabled} onClick={() => { setOpen(''); onText(c); }}>A</button>)}
        </Menu>
      </>}
      <span className="reading-bar-divider" aria-hidden="true" />
      {onNote && <button className="reading-bar-note" disabled={disabled} onClick={onNote}><Icon name="pencil" size={16} />Add note</button>}
      <button aria-label="Copy" title="Copy" onClick={() => void copy()}><Icon name="copy" size={17} /></button>
      {onExplain && <button aria-label="Explain with AI" title="Explain with AI" disabled={disabled} onClick={onExplain}><Icon name="star" size={17} /></button>}
      {onSearch && <button aria-label="Search the web" title="Search the web" onClick={onSearch}><Icon name="search" size={17} /></button>}
      {more.length > 0 && <div className="reading-bar-menu" data-state={open === 'more' ? 'open' : 'closed'}>
        <button aria-label="More" aria-expanded={open === 'more'} title="More" onClick={() => setOpen(open === 'more' ? '' : 'more')}><Icon name="more" size={17} /></button>
        {open === 'more' && <div className="reading-bar-pop is-list" role="menu">{more.map(m => <button key={m.label} role="menuitem" onClick={() => { setOpen(''); m.run(); }}>{m.label}</button>)}</div>}
      </div>}
    </div>
    {(copied || status) && <p className="reading-bar-status" role="status">{copied || status}</p>}
  </div>;
}
