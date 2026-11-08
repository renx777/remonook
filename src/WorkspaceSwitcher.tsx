import React, { useEffect, useRef, useState } from 'react';
import { authenticatedUid, switchWorkspace } from './CloudAccount';
import { activeLocalWorkspace, createLocalWorkspace, deleteLocalWorkspace, localWorkspaces, renameLocalWorkspace, setWorkspaceFolder, workspaceStorageName, type LocalWorkspace } from './workspaces';
import { isDesktop } from './desktop';
import { pickFolder, folderWorkspaceName, showFolder, forgetFolder } from './workspace-folder';
import './workspaces.css';

type Mode = { kind: 'menu' } | { kind: 'create'; folder?: boolean } | { kind: 'unfolder'; workspace: LocalWorkspace } | { kind: 'rename'; workspace: LocalWorkspace } | { kind: 'delete'; workspace: LocalWorkspace };

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
  const fail = (e: unknown) => { setError(e instanceof Error ? e.message : String(e)); setBusy(false); };
  const folderLabel = (w: LocalWorkspace) => w.folder ? 'Folder · ' + w.folder.split(/[\\/]/).filter(Boolean).pop() : 'This device only';
  // Desktop: open a folder that already holds a RemoNook workspace (a backup, another computer's copy).
  const openFolder = async () => {
    setError('');
    try {
      const picked = await pickFolder(); if (!picked) return;
      const known = localWorkspaces().find(w => w.folder === picked.path);
      if (known) return void go({ local: known.id });
      if (!picked.existing) throw Error('That folder has no RemoNook workspace yet. To start one there, choose New workspace in a folder.');
      setBusy(true);
      const w = createLocalWorkspace((await folderWorkspaceName(picked.path)) || picked.name || 'Folder workspace', picked.path);
      await go({ local: w.id });
    } catch (e) { fail(e); }
  };
  const emptyFolder = async () => {
    const picked = await pickFolder(); if (!picked) return null;
    if (picked.existing) throw Error('That folder already holds a RemoNook workspace. Choose Open a workspace folder to use it, or pick an empty folder.');
    return picked.path;
  };
  const mainLabel = signedIn ? 'Synced to your account' : 'On this device · not signed in';
  const list = localWorkspaces();
  return <div className="workspace-switcher" ref={box}>
    <button className="workspace-current" aria-haspopup="menu" aria-expanded={!!mode} onClick={() => mode ? setMode(null) : open({ kind: 'menu' })}>
      <span className="workspace-icon" aria-hidden="true">{active ? '💻' : signedIn ? '☁️' : '🏠'}</span>
      <span className="workspace-text"><strong>{active ? active.name : 'My notes'}</strong><small>{active ? (active.folder ? folderLabel(active) + ' · never synced' : 'This device only · never synced') : mainLabel}</small></span>
      <span className="workspace-chevron" aria-hidden="true">▾</span>
    </button>
    {mode && <div className="workspace-menu" role={mode.kind === 'menu' ? 'menu' : 'dialog'} aria-label="Workspaces">
      {mode.kind === 'menu' && <>
        <button role="menuitemradio" aria-checked={!active} disabled={busy} onClick={() => active ? void go('main') : setMode(null)}>
          <span aria-hidden="true">{signedIn ? '☁️' : '🏠'}</span><span><strong>My notes</strong><small>{mainLabel}</small></span>{!active && <span className="workspace-check">✓</span>}
        </button>
        {list.map(w => <button key={w.id} role="menuitemradio" aria-checked={active?.id === w.id} disabled={busy} onClick={() => active?.id === w.id ? setMode(null) : void go({ local: w.id })}>
          <span aria-hidden="true">{w.folder ? '📁' : '💻'}</span><span><strong>{w.name}</strong><small>{folderLabel(w)}</small></span>{active?.id === w.id && <span className="workspace-check">✓</span>}
        </button>)}
        <hr />
        <button role="menuitem" onClick={() => open({ kind: 'create' })}><span aria-hidden="true">＋</span><span>New device-only workspace</span></button>
        {isDesktop() && <button role="menuitem" onClick={() => open({ kind: 'create', folder: true })}><span aria-hidden="true">📁</span><span>New workspace in a folder…</span></button>}
        {isDesktop() && <button role="menuitem" disabled={busy} onClick={() => void openFolder()}><span aria-hidden="true">📂</span><span>Open a workspace folder…</span></button>}
        {isDesktop() && active && !active.folder && <button role="menuitem" disabled={busy} onClick={async () => { try { const path = await emptyFolder(); if (!path) return; setWorkspaceFolder(active.id, path); forgetFolder(workspaceStorageName(active)); await go({ local: active.id }); } catch (e) { fail(e); } }}><span aria-hidden="true">📁</span><span>Keep “{active.name}” in a folder…</span></button>}
        {isDesktop() && active?.folder && <button role="menuitem" onClick={() => void showFolder(active.folder!).catch(fail)}><span aria-hidden="true">📂</span><span>Show folder</span></button>}
        {isDesktop() && active?.folder && <button role="menuitem" onClick={() => open({ kind: 'unfolder', workspace: active })}><span aria-hidden="true">⏏</span><span>Stop using the folder…</span></button>}
        {error && <p role="alert" className="workspace-error">{error}</p>}
        {active && <button role="menuitem" onClick={() => open({ kind: 'rename', workspace: active })}><span aria-hidden="true">✎</span><span>Rename “{active.name}”</span></button>}
        {active && <button role="menuitem" className="danger" onClick={() => open({ kind: 'delete', workspace: active })}><span aria-hidden="true">🗑</span><span>Delete “{active.name}”…</span></button>}
      </>}
      {mode.kind === 'create' && <form onSubmit={async e => { e.preventDefault(); try { if (!name.trim()) return; const path = mode.folder ? await emptyFolder() : undefined; if (mode.folder && !path) return; const w = createLocalWorkspace(name, path || undefined); void go({ local: w.id }); } catch (err) { fail(err); } }}>
        <strong>{mode.folder ? 'New workspace in a folder' : 'New device-only workspace'}</strong>
        {mode.folder
          ? <p>A separate workspace kept in a folder you choose on this computer, with a readable Markdown copy of your notes. It never syncs to RemoNook cloud. You can back the folder up or copy it to another computer.</p>
          : <p>A separate workspace stored only {isDesktop() ? 'in this app' : 'in this browser'}. It never syncs, so it is not on your other devices{isDesktop() ? '' : ', and AI apps cannot reach it'}. Export backups from Settings.</p>}
        <input autoFocus aria-label="Workspace name" placeholder="e.g. Private journal" value={name} maxLength={60} onChange={e => setName(e.target.value)} />
        {error && <p role="alert" className="workspace-error">{error}</p>}
        <div className="workspace-actions"><button type="button" onClick={() => open({ kind: 'menu' })}>Back</button><button type="submit" className="primary" disabled={busy || !name.trim()}>{mode.folder ? 'Choose folder…' : 'Create and open'}</button></div>
      </form>}
      {mode.kind === 'rename' && <form onSubmit={e => { e.preventDefault(); try { renameLocalWorkspace(mode.workspace.id, name); setMode(null); window.dispatchEvent(new Event('remo-workspaces')); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } }}>
        <strong>Rename workspace</strong>
        <input autoFocus aria-label="Workspace name" value={name} maxLength={60} onChange={e => setName(e.target.value)} />
        {error && <p role="alert" className="workspace-error">{error}</p>}
        <div className="workspace-actions"><button type="button" onClick={() => open({ kind: 'menu' })}>Back</button><button type="submit" className="primary" disabled={!name.trim()}>Rename</button></div>
      </form>}
      {mode.kind === 'unfolder' && <form onSubmit={e => { e.preventDefault(); try { setWorkspaceFolder(mode.workspace.id, null); forgetFolder(workspaceStorageName(mode.workspace)); void go({ local: mode.workspace.id }); } catch (err) { fail(err); } }}>
        <strong>Stop using the folder?</strong>
        <p>“{mode.workspace.name}” stays in this app as a device-only workspace. The folder keeps the copy it has now but is no longer updated.</p>
        <div className="workspace-actions"><button type="button" onClick={() => open({ kind: 'menu' })}>Back</button><button type="submit" className="primary">Stop using it</button></div>
      </form>}
      {mode.kind === 'delete' && <form onSubmit={e => { e.preventDefault(); if (name.trim() !== mode.workspace.name) return setError('Type the workspace name to confirm.'); setBusy(true); void deleteLocalWorkspace(mode.workspace.id).then(() => go('main')); }}>
        <strong>Delete “{mode.workspace.name}”?</strong>
        <p>{mode.workspace.folder ? 'This workspace is removed from the app. Its folder on this computer is kept, so you can open it again later.' : 'Everything in this workspace is permanently removed from this device. It has no copy anywhere else. Export a backup from Settings first if you might need it.'}</p>
        <input autoFocus aria-label="Type the workspace name to confirm" placeholder={mode.workspace.name} value={name} onChange={e => setName(e.target.value)} />
        {error && <p role="alert" className="workspace-error">{error}</p>}
        <div className="workspace-actions"><button type="button" onClick={() => open({ kind: 'menu' })}>Back</button><button type="submit" className="danger" disabled={busy}>Delete permanently</button></div>
      </form>}
    </div>}
  </div>;
}
