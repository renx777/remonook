// The desktop app's links to the open workspace: the folder copy (workspace-folder.ts), quick
// capture from the tray app (quick-capture.mjs) and local AI apps (local-mcp.ts). Nothing here
// runs on the website.
import { useEffect, useRef } from 'react';
import type { Workspace } from './data-store';
import { desktopInvoke, desktopListen, isApp, isDesktop } from './desktop';
import { activeLocalWorkspace, workspaceStorageName } from './workspaces';
import { startFolderMirror, flushFolder } from './workspace-folder';
import { handleLocalMcp } from './local-mcp';
import { startLocalSync } from './local-sync';

type Options = {
  ready: boolean;
  getDoc: () => Workspace | null;
  /** Records a change as an ordinary, undoable edit. */
  commit: (next: Workspace) => void;
  flush: () => Promise<unknown>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

export function useDesktop(options: Options) {
  const latest = useRef(options); latest.current = options;
  const { ready } = options;
  // Folder copy of a device-only workspace.
  useEffect(() => {
    const w = activeLocalWorkspace();
    if (!ready || !isDesktop() || !w?.folder) return;
    let lastError = '';
    return startFolderMirror(w, workspaceStorageName(w), {
      flush: () => latest.current.flush(),
      onError: message => { if (message && message !== lastError) latest.current.onError(message); lastError = message; },
    });
  }, [ready]);
  useEffect(() => {
    if (!ready || !isApp()) return;
    // Local sync runs for every synced workspace in the background, open or not.
    startLocalSync(() => {});
    // The rest (tray quit, quick capture, local AI apps) exists only in the desktop app.
    if (!isDesktop()) return;
    const apply = async (next: Workspace) => { latest.current.commit(next); await latest.current.flush(); };
    const workspaceName = () => activeLocalWorkspace()?.name || 'My notes';
    const stops = [
      // Quit from the tray: save what is pending (the app, then the folder copy) first.
      desktopListen('app-quit', async () => {
        try { await latest.current.flush(); await flushFolder(); } finally { await desktopInvoke('quit_app').catch(() => {}); }
      }),
      desktopListen<string>('quick-capture', async text => {
        const doc = latest.current.getDoc(); if (!doc) return;
        try {
          const { quickCapture } = await import('./quick-capture.mjs');
          const r = quickCapture(doc, text);
          await apply(r.doc);
          latest.current.onNotice(`Captured ${r.added} bullet${r.added === 1 ? '' : 's'} to Inbox.`);
        } catch (e) { latest.current.onError('Quick capture was not saved: ' + (e instanceof Error ? e.message : String(e))); }
      }),
      desktopListen<{ id: number; body: string }>('local-mcp', async ({ id, body }) => {
        const reply = await handleLocalMcp(body, { getDoc: latest.current.getDoc, apply, workspaceName }).catch(() => JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } }));
        await desktopInvoke('local_mcp_reply', { id, body: reply }).catch(() => {});
      }),
    ];
    // Tell the local AI server once requests can be answered (and not while the page reloads).
    void Promise.all(stops).then(() => desktopInvoke('local_mcp_ready', { ready: true })).catch(() => {});
    const unload = () => void desktopInvoke('local_mcp_ready', { ready: false }).catch(() => {});
    window.addEventListener('beforeunload', unload);
    return () => { unload(); window.removeEventListener('beforeunload', unload); for (const s of stops) void s.then(stop => stop()); };
  }, [ready]);
}
