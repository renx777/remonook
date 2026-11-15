// The sidebar's footer: one row with the sync status (click to sync now; amber or red only when
// something needs you), Trash, Settings and a Help menu (Show me how, shortcuts, guides, home).
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from './icons';
import { ago } from './SyncNow';
import { localSyncEngine } from './local-sync';
import { activeLocalWorkspace } from './workspaces';
import './sidebar-footer.css';

type Signal = { get: () => { status: string; error: string; at?: number }; subscribe: (fn: () => void) => () => void };

function SyncLine({ signal, signedIn, failed, onSync }: { signal: Signal; signedIn: boolean; failed: boolean; onSync: () => unknown }) {
  const state = useSyncExternalStore(signal.subscribe, signal.get, signal.get);
  const [, tick] = useState(0), [peerNote, setPeerNote] = useState('');
  useEffect(() => { const t = setInterval(() => tick(v => v + 1), 30000); return () => clearInterval(t); }, []);
  const local = activeLocalWorkspace();
  if (failed) return <span className="sync-line" data-state="error" role="status"><span className="sync-dot" />Not saved: open Settings</span>;
  if (local?.peerSync) return <button type="button" className="sync-line" data-state="ok" title="Ask your paired devices for their changes" onClick={async () => { const n = await localSyncEngine()?.resyncAll().catch(() => 0); setPeerNote(n ? 'Asked your devices' : 'No device nearby'); setTimeout(() => setPeerNote(''), 3000); }}><span className="sync-dot" />{peerNote || 'Syncs with your devices'}</button>;
  if (local) return <span className="sync-line" data-state="local"><span className="sync-dot" />{local.folder ? 'Folder on this computer' : 'This device only'}</span>;
  if (!signedIn) return <span className="sync-line" data-state="local"><span className="sync-dot" />On this device · not signed in</span>;
  const syncing = state.status === 'Syncing…' || state.status === 'Connecting…', ok = state.status === 'Synced' && !state.error;
  const label = state.error ? 'Sync problem: retry' : syncing ? 'Syncing…' : ok ? `Synced · ${ago(state.at || 0)}` : 'Changes waiting · sync now';
  return <button type="button" className="sync-line" data-state={state.error ? 'error' : ok ? 'ok' : 'pending'} disabled={syncing} title={state.error || 'Sync now'} onClick={() => void onSync()}><span className="sync-dot" />{label}</button>;
}

export function SidebarFooter({ signal, signedIn, failed, trashCount, onSync, onTrash, onSettings, onHelp, onShortcuts, onHome }: { signal: Signal; signedIn: boolean; failed: boolean; trashCount: number; onSync: () => unknown; onTrash: () => void; onSettings: () => void; onHelp: () => void; onShortcuts: () => void; onHome: () => void }) {
  const [help, setHelp] = useState(false), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!help) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setHelp(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setHelp(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [help]);
  const pick = (fn: () => void) => () => { setHelp(false); fn(); };
  return <div className="sidebar-bottom sidebar-footer">
    <SyncLine signal={signal} signedIn={signedIn} failed={failed} onSync={onSync} />
    <button type="button" className="sidebar-footer-icon" aria-label={trashCount ? `Trash, ${trashCount} items` : 'Trash'} title="Trash" onClick={onTrash}><Icon name="trash" size={16} />{trashCount > 0 && <span className="sidebar-footer-badge" aria-hidden="true">{trashCount > 99 ? '99+' : trashCount}</span>}</button>
    <button type="button" className="sidebar-footer-icon" aria-label="Settings" title="Settings and backups" onClick={onSettings}><Icon name="settings" size={16} /></button>
    <div className="sidebar-help" ref={box}>
      <button type="button" className="sidebar-footer-icon" aria-label="Help" title="Help" aria-expanded={help} onClick={() => setHelp(v => !v)}><Icon name="help" size={16} /></button>
      {help && <div className="sidebar-help-menu" role="menu" aria-label="Help">
        <button role="menuitem" data-guide-help onClick={pick(onHelp)}>Show me how</button>
        <button role="menuitem" onClick={pick(onShortcuts)}>Keyboard shortcuts</button>
        <a role="menuitem" href="/guides" target="_blank" rel="noopener noreferrer" onClick={() => setHelp(false)}>Guides &amp; tutorials</a>
        <button role="menuitem" onClick={pick(onHome)}>RemoNook home</button>
      </div>}
    </div>
  </div>;
}
