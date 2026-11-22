// On-device meaning index. Note texts are sent in batches to /ai/embed (bge-m3 on Workers AI, not
// stored there); the vectors are kept only on this device in IndexedDB, per account, and searched
// locally. Only notes whose text changed are sent again. Opt-in: nothing is sent until enabled.
import type {User} from 'firebase/auth';
import {CLOUD_API} from './cloud-config';
import {DIMS,batches,decodeVectors,duplicatePairs,meaningText,nearest,textHash} from './meaning-core.mjs';
import {displayText} from './relations.mjs';
import type {Node} from './data';

type Entry = {h: string; v: Int8Array};
export type MeaningProgress = {indexed: number; total: number; running: boolean; paused?: string};
const STORE = 'vectors';

function openDb(account: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('remo-meaning-v1-' + account, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
const done = (t: IDBTransaction) => new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });

async function post(user: Pick<User, 'getIdToken'>, path: string, body: unknown, signal?: AbortSignal) {
  const r = await fetch(CLOUD_API + path, {method: 'POST', headers: {Authorization: 'Bearer ' + await user.getIdToken(), 'Content-Type': 'application/json'}, body: JSON.stringify(body), signal, cache: 'no-store'});
  const v = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(Error(v.error || 'Meaning search is unavailable.'), {code: v.code, status: r.status});
  return v;
}

export class MeaningIndex {
  private entries = new Map<string, Entry>();
  private db: Promise<IDBDatabase>;
  private queries = new Map<string, Int8Array>();
  private running = false;
  private abort = new AbortController();
  progress: MeaningProgress = {indexed: 0, total: 0, running: false};
  onProgress: (p: MeaningProgress) => void = () => {};
  ready: Promise<void>;

  constructor(readonly account: string, private user: Pick<User, 'getIdToken'>) {
    this.db = openDb(account);
    this.ready = this.db.then(db => new Promise<void>((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).openCursor();
      req.onsuccess = () => { const c = req.result; if (!c) return resolve(); const x = c.value as {h: string; v: ArrayBuffer}; this.entries.set(String(c.key), {h: x.h, v: new Int8Array(x.v)}); c.continue(); };
      req.onerror = () => resolve();
    })).catch(() => {});
  }
  close() { this.abort.abort(); void this.db.then(db => db.close()).catch(() => {}); }
  has(id: string) { return this.entries.has(id); }
  get size() { return this.entries.size; }

  /** Brings the index up to date with these bullets: drops removed ones, embeds new or changed ones. */
  async sync(nodes: Node[]) {
    await this.ready;
    if (this.running) return;
    this.running = true;
    try {
      const want = new Map<string, string>();
      for (const n of nodes) { const t = meaningText(n, displayText); if (t) want.set(n.id, t); }
      const stale = [...this.entries.keys()].filter(id => !want.has(id));
      if (stale.length) { const db = await this.db, t = db.transaction(STORE, 'readwrite'); for (const id of stale) { t.objectStore(STORE).delete(id); this.entries.delete(id); } await done(t); }
      const todo = [...want].filter(([id, text]) => this.entries.get(id)?.h !== textHash(text)).map(([id, text]) => ({id, text}));
      this.progress = {indexed: want.size - todo.length, total: want.size, running: !!todo.length};
      this.onProgress(this.progress);
      for (const batch of batches(todo)) {
        if (this.abort.signal.aborted) return;
        const v = await post(this.user, '/ai/embed', {requestId: crypto.randomUUID(), texts: batch.map(b => b.text)}, this.abort.signal);
        const vectors = decodeVectors(v.vectors, v.dims || DIMS);
        if (vectors.length !== batch.length) throw Error('Meaning search returned an unexpected result.');
        const db = await this.db, t = db.transaction(STORE, 'readwrite');
        batch.forEach((b, i) => { const e = {h: textHash(b.text), v: vectors[i]}; this.entries.set(b.id, e); t.objectStore(STORE).put({h: e.h, v: e.v.buffer}, b.id); });
        await done(t);
        this.progress = {...this.progress, indexed: this.progress.indexed + batch.length};
        this.onProgress(this.progress);
      }
      this.progress = {...this.progress, running: false, paused: undefined};
    } catch (e) {
      if (!this.abort.signal.aborted) this.progress = {...this.progress, running: false, paused: (e as {code?: string}).code === 'embed_limit' ? 'Indexing continues tomorrow (daily limit reached).' : (e as Error).message};
    } finally { this.running = false; this.onProgress(this.progress); }
  }

  /** Notes closest in meaning to a typed query. */
  async search(query: string, limit = 8) {
    const q = query.trim().replace(/\s+/g, ' ').slice(0, 300);
    if (q.length < 3) return [];
    let vector = this.queries.get(q);
    if (!vector) {
      const v = await post(this.user, '/ai/embed', {requestId: crypto.randomUUID(), texts: [q]});
      vector = decodeVectors(v.vectors, v.dims || DIMS)[0];
      if (this.queries.size > 50) this.queries.clear();
      this.queries.set(q, vector);
    }
    return nearest(vector, this.vectors(), {limit});
  }
  /** Notes closest in meaning to an indexed bullet. */
  related(id: string, limit = 10, skip: (id: string) => boolean = () => false) {
    const e = this.entries.get(id);
    return e ? nearest(e.v, this.vectors(), {limit, min: 0.5, skip: other => other === id || skip(other)}) : [];
  }
  /** Near-identical items among these ids (for duplicate flashcards). */
  duplicates(ids: string[], min = 0.85) {
    return duplicatePairs(ids.flatMap(id => { const e = this.entries.get(id); return e ? [[id, e.v] as [string, Int8Array]] : []; }), {min});
  }
  /** Indexed items most similar to one item, above a threshold. */
  similarTo(id: string, among: Set<string>, min = 0.78) {
    const e = this.entries.get(id);
    return e ? nearest(e.v, this.vectors(), {limit: 3, min, skip: other => other === id || !among.has(other)}) : [];
  }
  private *vectors(): Iterable<[string, Int8Array]> { for (const [id, e] of this.entries) yield [id, e.v]; }
  /** Turns meaning search off for this account and deletes the vectors on this device. */
  async clear() {
    this.abort.abort(); this.entries.clear();
    const db = await this.db.catch(() => null); db?.close();
    await new Promise<void>(res => { const r = indexedDB.deleteDatabase('remo-meaning-v1-' + this.account); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  }
}
