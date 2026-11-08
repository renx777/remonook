// Device-only workspaces: complete, separate workspaces stored only in this browser's
// IndexedDB. They never sync and never reach the server: when one is open the app runs with
// no cloud user, so the sync code is not started at all. The synced account (or the guest
// workspace when signed out) is the default "main" workspace.
//
// The registry and the active choice are per device (localStorage). Each workspace's data
// lives in its own databases, named from WORKSPACE_PREFIX + id.
export type LocalWorkspace = { id: string; name: string; createdAt: number };
const LIST = 'remo-local-workspaces', ACTIVE = 'remo-active-workspace';
export const WORKSPACE_PREFIX = 'remo-web-local-';
const ID = /^[a-z0-9]{8,32}$/;

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage unavailable */ } };
export const cleanName = (name: string) => String(name || '').replace(/\s+/g, ' ').trim().slice(0, 60);

export function localWorkspaces(): LocalWorkspace[] {
  try {
    const list = JSON.parse(read(LIST) || '[]');
    return Array.isArray(list) ? list.filter(w => w && ID.test(w.id) && typeof w.name === 'string' && cleanName(w.name)).map(w => ({ id: w.id, name: cleanName(w.name), createdAt: Number(w.createdAt) || 0 })) : [];
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

export function createLocalWorkspace(name: string): LocalWorkspace {
  const clean = cleanName(name); if (!clean) throw Error('Give the workspace a name.');
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16), workspace = { id, name: clean, createdAt: Date.now() };
  save([...localWorkspaces(), workspace]);
  return workspace;
}
export function renameLocalWorkspace(id: string, name: string) {
  const clean = cleanName(name); if (!clean) throw Error('Give the workspace a name.');
  save(localWorkspaces().map(w => w.id === id ? { ...w, name: clean } : w));
}
/** Chooses the workspace that opens next (the app reloads to open it). */
export function chooseWorkspace(target: { local: string } | 'main') {
  write(ACTIVE, target === 'main' ? null : 'local:' + target.local);
}
/** Permanently deletes a device-only workspace and everything stored for it on this device. */
export async function deleteLocalWorkspace(id: string) {
  const w = localWorkspaces().find(x => x.id === id); if (!w) return;
  save(localWorkspaces().filter(x => x.id !== id));
  if (read(ACTIVE) === 'local:' + id) chooseWorkspace('main');
  const name = workspaceStorageName(w);
  await Promise.all([name, name + '-articles'].map(db => new Promise<void>(resolve => {
    try { const r = indexedDB.deleteDatabase(db); r.onsuccess = r.onerror = r.onblocked = () => resolve(); } catch { resolve(); }
  })));
  try { for (const key of Object.keys(localStorage)) if (key.startsWith(name + ':')) localStorage.removeItem(key); } catch { /* storage unavailable */ }
}
/** Asks the browser not to clear this site's storage under pressure (device-only data has no other copy). */
export async function protectDeviceStorage(): Promise<boolean> {
  try { return (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false; } catch { return false; }
}
