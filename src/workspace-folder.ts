// Desktop app: a device-only workspace can keep its copy in a folder on this computer
// (src-tauri/src/folders.rs writes it). The app keeps working from its own storage as before;
// after each save the folder gets the whole workspace (`RemoNook workspace.json`), its
// attachments and a readable Markdown copy. When the folder's workspace file was changed
// elsewhere (a backup restored, the folder copied from another computer, a sync tool), the app
// opens that version; the version it replaces stays in the app's recovery copy.
import { desktopInvoke, isDesktop } from './desktop';
import { load, save, getAssets, onWorkspaceSaved, type Workspace } from './data-store';
import { type LocalWorkspace } from './workspaces';
import { localBookFiles, restoreLocalBook, isBookPath } from './local-books';
import { workspaceMarkdown } from './folder-markdown.mjs';

export const FOLDER_FORMAT = 'remonook-workspace';
type FolderFile = { format: string; version: number; name: string; saveId: string; savedAt: number; assetTypes: Record<string, string>; workspace: Workspace };
type Known = { stamp: string | null; saveId: string | null; revision?: number };
export type Picked = { path: string; name: string; existing: boolean };

const knownKey = (storage: string) => storage + ':folder';
const readKnown = (storage: string): Known => { try { const v = JSON.parse(localStorage.getItem(knownKey(storage)) || 'null'); return { stamp: v?.stamp ?? null, saveId: v?.saveId ?? null, revision: Number(v?.revision) || 0 }; } catch { return { stamp: null, saveId: null }; } };
const writeKnown = (storage: string, known: Known) => { try { localStorage.setItem(knownKey(storage), JSON.stringify(known)); } catch { /* storage unavailable */ } };
export const forgetFolder = (storage: string) => { try { localStorage.removeItem(knownKey(storage)); } catch { /* storage unavailable */ } };

/** Parses and checks a folder's workspace file. */
export function parseFolderFile(text: string): FolderFile {
  let v: any; try { v = JSON.parse(text); } catch { throw Error('The workspace file in this folder is damaged.'); }
  if (v?.format !== FOLDER_FORMAT) throw Error('This folder does not hold a RemoNook workspace.');
  if (v.version !== 1) throw Error('This workspace was saved by a newer RemoNook. Update the app to open it.');
  if (!v.workspace?.tables || !Array.isArray(v.workspace.tables.bullets) || typeof v.saveId !== 'string') throw Error('The workspace file in this folder is damaged.');
  return { ...v, name: String(v.name || ''), assetTypes: v.assetTypes && typeof v.assetTypes === 'object' ? v.assetTypes : {} };
}

const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',', 2)[1] || ''); r.onerror = () => reject(r.error); r.readAsDataURL(blob);
});
const fromBase64 = (data: string, type: string) => { const bin = atob(data), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new Blob([bytes], { type }); };

export const pickFolder = () => desktopInvoke<Picked | null>('folder_pick');
export const showFolder = (path: string) => desktopInvoke('folder_show', { path });
/** The workspace name saved in a folder, if it holds one. */
export async function folderWorkspaceName(path: string): Promise<string | null> {
  const r = await desktopInvoke<{ doc: string | null }>('folder_read', { path });
  return r.doc ? parseFolderFile(r.doc).name || null : null;
}

let importing = false;
/** Opens the folder's version when it differs from the last one this device wrote. Returns
 whether the app's copy was replaced. */
export async function importFromFolder(w: LocalWorkspace, storage: string): Promise<boolean> {
  if (!w.folder) return false;
  const r = await desktopInvoke<{ doc: string | null; stamp: string | null }>('folder_read', { path: w.folder });
  // An emptied folder is written again from the app's copy.
  if (!r.doc) { writeKnown(storage, { stamp: null, saveId: null }); return false; }
  const file = parseFolderFile(r.doc), known = readKnown(storage);
  if (file.saveId === known.saveId) { writeKnown(storage, { ...known, stamp: r.stamp }); return false; }
  const assets = new Map<string, Blob>();
  for (const path of await desktopInvoke<string[]>('folder_assets', { path: w.folder })) {
    const blob=fromBase64(await desktopInvoke<string>('folder_read_asset', { path: w.folder, asset: path }), file.assetTypes[path] || '');
    if(isBookPath(path))await restoreLocalBook(file.workspace,storage,path,blob);else assets.set(path,blob);
  }
  const current = await load(storage);
  const incoming: Workspace = { ...file.workspace, web: { ...file.workspace.web, ...(current?.web?.deviceId ? { deviceId: current.web.deviceId } : {}) } };
  importing = true;
  let saved: Workspace;
  try { saved = await save(current, incoming, 'folder import', assets, true, [], undefined, storage); }
  finally { importing = false; }
  writeKnown(storage, { stamp: r.stamp, saveId: file.saveId, revision: saved.revision });
  return true;
}

/** Keeps the folder up to date while the workspace is open. */
let flushMirror: () => Promise<void> = async () => {};
/** Writes any pending folder update now (before the app quits). */
export const flushFolder = () => flushMirror();
export function startFolderMirror(w: LocalWorkspace, storage: string, { flush, onError }: { flush: () => Promise<unknown>; onError: (message: string) => void }) {
  if (!isDesktop() || !w.folder) return () => {};
  const folder = w.folder;
  let timer: ReturnType<typeof setTimeout> | null = null, chain: Promise<void> = Promise.resolve(), written: Set<string> | null = null, reloading = false;
  const failed = (e: unknown) => onError(`Could not update the folder “${folder}”: ${e instanceof Error ? e.message : String(e)} Your notes are saved in the app; the folder is updated after the next change.`);
  const external = async () => {
    if (reloading) return; reloading = true;
    try {
      if (timer) { clearTimeout(timer); timer = null; }
      await flush();
      if (await importFromFolder(w, storage)) { location.reload(); return; }
      reloading = false; schedule();
      return;
    } catch (e) { failed(e); }
    reloading = false;
  };
  const write = async () => {
    if (reloading) return;
    try {
      written ||= new Set(await desktopInvoke<string[]>('folder_assets', { path: folder }));
      const [doc, assets] = await Promise.all([load(storage), getAssets(storage)]);
      if (!doc) return;
      for(const [path,blob] of await localBookFiles(doc,storage))assets.set(path,blob);
      const saveId = crypto.randomUUID(), assetTypes: Record<string, string> = {};
      for (const [path, blob] of assets) if (blob.type) assetTypes[path] = blob.type;
      const file: FolderFile = { format: FOLDER_FORMAT, version: 1, name: w.name, saveId, savedAt: Date.now(), assetTypes, workspace: doc };
      const add: [string, string][] = [];
      for (const [path, blob] of assets) if (!written.has(path)) add.push([path, await toBase64(blob)]);
      const remove = [...written].filter(p => !assets.has(p));
      const stamp = await desktopInvoke<string>('folder_write', { path: folder, write: { doc: JSON.stringify(file), expect: readKnown(storage).stamp, markdown: workspaceMarkdown(doc), assets: add, remove_assets: remove } });
      for (const [p] of add) written.add(p); for (const p of remove) written.delete(p);
      writeKnown(storage, { stamp, saveId, revision: doc.revision });
      onError('');
    } catch (e) {
      if (e instanceof Error && e.message === 'CHANGED') return void external();
      failed(e);
    }
  };
  const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; chain = chain.then(write); }, 1200); };
  flushMirror = async () => { if (timer) { clearTimeout(timer); timer = null; chain = chain.then(write); } await chain; };
  onWorkspaceSaved(account => { if (account === storage && !importing) schedule(); });
  // Write now when the folder is empty or behind the app (for example the app quit just after
  // an edit, before the folder was updated).
  void Promise.all([desktopInvoke<string | null>('folder_stamp', { path: folder }), load(storage)]).then(([stamp, doc]) => {
    const known = readKnown(storage);
    if (!stamp || !known.saveId || (doc && doc.revision !== known.revision)) schedule();
  }).catch(failed);
  // Changes made elsewhere are picked up when the window comes back to the front.
  const focus = () => { void desktopInvoke<string | null>('folder_stamp', { path: folder }).then(stamp => { if (stamp && stamp !== readKnown(storage).stamp) void external(); }).catch(() => {}); };
  const books=(event:Event)=>{if((event as CustomEvent).detail===storage)schedule();};
  window.addEventListener('remo-local-books',books);
  window.addEventListener('focus', focus);
  return () => { window.removeEventListener('remo-local-books',books);onWorkspaceSaved(null); flushMirror = async () => {}; window.removeEventListener('focus', focus); if (timer) clearTimeout(timer); };
}
