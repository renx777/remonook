import {localBookFiles,localBookManifest,restoreLocalBook,isBookPath} from './local-books';
// Local sync (desktop app): workspaces marked "Sync with my devices" sync directly with this
// person's paired devices on the same network. src-tauri/src/local_sync.rs pairs devices, finds
// them and carries encrypted messages; this engine decides what to send.
//
// Each device keeps its complete copy of a workspace as bucketed CRDT states (the same format as
// sync v3). Devices exchange per-bucket state vectors ("hello") and send each other only the
// updates the other lacks ("updates"), so edits made anywhere merge automatically, in any order,
// through any device that relays them. Attachments travel by content hash ("want" / "asset").
// Every synced workspace syncs in the background; the open one is also applied to the editor
// (useLocalSync below), through the same path as cloud sync.
import { useEffect, useRef } from 'react';
import { syncOperation, load, save, empty, getAssets, putAssets, digest, type Workspace } from './data-store';
import { lacks, validVectors } from './sync-peer.mjs';
import { isBucket } from './sync-buckets.mjs';
import { activeLocalWorkspace, addPeerWorkspace, localWorkspaces, workspaceStorageName } from './workspaces';
import { desktopInvoke, desktopListen, isDesktop } from './desktop';

export type Transport = { send: (peer: string, data: string) => Promise<void> };
type Asset = { path: string; hash: string; size: number; type: string };
type Synced = { id: string; name: string; storage: string };
type Msg =
  | { t: 'workspaces'; list: { id: string; name: string }[] }
  | { t: 'hello'; ws: string; vectors: Record<string, string> }
  | { t: 'updates'; ws: string; updates: Record<string, string> }
  | { t: 'want'; ws: string; hashes: string[] }
  | { t: 'asset'; ws: string; hash: string; type: string; data: string };

const WS_ID = /^[a-z0-9]{8,32}$/, HASH = /^[a-f0-9]{64}$/;
const BATCH = 4 * 1024 * 1024, ASSET_LIMIT = 64 * 1024 * 1024;

const hashes = new WeakMap<Blob, string>();
async function hashOf(blob: Blob) { let h = hashes.get(blob); if (!h) { h = await digest(await blob.arrayBuffer()); hashes.set(blob, h); } return h; }
/** The attachment list in the form sync records it. */
export async function manifest(files: Map<string, Blob>): Promise<Asset[]> {
  const out: Asset[] = [];
  for (const [path, blob] of files) out.push({ path, hash: await hashOf(blob), size: blob.size, type: blob.type });
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
const toBase64 = async (blob: Blob) => { const bytes = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); };
const fromBase64 = (data: string, type: string) => { const bin = atob(data), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new Blob([bytes], { type }); };

export type EngineDeps = {
  /** Workspaces this device syncs. */
  workspaces: () => Synced[];
  /** Adds a workspace another device syncs; returns it, or null when this device declines. */
  addWorkspace: (id: string, name: string) => Synced | null;
  /** New content arrived for a workspace (the open one is then applied to the editor). */
  received?: (storage: string) => void;
};

export class LocalSyncEngine {
  private online = new Set<string>();
  private lastSent = new Map<string, string>();
  private waiting = new Map<string, ((blob: Blob | null) => void)[]>();
  private queue: Promise<unknown> = Promise.resolve();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  lastSync = new Map<string, { at: number; peer: string }>();
  constructor(private transport: Transport, private deps: EngineDeps) {}

  private send(peer: string, msg: Msg) { return this.transport.send(peer, JSON.stringify(msg)).catch(() => {}); }
  private synced(ws: string) { return this.deps.workspaces().find(w => w.id === ws) || null; }
  /** One message at a time per device, so storage operations never interleave. */
  private serial<T>(fn: () => Promise<T>): Promise<T> { const run = this.queue.then(fn, fn); this.queue = run.catch(() => {}); return run; }

  /** Makes sure a workspace has its sync copy. */
  async prepare(w: Synced) {
    const op = (o: string, a: any = {}) => syncOperation(o, a, w.storage);
    if ((await op('status')).initialized) return;
    let doc = await load(w.storage);
    if (!doc) doc = await save(null, empty(), 'initialize', undefined, false, [], undefined, w.storage);
    await op('initialize', { response: { revision: 0, updates: {} }, doc, assets: await manifest(await getAssets(w.storage)) });
    await op('peer-settle');
  }

  /** Paired devices that are connected now. New ones get the workspace list and a hello. */
  async setOnline(peers: string[]) {
    const fresh = peers.filter(p => !this.online.has(p));
    this.online = new Set(peers);
    for (const p of [...this.lastSent.keys()]) if (!this.online.has(p.split('|')[0])) this.lastSent.delete(p);
    for (const peer of fresh) {
      await this.send(peer, { t: 'workspaces', list: this.deps.workspaces().map(({ id, name }) => ({ id, name })) });
      for (const w of this.deps.workspaces()){await this.hello(peer,w,true);void this.prefetch(w);}
    }
  }

  /** Tells a device what this one has, so it sends what is missing (and asks for what it lacks). */
  private hello(peer: string, w: Synced, force = false) {
    return this.serial(async () => {
      await this.prepare(w);
      const vectors = await syncOperation('peer-vectors', {}, w.storage), text = JSON.stringify(vectors), key = peer + '|' + w.id;
      if (!force && this.lastSent.get(key) === text) return;
      this.lastSent.set(key, text);
      await this.send(peer, { t: 'hello', ws: w.id, vectors });
    });
  }

  /** A workspace changed on this device (or received something to pass on): tell everyone. */
  changed(storage: string, except?: string) {
    const w = this.deps.workspaces().find(x => x.storage === storage); if (!w) return;
    const prior = this.timers.get(w.id); if (prior) clearTimeout(prior);
    this.timers.set(w.id, setTimeout(() => { this.timers.delete(w.id); for (const peer of this.online) if (peer !== except) void this.hello(peer, w); }, 250));
  }

  async onMessage(peer: string, raw: string) {
    let msg: Msg; try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'workspaces') {
      if (!Array.isArray(msg.list)) return;
      for (const item of msg.list.slice(0, 200)) {
        if (!item || !WS_ID.test(item.id) || this.synced(item.id)) continue;
        const added = this.deps.addWorkspace(item.id, String(item.name || ''));
        if (added) await this.hello(peer, added, true);
      }
      return;
    }
    if (!('ws' in msg) || !WS_ID.test(msg.ws)) return;
    const w = this.synced(msg.ws); if (!w) return;
    const op = (o: string, a: any = {}) => syncOperation(o, a, w.storage);
    if (msg.t === 'hello') {
      if (!validVectors(msg.vectors)) return;
      await this.serial(async () => {
        await this.prepare(w);
        const updates: Record<string, string> = await op('peer-diff', { vectors: msg.vectors });
        let batch: Record<string, string> = {}, size = 0;
        for (const [b, u] of Object.entries(updates)) {
          if (size && size + u.length > BATCH) { await this.send(peer, { t: 'updates', ws: w.id, updates: batch }); batch = {}; size = 0; }
          batch[b] = u; size += u.length;
        }
        if (size) await this.send(peer, { t: 'updates', ws: w.id, updates: batch });
        // The other device has something this one lacks: answer with this device's vectors.
        if (lacks(await op('peer-vectors'), msg.vectors)) {
          const vectors = await op('peer-vectors');
          this.lastSent.set(peer + '|' + w.id, JSON.stringify(vectors));
          await this.send(peer, { t: 'hello', ws: w.id, vectors });
        }
      });
      return;
    }
    if (msg.t === 'updates') {
      const updates = msg.updates;
      if (!updates || typeof updates !== 'object' || !Object.keys(updates).every(isBucket) || !Object.values(updates).every(u => typeof u === 'string')) return;
      await this.serial(async () => {
        await this.prepare(w);
        await op('receive', { response: { protocol: 3, revision: 0, updates } });
        await op('peer-settle');
      });
      this.lastSync.set(w.id, { at: Date.now(), peer });
      void this.prefetch(w);
      this.deps.received?.(w.storage);
      this.changed(w.storage, peer);
      return;
    }
    if (msg.t === 'want') {
      if (!Array.isArray(msg.hashes)) return;
      const files = await getAssets(w.storage), wanted = new Set(msg.hashes.filter(h => HASH.test(h)).slice(0, 500)), sent = new Set<string>();
      const bookDoc={web:{readingBooks:await op('peer-books')}};
      for(const [path,blob]of await localBookFiles(bookDoc,w.storage))files.set(path,blob);
      for (const [path,blob] of files) {
        const hash = isBookPath(path)?path.slice(6,70):await hashOf(blob);
        if (wanted.has(hash) && !sent.has(hash) && blob.size <= ASSET_LIMIT) { sent.add(hash); await this.send(peer, { t: 'asset', ws: w.id, hash, type: blob.type, data: await toBase64(blob) }); }
      }
      return;
    }
    if (msg.t === 'asset') {
      if (!HASH.test(msg.hash) || typeof msg.data !== 'string' || msg.data.length > ASSET_LIMIT * 1.4) return;
      const blob = fromBase64(msg.data, typeof msg.type === 'string' ? msg.type.slice(0, 100) : '');
      if (await hashOf(blob) !== msg.hash) return;
      const listed: Asset[] = await op('peer-assets'), files = new Map(listed.filter(a => a.hash === msg.hash).map(a => [a.path, blob] as [string, Blob]));
      if (files.size) await putAssets(files, w.storage);
      const bookDoc={web:{readingBooks:await op('peer-books')}};
      for(const b of localBookManifest(bookDoc))if(b.hash===msg.hash)await restoreLocalBook(bookDoc,w.storage,b.path,blob);
      for (const resolve of this.waiting.get(msg.hash) || []) resolve(blob);
      this.waiting.delete(msg.hash);
      this.deps.received?.(w.storage);
    }
  }

  /** Fetches attachments this device's copy lists but does not hold yet. */
  async prefetch(w: Synced) {
    const listed: Asset[] = await syncOperation('peer-assets', {}, w.storage), files = await getAssets(w.storage);
    const bookDoc={web:{readingBooks:await syncOperation('peer-books',{},w.storage)}};
    listed.push(...localBookManifest(bookDoc));
    for(const [path,blob]of await localBookFiles(bookDoc,w.storage))files.set(path,blob);
    const missing: string[] = [];
    for (const a of listed) { const blob = files.get(a.path); if (!blob || (isBookPath(a.path)?blob.size!==a.size:await hashOf(blob)!==a.hash)) missing.push(a.hash); }
    if (missing.length) for (const peer of this.online) await this.send(peer, { t: 'want', ws: w.id, hashes: [...new Set(missing)] });
  }

  /** Waits for an attachment from any connected device (null after `ms`). */
  fetchAsset(w: Synced, hash: string, ms = 20000): Promise<Blob | null> {
    return new Promise(resolve => {
      const done = (b: Blob | null) => { clearTimeout(timer); resolve(b); };
      const timer = setTimeout(() => { this.waiting.set(hash, (this.waiting.get(hash) || []).filter(f => f !== done)); resolve(null); }, ms);
      this.waiting.set(hash, [...(this.waiting.get(hash) || []), done]);
      for (const peer of this.online) void this.send(peer, { t: 'want', ws: w.id, hashes: [hash] });
    });
  }
  get peers() { return [...this.online]; }
}

// ---------- the desktop app's engine ----------

type Status = { enabled: boolean; deviceId: string; deviceName: string; port: number | null; address: string | null; peers: { id: string; name: string; online: boolean }[]; nearby: { id: string; name: string; address: string }[] };
let engine: LocalSyncEngine | null = null, started = false;
const listeners = new Set<() => void>();
export const onLocalSyncChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const notify = () => { for (const fn of listeners) fn(); };

const syncedWorkspaces = (): Synced[] => localWorkspaces().filter(w => w.peerSync).map(w => ({ id: w.id, name: w.name, storage: workspaceStorageName(w) }));
export const localSyncEngine = () => engine;
export const localSyncStatus = () => desktopInvoke<Status>('local_sync_status');

/** Starts the desktop app's engine once (it runs for every synced workspace in the background). */
export function startLocalSync(received: (storage: string) => void) {
  if (!isDesktop() || started) return;
  started = true;
  engine = new LocalSyncEngine({ send: (peer, data) => desktopInvoke('local_sync_send', { peer, data }) }, {
    workspaces: syncedWorkspaces,
    addWorkspace: (id, name) => { const w = addPeerWorkspace(id, name); notify(); return w ? { id: w.id, name: w.name, storage: workspaceStorageName(w) } : null; },
    received: storage => { notify(); received(storage); },
  });
  const refresh = async () => { try { const s = await localSyncStatus(); await engine!.setOnline(s.peers.filter(p => p.online).map(p => p.id)); } catch { /* local sync off */ } notify(); };
  void desktopListen('local-sync-status', () => void refresh());
  void desktopListen<{ peer: string; data: string }>('local-sync-message', ({ peer, data }) => void engine!.onMessage(peer, data));
  window.addEventListener('remo-workspaces', () => void refresh());
  void refresh();
}

/** Announces a workspace that was just turned on for syncing to the connected devices. */
export async function announceWorkspaces() {
  if (!engine) return;
  const peers = engine.peers;
  await engine.setOnline([]);
  await engine.setOnline(peers);
}

// ---------- the open workspace ----------

type Host = {
  ready: boolean;
  revision?: number;
  get: () => { doc: Workspace | null; assets: Map<string, Blob> };
  flush: () => Promise<unknown>;
  canApply: () => boolean;
  selection?: () => any;
  apply: (doc: Workspace, assets: Map<string, Blob>, sync: { state: string; selection?: any }) => Promise<void>;
  onStatus?: (status: string) => void;
};

/** Keeps the open workspace in step with its sync copy: records local edits for other devices
 and applies what they sent, the same way cloud sync does. */
export function useLocalSync(host: Host) {
  const latest = useRef(host); latest.current = host;
  const busy = useRef(false), again = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const w = activeLocalWorkspace(), active = isDesktop() && !!w?.peerSync;
  const storage = w ? workspaceStorageName(w) : '';
  const run = useRef<() => Promise<void>>(async () => {});
  run.current = async () => {
    const h = latest.current, eng = engine;
    if (!active || !h.ready || !eng || !w) return;
    if (busy.current) { again.current = true; return; }
    busy.current = true; again.current = false;
    const op = (o: string, a: any = {}) => syncOperation(o, a, storage);
    const target = { id: w.id, name: w.name, storage };
    try {
      await h.flush();
      await eng.prepare(target);
      let local = h.get(); if (!local.doc) return;
      const staged = await manifest(local.assets);
      await op('stage', { doc: local.doc, assets: staged });
      await op('peer-settle');
      eng.changed(storage);
      await h.flush(); local = h.get();
      const inspected = await op('inspect', { doc: local.doc, assets: await manifest(local.assets) });
      if (!inspected.needsApply) { h.onStatus?.('Synced'); return; }
      // Attachments: from this workspace's store when the hash matches, otherwise from a device.
      const files = new Map<string, Blob>(), held = new Map<string, Blob>();
      for (const blob of [...local.assets.values(), ...(await getAssets(storage)).values()]) held.set(await hashOf(blob), blob);
      for (const a of inspected.assets as Asset[]) {
        const blob = held.get(a.hash) || await eng.fetchAsset(target, a.hash);
        if (!blob) { h.onStatus?.('Waiting for an attachment from another device'); again.current = true; return; }
        files.set(a.path, blob);
      }
      await h.flush();
      if (!h.canApply() || h.get().doc !== local.doc) { again.current = true; return; }
      const selection = await op('selection', { state: inspected.state, selection: h.selection?.() });
      if (!(await op('current', { state: inspected.state })) || h.get().doc !== local.doc || !h.canApply()) { again.current = true; return; }
      await h.apply(inspected.doc, files, { state: inspected.state, selection });
      h.onStatus?.('Synced');
    } catch (e: any) {
      if (!e?.deferred) console.warn('local sync', e);
      again.current = true;
    } finally {
      busy.current = false;
      if (again.current) { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void run.current(), 1500); }
    }
  };
  useEffect(() => {
    if (!active) return;
    startLocalSync(s => { if (s === storage) void run.current(); });
    return onLocalSyncChange(() => void run.current());
  }, [active, storage]);
  useEffect(() => { if (!active || !host.ready) return; const t = setTimeout(() => void run.current(), 400); return () => clearTimeout(t); }, [active, host.ready, host.revision]);
}
