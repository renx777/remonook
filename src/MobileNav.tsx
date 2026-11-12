// Phone bottom navigation: four main views and More, which opens the rest in a sheet. When a view
// from More is open, More shows its name, so where you are is always visible.
import React, { useState } from 'react';
import { Icon } from './icons';
import { useBackClose } from './back-stack';

const MAIN: [string, string, string][] = [['dashboard', 'Dashboard', 'dashboard'], ['notes', 'Notes', 'notes'], ['calendar', 'Calendar', 'calendar'], ['study', 'Study Desk', 'study']];
const MORE: [string, string, string][] = [['bookshelf', 'Bookshelf', 'study'], ['bookmarks', 'Bookmarks', 'link'], ['mindmap', 'Mindmap', 'mindmap']];

export function MobileNav({ tab, onTab }: { tab: string; onTab: (id: string) => void }) {
  const [more, setMore] = useState(false);
  useBackClose(more, () => setMore(false));
  const inMore = MORE.find(([id]) => id === tab);
  const go = (id: string) => { setMore(false); onTab(id); };
  return <>
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {MAIN.map(([id, label, icon]) => <button key={id} aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'nav-active' : ''} onClick={() => go(id)}><Icon name={icon} />{label}</button>)}
      <button aria-haspopup="menu" aria-expanded={more} aria-current={inMore ? 'page' : undefined} className={inMore ? 'nav-active' : ''} onClick={() => setMore(v => !v)}>
        <Icon name={inMore ? inMore[2] : 'more'} />{inMore ? inMore[1] : 'More'}
      </button>
    </nav>
    {more && <div className="mobile-more" onClick={e => { if (e.target === e.currentTarget) setMore(false); }}>
      <div className="mobile-more-sheet" role="menu" aria-label="More views">
        {MORE.map(([id, label, icon]) => <button key={id} role="menuitem" aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}><Icon name={icon} size={20} /><span>{label}</span></button>)}
      </div>
    </div>}
  </>;
}
