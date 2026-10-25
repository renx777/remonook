import { useEffect, useMemo, useRef, useState } from 'react';
import type { RecordData } from './data';
import { Icon } from './icons';
import { AnimatedEmoji } from './AnimatedEmoji';
import { builtinEmojis } from './emoji-builtins.mjs';
import { getNotoEmoji, notoEmojis } from './noto-emojis.mjs';

export function EmojiPicker({ emojis, assets, disabled, onChoose, onImport }: { emojis: RecordData[]; assets: Map<string, Blob>; disabled: boolean; onChoose: (item: RecordData) => void | Promise<void>; onImport: (files: File[]) => Promise<void> }) {
  const [query, setQuery] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [playRequest, setPlayRequest] = useState(0), [hovered, setHovered] = useState('');
  const [source, setSource] = useState('noto'), [category, setCategory] = useState('All categories'), [page, setPage] = useState(0), [choosing, setChoosing] = useState(''), grid = useRef<HTMLDivElement>(null), pageSize = 48;
  const categories = useMemo(() => [...new Set(notoEmojis.map(item => item.category))], []);
  const all = useMemo<RecordData[]>(() => source === 'noto' ? notoEmojis : source === 'remo' ? builtinEmojis : emojis, [emojis, source]),
    matching = all.filter(item => (source !== 'noto' || category === 'All categories' || item.category === category) && [item.label, item.token, item.fallback, ...(item.tags || getNotoEmoji(item.token)?.tags || [])].filter(Boolean).join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => { setPage(0); }, [query, source, category]);
  useEffect(() => { if (grid.current) grid.current.scrollTop = 0; }, [page, query, source, category]);
  return <div className="emoji-picker">
    <p className="emoji-intro">A little expression for your notes. Choose an emoji to insert it.</p>
    <div className="emoji-sources" role="group" aria-label="Emoji collection">{[['noto', `Explore`], ['library', `My library · ${emojis.length}`], ['remo', 'RemoNook']].map(([value, label]) => <button key={value} aria-pressed={source === value} disabled={disabled || busy} onClick={() => { setSource(value); setError(''); }}>{label}</button>)}</div>
    <div className="emoji-search"><Icon name="search" size={17} /><input data-autofocus aria-label="Find an animated emoji" placeholder="Search smiles, celebrations, ideas…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label="Clear emoji search" onClick={() => setQuery('')}><Icon name="close" size={15} /></button>}</div>
    {source === 'noto' && <select className="emoji-category" aria-label="Emoji category" value={category} disabled={disabled || busy} onChange={event => setCategory(event.target.value)}><option>All categories</option>{categories.map(name => <option key={name}>{name}</option>)}</select>}
    <p className="emoji-result-count" role="status">{choosing ? `Saving ${choosing} for offline use…` : `${matching.length} emoji${matching.length === 1 ? '' : 's'}`}</p>
    <div ref={grid} className="emoji-grid" aria-label="Animated emojis" aria-busy={busy}>{matching.slice(page * pageSize, (page + 1) * pageSize).map(item => <button key={item.token} disabled={disabled || busy} aria-label={`Insert ${item.label || 'animated emoji'}`} title={item.label} onMouseEnter={() => setHovered(item.label || 'Emoji')} onFocus={() => setHovered(item.label || 'Emoji')} onClick={async () => { setBusy(true); setChoosing(item.label || 'emoji'); setError(''); try { await onChoose(item); } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setError(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); setChoosing(''); } }}><AnimatedEmoji item={item} data={item.data} blob={assets.get('emoji/' + item.fileName)} preview playRequest={playRequest} /><span className="emoji-tile-label">{item.label || 'Emoji'}</span>{assets.has('emoji/' + item.fileName) && <span className="emoji-saved" title="Available offline"><Icon name="check" size={10} /></span>}</button>)}</div>
    {!matching.length && <div className="emoji-empty"><Icon name="search" size={26} /><strong>No emojis found</strong><span>Try a simpler word or choose another collection.</span><button onClick={() => { setQuery(''); setCategory('All categories'); }}>Reset filters</button></div>}
    {matching.length > pageSize && <div className="emoji-pagination"><button disabled={disabled || busy || page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} / {Math.ceil(matching.length / pageSize)}</span><button disabled={disabled || busy || (page + 1) * pageSize >= matching.length} onClick={() => setPage(page + 1)}>Next</button></div>}
    <div className="emoji-preview-caption">{hovered || 'Hover or focus to see an emoji’s name'}</div>
    <div className="emoji-bottom-tools"><button className="study-text-button emoji-replay" disabled={disabled || busy || !matching.length} onClick={() => setPlayRequest(value => value + 1)}><Icon name="play" size={14} /> Replay</button>
    <label className="emoji-import"><Icon name="upload" size={14} />{busy ? 'Please wait…' : 'Import emojis'}<input type="file" aria-label="Import animated emoji files" accept=".json,.tgs,application/json,application/gzip" multiple disabled={disabled || busy} onChange={async event => {
      const files = [...(event.target.files || [])]; event.target.value = ''; if (!files.length) return;
      setBusy(true); setError('');
      try { await onImport(files); setSource('library'); setQuery(''); } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
      finally { setBusy(false); }
    }} /></label></div>
    {error && <p className="emoji-import-error" role="alert">{error}</p>}
    <details className="emoji-about"><summary>Offline use & credits</summary><p className="dialog-muted">Chosen emojis are saved on this device. First downloads need internet. Inserted at your selection, or at the end of the bullet.</p><p className="dialog-muted emoji-attribution">Noto artwork by Google · <a href="https://googlefonts.github.io/noto-emoji-animation/" target="_blank" rel="noreferrer">Source</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. Catalog previews and first downloads contact Google, never send note text, and are limited to visible items. Inserted emojis play from local files.</p>
    <p className="dialog-muted">Custom imports: .json/.tgs · up to 1 MB each · vector-only. Emoji motion follows Settings and reduced motion; Replay previews temporarily plays Noto previews for five seconds.</p></details>
  </div>;
}
