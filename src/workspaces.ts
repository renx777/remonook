// Device-only workspaces: complete, separate workspaces stored only in this browser's
// IndexedDB. They never sync and never reach the server: when one is open the app runs with
// no cloud user, so the sync code is not started at all. The synced account (or the guest
// workspace when signed out) is the default "main" workspace.
//
// The registry and the active choice are per device (localStorage). Each workspace's data
// lives in its own databases, named from WORKSPACE_PREFIX + id.
/** `folder`: in the desktop app, the folder on this computer that keeps the workspace's copy.
 `peerSync`: in the desktop app, the workspace syncs with this person's paired devices. */
export type LocalWorkspace = { id: string; name: string; createdAt: number; folder?: string; peerSync?: boolean };
const LIST = 'remo-local-workspaces', ACTIVE = 'remo-active-workspace';
export const WORKSPACE_PREFIX = 'remo-web-local-';
const ID = /^[a-z0-9]{8,32}$/;

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage unavailable */ } };
export const cleanName = (name: string) => String(name || '').replace(/\s+/g, ' ').trim().slice(0, 60);

export function localWorkspaces(): LocalWorkspace[] {
  try {
    const list = JSON.parse(read(LIST) || '[]');
    return Array.isArray(list) ? list.filter(w => w && ID.test(w.id) && typeof w.name === 'string' && cleanName(w.name)).map(w => ({ id: w.id, name: cleanName(w.name), createdAt: Number(w.createdAt) || 0, ...(typeof w.folder === 'string' && w.folder ? { folder: w.folder } : {}), ...(w.peerSync === true ? { peerSync: true } : {}) })) : [];
  } catch { return []; }
}
const save = (list: LocalWorkspace[]) => write(LIST, JSON.stringify(list));

/** The open device-only workspace, or null when the main workspace is open. */
export function activeLocalWorkspace(): LocalWorkspace | null {
  const value = read(ACTIVE);
  if (!value?.startsWith('local:')) return null;
  return localWorkspaces().find(w => w.id === value.slice(6)) || null;
}
export const workspaceStorageName = (w: LocalWorkspace) => WORKSPACE_PREFIX + w.id;

export function createLocalWorkspace(name: string, folder?: string): LocalWorkspace {
  const clean = cleanName(name); if (!clean) throw Error('Give the workspace a name.');
  if (folder && localWorkspaces().some(w => w.folder === folder)) throw Error('That folder is already a workspace here.');
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16), workspace: LocalWorkspace = { id, name: clean, createdAt: Date.now(), ...(folder ? { folder } : {}) };
  save([...localWorkspaces(), workspace]);
  return workspace;
}
export function renameLocalWorkspace(id: string, name: string) {
  const clean = cleanName(name); if (!clean) throw Error('Give the workspace a name.');
  save(localWorkspaces().map(w => w.id === id ? { ...w, name: clean } : w));
}
/** Keeps (or stops keeping) a workspace's copy in a folder on this computer. */
export function setWorkspaceFolder(id: string, folder: string | null) {
  if (folder && localWorkspaces().some(w => w.folder === folder && w.id !== id)) throw Error('That folder is already a workspace here.');
  save(localWorkspaces().map(w => { if (w.id !== id) return w; const { folder: _, ...rest } = w; return folder ? { ...rest, folder } : rest; }));
}
const DECLINED = 'remo-local-sync-declined';
const declined = (): string[] => { try { const v = JSON.parse(read(DECLINED) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
/** Turns syncing with paired devices on or off for a workspace on this device. Turning it off
 also stops other devices from adding it here again. */
export function setWorkspacePeerSync(id: string, on: boolean) {
  save(localWorkspaces().map(w => { if (w.id !== id) return w; const { peerSync: _, ...rest } = w; return on ? { ...rest, peerSync: true } : rest; }));
  const list = declined().filter(x => x !== id);
  write(DECLINED, JSON.stringify(on ? list : [...list, id].slice(-200)));
}
/** A workspace another paired device syncs: added here under the same id (unless removed here before). */
export function addPeerWorkspace(id: string, name: string): LocalWorkspace | null {
  if (!ID.test(id) || declined().includes(id)) return null;
  const existing = localWorkspaces().find(w => w.id === id);
  if (existing) return existing.peerSync ? existing : null;
  const clean = cleanName(name) || 'Shared workspace', workspace: LocalWorkspace = { id, name: clean, createdAt: Date.now(), peerSync: true };
  save([...localWorkspaces(), workspace]);
  window.dispatchEvent(new Event('remo-workspaces'));
  return workspace;
}
/** Chooses the workspace that opens next (the app reloads to open it). */
export function chooseWorkspace(target: { local: string } | 'main') {
  write(ACTIVE, target === 'main' ? null : 'local:' + target.local);
}
/** Permanently deletes a device-only workspace and everything stored for it on this device. */
export async function deleteLocalWorkspace(id: string) {
  const w = localWorkspaces().find(x => x.id === id); if (!w) return;
  save(localWorkspaces().filter(x => x.id !== id));
  // A deleted synced workspace is not added back by other devices.
  if (w.peerSync) write(DECLINED, JSON.stringify([...declined().filter(x => x !== id), id].slice(-200)));
  if (read(ACTIVE) === 'local:' + id) chooseWorkspace('main');
  const name = workspaceStorageName(w);
  await Promise.all([name, name + '-articles', 'remo-books-local:'+name].map(db => new Promise<void>(resolve => {
    try { const r = indexedDB.deleteDatabase(db); r.onsuccess = r.onerror = r.onblocked = () => resolve(); } catch { resolve(); }
  })));
  try { for (const key of Object.keys(localStorage)) if (key.startsWith(name + ':')||key.startsWith('remo-reader-location:local:'+name+':')) localStorage.removeItem(key); } catch { /* storage unavailable */ }
}
/** Asks the browser not to clear this site's storage under pressure (device-only data has no other copy). */
export async function protectDeviceStorage(): Promise<boolean> {
  try { return (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false; } catch { return false; }
}
