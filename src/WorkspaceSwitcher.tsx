import React, { useEffect, useRef, useState } from 'react';
import { authenticatedUid, switchWorkspace } from './CloudAccount';
import { activeLocalWorkspace, createLocalWorkspace, deleteLocalWorkspace, localWorkspaces, renameLocalWorkspace, type LocalWorkspace } from './workspaces';
import './workspaces.css';

type Mode = { kind: 'menu' } | { kind: 'create' } | { kind: 'rename'; workspace: LocalWorkspace } | { kind: 'delete'; workspace: LocalWorkspace };

/** Sidebar control: the main workspace (synced when signed in) and device-only workspaces. */
export function WorkspaceSwitcher() {
  const active = activeLocalWorkspace(), signedIn = !!authenticatedUid();
  const [mode, setMode] = useState<Mode | null>(null), [name, setName] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mode) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setMode(null); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [mode]);
  const open = (next: Mode) => { setMode(next); setError(''); setName(next.kind === 'rename' ? next.workspace.name : ''); };
  const go = async (target: { local: string } | 'main') => { setBusy(true); try { await switchWorkspace(target); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); } };
  const mainLabel = signedIn ? 'Synced to your account' : 'On this device · not signed in';
  const list = localWorkspaces();
  return <div className="workspace-switcher" ref={box}>
    <button className="workspace-current" aria-haspopup="menu" aria-expanded={!!mode} onClick={() => mode ? setMode(null) : open({ kind: 'menu' })}>
      <span className="workspace-icon" aria-hidden="true">{active ? '💻' : signedIn ? '☁️' : '🏠'}</span>
      <span className="workspace-text"><strong>{active ? active.name : 'My notes'}</strong><small>{active ? 'This device only · never synced' : mainLabel}</small></span>
      <span className="workspace-chevron" aria-hidden="true">▾</span>
    </button>
    {mode && <div className="workspace-menu" role={mode.kind === 'menu' ? 'menu' : 'dialog'} aria-label="Workspaces">
      {mode.kind === 'menu' && <>
        <button role="menuitemradio" aria-checked={!active} disabled={busy} onClick={() => active ? void go('main') : setMode(null)}>
          <span aria-hidden="true">{signedIn ? '☁️' : '🏠'}</span><span><strong>My notes</strong><small>{mainLabel}</small></span>{!active && <span className="workspace-check">✓</span>}
        </button>
        {list.map(w => <button key={w.id} role="menuitemradio" aria-checked={active?.id === w.id} disabled={busy} onClick={() => active?.id === w.id ? setMode(null) : void go({ local: w.id })}>
          <span aria-hidden="true">💻</span><span><strong>{w.name}</strong><small>This device only</small></span>{active?.id === w.id && <span className="workspace-check">✓</span>}
        </button>)}
        <hr />
        <button role="menuitem" onClick={() => open({ kind: 'create' })}><span aria-hidden="true">＋</span><span>New device-only workspace</span></button>
        {active && <button role="menuitem" onClick={() => open({ kind: 'rename', workspace: active })}><span aria-hidden="true">✎</span><span>Rename “{active.name}”</span></button>}
        {active && <button role="menuitem" className="danger" onClick={() => open({ kind: 'delete', workspace: active })}><span aria-hidden="true">🗑</span><span>Delete “{active.name}”…</span></button>}
      </>}
      {mode.kind === 'create' && <form onSubmit={e => { e.preventDefault(); try { const w = createLocalWorkspace(name); void go({ local: w.id }); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } }}>
        <strong>New device-only workspace</strong>
        <p>A separate workspace stored only in this browser. It never syncs, so it is not on your other devices, and AI apps cannot reach it. Export backups from Settings.</p>
        <input autoFocus aria-label="Workspace name" placeholder="e.g. Private journal" value={name} maxLength={60} onChange={e => setName(e.target.value)} />
        {error && <p role="alert" className="workspace-error">{error}</p>}
        <div className="workspace-actions"><button type="button" onClick={() => open({ kind: 'menu' })}>Back</button><button type="submit" className="primary" disabled={busy || !name.trim()}>Create and open</button></div>
      </form>}
      {mode.kind === 'rename' && <form onSubmit={e => { e.preventDefault(); try { renameLocalWorkspace(mode.workspace.id, name); setMode(null); window.dispatchEvent(new Event('remo-workspaces')); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } }}>
        <strong>Rename workspace</strong>
        <input autoFocus aria-label="Workspace name" value={name} maxLength={60} onChange={e => setName(e.target.value)} />
        {error && <p role="alert" className="workspace-error">{error}</p>}
        <div className="workspace-actions"><button type="button" onClick={() => open({ kind: 'menu' })}>Back</button><button type="submit" className="primary" disabled={!name.trim()}>Rename</button></div>
      </form>}
      {mode.kind === 'delete' && <form onSubmit={e => { e.preventDefault(); if (name.trim() !== mode.workspace.name) return setError('Type the workspace name to confirm.'); setBusy(true); void deleteLocalWorkspace(mode.workspace.id).then(() => go('main')); }}>
        <strong>Delete “{mode.workspace.name}”?</strong>
        <p>Everything in this workspace is permanently removed from this device. It has no copy anywhere else. Export a backup from Settings first if you might need it.</p>
        <input autoFocus aria-label="Type the workspace name to confirm" placeholder={mode.workspace.name} value={name} onChange={e => setName(e.target.value)} />
        {error && <p role="alert" className="workspace-error">{error}</p>}
        <div className="workspace-actions"><button type="button" onClick={() => open({ kind: 'menu' })}>Back</button><button type="submit" className="danger" disabled={busy}>Delete permanently</button></div>
      </form>}
    </div>}
  </div>;
}
