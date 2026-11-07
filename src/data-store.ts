import {cachedArticle,cacheArticle} from './article-cache.mjs';
import {validateBookmarks,articleSnapshotHashes} from './bookmarks.mjs';
import {validateFsrs} from './fsrs-scheduler.mjs';
import {validateReading} from './reading.mjs';
import {validateReadingBooks} from './book-storage.mjs';
import {project,openShared,vector,Y,emptyShared,unpack,applyIntent} from './sync-crdt.mjs';
import {sharedSnapshotProblem} from './sync-validate.mjs';
import {workdaysLegacyIntent,upgradeWorkdaysIntent} from '../cloud/workdays-upgrade.mjs';
import {cloudDocument,contentKey,recoverCheckpoint,hasDeviceContent} from './cloud-model.mjs';
import {recordLocal,initializeOutbox,stageAssets,claimOutbox,receiveOutbox,receivedProjection,adopt,mapSelection,bucketAssets,recoverRefused} from './sync-outbox-v3.mjs';
/** IndexedDB key of the sync v3 outbox. v2 metadata under 'sync-v2' is no longer used. */
const SYNC_KEY='sync-v3';
import {recoverRejectedBatch} from './sync-recovery.mjs';
import {syncMirrors,validateMirrors} from "./relations.mjs";
import {validateOcclusions} from "./occlusion.mjs";
import {validateStudyLibrary,studyFolders} from './study-library.mjs';
import {validateCalendarEvents} from './calendar-events.mjs';
import {validateDashboard} from './dashboard.mjs';
import {validateDailyTrackers} from './daily-trackers.mjs';
import {validateWorkdays} from './workdays.mjs';
import JSZip from "jszip";
import { inspectZip } from "./zip-safety";
import fieldRules from "./android-fields.json" with { type: "json" };
import schema from "./android-schema.json" with { type: "json" };
import { bullet, validate, refreshCards, uuid } from "./domain.mjs";
import { withNodes as withNodesCore } from "./workspace-nodes.mjs";
import { isCatalogEmoji, catalogAssetPaths } from './emoji-catalog.mjs';
export type Node = ReturnType<typeof bullet> & Record<string, any>;
export type RecordData = Record<string, any>;
export type Workspace = {
  tables: Record<string, RecordData[]>;
  columns: Record<string, string[]>;
  preferences: Record<string, RecordData>;
  web: RecordData;
  revision: number;
};
export const SCHEMA = schema as Record<string, string[]>;
const primary: Record<string, string> = {
  decks: "rootId",
  emojis: "token",
  study_limits: "deckId",
};
const key = (table: string, row: RecordData, i: number) =>
  SCHEMA[table]
    ? String(row[primary[table] || "id"] ?? `row:${i}`)
    : `row:${String(i).padStart(12, "0")}`;
export function empty(): Workspace {
  return {
    tables: Object.fromEntries(Object.keys(SCHEMA).map((k) => [k, []])),
    columns: structuredClone(SCHEMA),
    preferences: {
      appearance: { theme: "System", font: "Sans", size: 16 },
      editor_tools: {},
      study_preferences: { mode: "NORMAL" },
    },
    web: { contract: "1.0.0", deviceId: uuid() },
    revision: 0,
  };
}
export function sample(): Workspace {
  const d = empty();
  d.tables.bullets = [
    bullet("welcome", { text: "Welcome to RemoNook" }),
    bullet("welcome-1", {
      parentId: "welcome",
      text: "A quieter space for your thoughts",
    }),
    bullet("welcome-2", {
      parentId: "welcome",
      position: 1,
      text: "Write a bullet. Press Enter to keep going.",
    }),
    bullet("welcome-3", {
      parentId: "welcome",
      position: 2,
      text: "Drag the handle to reorder or nest a branch.",
    }),
    bullet("welcome-4", {
      parentId: "welcome",
      position: 3,
      text: "Your notes stay on this device. Export a backup to keep a copy.",
    }),
    bullet("ideas", { position: 1, text: "Ideas" }),
    bullet("ideas-1", { parentId: "ideas", text: "" }),
  ];
  return d;
}
export function withNodes(doc: Workspace, nodes: Node[]): Workspace {
  return withNodesCore(doc, nodes) as Workspace;
}
/** Content-only edits preserve the validated tree and scheduling metadata. */
export function updateBulletContent(doc:Workspace,id:string,value:{text:string;formatting:string}):Workspace{
 if(typeof value.text!=='string'||typeof value.formatting!=='string')throw Error('Invalid bullet content');
 const original=doc.tables.bullets.find(node=>node.id===id);if(!original)return doc;
 const source=original.mirrorSourceId||id,changed:Node[]=[];
 const nodes=doc.tables.bullets.map(node=>{
  if((node.id!==source&&node.mirrorSourceId!==source)||(node.text===value.text&&node.formatting===value.formatting))return node;
  const next={...node,text:value.text,formatting:value.formatting} as Node;changed.push(next);return next;
 }) as Node[];
 if(!changed.length)return doc;
 const now=Date.now(),noteTimes={...doc.web.noteTimes};
 for(const node of changed)noteTimes[node.id]={...noteTimes[node.id],updatedAt:now};
 const decks=doc.tables.decks.filter(deck=>doc.web.deckTypes?.[deck.rootId]!=='MCQ'),roots=new Set(decks.map(deck=>deck.rootId));
 let byId:Map<string,Node>|undefined;
 const affectedIds=new Set<string>();let affectsCards=false;
 for(const node of changed){
  let parent:Node|undefined=node;const seen=new Set<string>();
  while(parent){if(seen.has(parent.id))throw Error('A branch cannot contain itself');seen.add(parent.id);affectedIds.add(parent.id);if(parent.kind==='QUESTION'||roots.has(parent.id))affectsCards=true;if(!parent.parentId)break;byId??=new Map(nodes.map(n=>[n.id,n]));parent=byId.get(parent.parentId);}
 }
 let cards=doc.tables.cards;
 if(affectsCards){
  const ids=new Set(nodes.map(node=>node.id)),sourceCards:RecordData[]=[],independentCards:RecordData[]=[];
  for(const card of cards)(ids.has(card.id)?sourceCards:independentCards).push(card);
  const excluded=new Set(doc.web.studyExcludedCards||[]);
  cards=[...independentCards,...refreshCards(nodes,decks,doc.tables.media,sourceCards,now,affectedIds)].map(card=>excluded.has(card.id)&&card.state!=='INACTIVE'?{...card,state:'INACTIVE'}:card);
 }
 return {...doc,web:{...doc.web,noteTimes},tables:{...doc.tables,bullets:nodes,cards}};
}
export function tableManifest(doc: Workspace) {
  return Object.fromEntries(
    Object.entries(doc.tables).map(([name, rs]) => [
      name,
      {
        columns: doc.columns[name],
        rows: rs.map((r) =>
          doc.columns[name].map((k) =>
            typeof r[k] === "boolean" ? (r[k] ? 1 : 0) : (r[k] ?? null),
          ),
        ),
      },
    ]),
  );
}
export function androidBlockers(doc: Workspace) {
  const reasons = [];
  if(doc.web.bookmarks)reasons.push("Web bookmarks require a full web backup");
  if(doc.tables.bullets.some(node=>node.mirrorSourceId))reasons.push("Mirrors require a full web backup");
  if(doc.web.calendarEvents?.length)reasons.push('Calendar reminders require a full web backup');
  if(doc.web.dailyTrackers)reasons.push("Daily trackers require a full web backup");
  if(doc.web.mindmapStyles)reasons.push("Mindmap styles require a full web backup");
  if(doc.web.workdays)reasons.push('Workdays require a full web backup');
  if(doc.web.readingHighlights)reasons.push('Book highlight sources require a full web backup');
  if(doc.web.readingBooks)reasons.push('Reading book metadata requires a full web backup');
  if(doc.web.dashboard)reasons.push('Dashboard widgets and habits require a full web backup');
  if(doc.tables.cards.some(card=>card.fsrsState))reasons.push('FSRS memory state and settings require a full web backup; older Android schedulers do not use FSRS');
  if(doc.web.studyFolders?.length||Object.keys(doc.web.deckFolders||{}).length||doc.web.studyExcludedCards?.length)reasons.push("Study folders and removed study cards require a full web backup");
  if(Object.keys(doc.web.occlusions||{}).length)reasons.push("Image occlusion cards require a full web backup");
  if (doc.tables.bullets.some(node => /(?:^|;)\d+:\d+:MASK(?:;|$)/.test(node.formatting || ""))) reasons.push("Masked text requires a full web backup");
  if (doc.tables.bullets.some(node => /(?:^|;)\d+:\d+:ROUGH_/.test(node.formatting || ''))) reasons.push('Sketch annotations require a full web backup');
  if (doc.tables.emojis.some(isCatalogEmoji)) reasons.push("Google Noto and Microsoft Fluent animated emojis require a full web backup");
  if (Object.keys(doc.web.deckDesigns || {}).length || doc.web.pinnedDecks?.length)
    reasons.push("Notebook covers and shelf preferences require a full web backup");
  if (Object.keys(doc.web.mcqs || {}).length || Object.keys(doc.web.deckTypes || {}).length || Object.keys(doc.web.mcqRuns || {}).length || doc.web.quizReactions)
    reasons.push("Multiple-choice questions, progress and reactions require a full web backup");
  if (Object.keys(doc.web.archiveExtensions || {}).length)
    reasons.push("Extended backup metadata");
  for (const name of Object.keys(doc.tables))
    if (!SCHEMA[name]) reasons.push(`Unsupported table: ${name}`);
  for (const [name, cols] of Object.entries(SCHEMA))
    if (JSON.stringify(doc.columns[name]) !== JSON.stringify(cols))
      reasons.push(`Extended or missing fields in ${name}`);
  if (
    Object.keys(doc.preferences).sort().join(",") !==
    "appearance,editor_tools,study_preferences"
  )
    reasons.push("Extended preference groups");
  return reasons;
}
let storageName = "remo-web";
export function setStorageAccount(uid: string | null) { storageName = uid ? "remo-web-user-" + uid : "remo-web"; }
export const storageAccountKey = () => storageName;
export const accountLocalKey = (key: string) => storageName === "remo-web" ? key : storageName + ":" + key;
function openDb(name = storageName): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 2);
    r.onupgradeneeded = () => {
      const stores = r.result.objectStoreNames;
      if (!stores.contains("meta")) r.result.createObjectStore("meta");
      if (!stores.contains("records")) r.result.createObjectStore("records");
      if (!stores.contains("assets")) r.result.createObjectStore("assets");
      if (!stores.contains("recovery")) r.result.createObjectStore("recovery");
      if (!stores.contains("operations")) r.result.createObjectStore("operations", { autoIncrement: true });
      // Sync v3 bucket states, one record per bucket and copy ('L:b12', 'R:b12').
      if (!stores.contains("syncBuckets")) r.result.createObjectStore("syncBuckets");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(tx.error || Error("Storage transaction failed"));
  });
export async function load(name?: string): Promise<Workspace | null> {
  const db = await openDb(name);
  try {
    const tx = db.transaction(["meta", "records"], "readonly"),
      finished = done(tx),
      m = await request<any>(tx.objectStore("meta").get("workspace"));
    if (!m) {
      await finished;
      return null;
    }
    const all = await request<any[]>(tx.objectStore("records").getAll());
    await finished;
    const tables: Workspace["tables"] = Object.fromEntries(
      m.tableNames.map((n: string) => [n, []]),
    );
    for (const r of all) tables[r.table].push(r.value);
    validateWorkdays(m.web?.workdays);validateDailyTrackers(m.web?.dailyTrackers);
    validateDashboard(m.web?.dashboard);validateReadingBooks(m.web?.readingBooks);validateReading(m.web||{});validateBookmarks(m.web||{});
    return { ...m, tables };
  } finally {
    db.close();
  }
}
function records(doc: Workspace | null) {
  const m = new Map<string, any>();
  if (doc)
    for (const [table, rows] of Object.entries(doc.tables))
      rows.forEach((value, i) =>
        m.set(JSON.stringify([table, key(table, value, i)]), { table, value }),
      );
  return m;
}
export async function save(
  before: Workspace | null,
  after: Workspace,
  operation: string,
  assets?: Map<string, Blob>,
  replace = false,
  removeAssets: string[] = [],
  adoptSyncState?: string,
  account=storageName,
): Promise<Workspace> {
  validateFsrs(after);
  validateWorkdays(after.web.workdays);validateDailyTrackers(after.web.dailyTrackers);
  validateDashboard(after.web.dashboard);validateReadingBooks(after.web.readingBooks);validateReading(after.web);validateBookmarks(after.web);
  const db = await openDb(account);
  try {
    const tx = db.transaction(
        ["meta", "records", "assets", "recovery", "operations", "syncBuckets"],
        "readwrite",
      ),
      finished = done(tx);
    try {
      const meta = tx.objectStore("meta"),
        current = await request<any>(meta.get("workspace"));
      if ((current?.revision ?? 0) !== (before?.revision ?? 0)) {
        tx.abort();
        await finished.catch(() => {});
        throw Error(
          "Another tab changed these notes. Reload before editing to avoid overwriting it.",
        );
      }
      const syncMeta=await request<any>(meta.get(SYNC_KEY));
      if(adoptSyncState&&String(syncMeta?.receivedVersion)!==adoptSyncState){
        tx.abort();await finished.catch(()=>{});throw Object.assign(Error('A newer sync update is ready.'),{deferred:true});
      }
      const next = { ...after, revision: (before?.revision ?? 0) + 1 };
      if(syncMeta){
        const io=bucketIO(tx.objectStore('syncBuckets'));
        if(adoptSyncState)await adopt(syncMeta,next,io);
        else await recordLocal(syncMeta,next,io,before);
        meta.put(syncMeta,SYNC_KEY);
      }
      if (replace && before) {
        const oldAssets = await request<Blob[]>(
            tx.objectStore("assets").getAll(),
          ),
          names = await request<IDBValidKey[]>(
            tx.objectStore("assets").getAllKeys(),
          );
        tx.objectStore("recovery").put(
          {
            document: before,
            assets: names.map((name, i) => [name, oldAssets[i]]),
          },
          "before-restore",
        );
      }
      const prev = records(before),
        updated = records(next),
        store = tx.objectStore("records"),
        changes = [];
      for (const [k, v] of updated)
        if (!prev.has(k) || (prev.get(k).value!==v.value&&JSON.stringify(prev.get(k)) !== JSON.stringify(v))) {
          store.put(v, k);
          changes.push({ key: k, value: v.value });
        }
      for (const k of prev.keys())
        if (!updated.has(k)) {
          store.delete(k);
          changes.push({ key: k, deleted: true });
        }
      const { tables, ...header } = next;
      meta.put({ ...header, tableNames: Object.keys(tables) }, "workspace");
      if (assets) {
        if (replace) tx.objectStore("assets").clear();
        for (const [name, blob] of assets)
          tx.objectStore("assets").put(blob, name);
      }
      for (const path of removeAssets) tx.objectStore("assets").delete(path);
      if (replace || operation === "purge")
        tx.objectStore("operations").clear();
      tx.objectStore("operations").add({
        id: uuid(),
        deviceId: next.web.deviceId,
        revision: next.revision,
        at: Date.now(),
        operation,
        changes,
        preferences: next.preferences,
      });
      await finished;
      return next;
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await finished.catch(() => {});
      throw error;
    }
  } finally {
    db.close();
  }
}
export async function getAssets(name?: string): Promise<Map<string, Blob>> {
  const db = await openDb(name);
  try {
    const tx = db.transaction("assets", "readonly"),
      finished = done(tx);
    const s = tx.objectStore("assets"),
      [keys, values] = await Promise.all([
        request(s.getAllKeys()),
        request<Blob[]>(s.getAll()),
      ]);
    await finished;
    return new Map(keys.map((k, i) => [String(k), values[i]]));
  } finally {
    db.close();
  }
}
export async function recovery() {
  const db = await openDb();
  try {
    return await request<any>(
      db
        .transaction("recovery", "readonly")
        .objectStore("recovery")
        .get("before-restore"),
    );
  } finally {
    db.close();
  }
}
function sha256Fallback(bytes: ArrayBuffer): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const u8 = new Uint8Array(bytes);
  const l = u8.length;
  const bitLen = l * 8;
  const newLen = ((l + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(newLen);
  padded.set(u8);
  padded[l] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(newLen - 4, bitLen >>> 0, false);
  view.setUint32(newLen - 8, Math.floor(bitLen / 0x100000000), false);
  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < newLen; i += 64) {
    for (let t = 0; t < 16; t++) W[t] = view.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    H = [(H[0] + a) | 0, (H[1] + b) | 0, (H[2] + c) | 0, (H[3] + d) | 0, (H[4] + e) | 0, (H[5] + f) | 0, (H[6] + g) | 0, (H[7] + h) | 0];
  }
  return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
export const digest = async (bytes: ArrayBuffer) => {
  if (typeof crypto !== "undefined" && crypto.subtle && typeof crypto.subtle.digest === "function") {
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
  }
  return sha256Fallback(bytes);
};
export function references(doc: Workspace) {
  const paths = new Set<string>();
  for(const folder of studyFolders(doc))if(folder.image)paths.add(folder.image);
  for (const kind of ["correct", "wrong"])
    for (const reaction of doc.web.quizReactions?.[kind] || [])
      if (typeof reaction.path === "string") paths.add(reaction.path);
  for (const design of Object.values(doc.web.deckDesigns || {}) as RecordData[])
    if (design && typeof design.image === "string" && design.image) paths.add(design.image);
  for (const m of doc.tables.media) paths.add("media/" + m.fileName);
  for (const e of doc.tables.emojis) {
    for (const path of catalogAssetPaths(e)) paths.add(path);
  }
  for (const t of doc.tables.trash) {
    const p = JSON.parse(t.payload);
    for (const m of p.media || []) paths.add("media/" + m.fileName);
  }
  return paths;
}
const safe = (p: string) =>
  (/^(media|emoji)\/[A-Za-z0-9._-]+$/.test(p)||/^articles\/[a-f0-9]{64}\.json$/.test(p)) &&
  ![".", ".."].includes(p.split("/")[1]);
export async function archive(
  doc: Workspace,
  assets: Map<string, Blob>,
  android = false,
): Promise<Blob> {
  if (android) {
    const reasons = androidBlockers(doc);
    if (reasons.length)
      throw Error("Android export would lose data: " + reasons.join("; "));
  }
  assets=new Map(assets);
  const articleHashes=articleSnapshotHashes(doc);
  if(!android)for(const hash of articleHashes){const path='articles/'+hash+'.json';if(!assets.has(path)){const local=await cachedArticle(storageName,hash);if(local)assets.set(path,local.blob);}}
  const missingSnapshots=[...articleHashes].filter(hash=>!assets.has('articles/'+hash+'.json'));
  const zip = new JSZip(),
    declared = [];
  let total = 0;
  const required = references(doc),
    paths = android ? required : new Set([...required, ...assets.keys()]);
  for (const path of paths) {
    if (!safe(path)) throw Error("Invalid attachment path");
    const blob = assets.get(path);
    if (!blob) throw Error("Missing attachment: " + path);
    if (blob.size > 64 * 1024 * 1024) throw Error("Attachment exceeds 64 MB");
    total += blob.size;
    if (total > 1024 * 1024 * 1024) throw Error("Backup exceeds 1 GB");
    const bytes = await blob.arrayBuffer();
    declared.push({ path, bytes: blob.size, sha256: await digest(bytes) });
    zip.file(path, bytes, { createFolders: false });
  }
  const manifest = {
    ...(!android ? doc.web.archiveExtensions || {} : {}),
    format: android ? "remo-backup" : "remo-web-backup",
    version: 1,
    schema: 11,
    createdAt: Date.now(),
    tables: tableManifest(doc),
    preferences: doc.preferences,
    assets: declared,
    ...(!android ? { web: {...doc.web,bookmarkBackupMissing:missingSnapshots} } : {}),
  };
  const json = JSON.stringify(manifest);
  if (new TextEncoder().encode(json).length > 64 * 1024 * 1024)
    throw Error("Backup metadata exceeds 64 MB");
  zip.file("remo.json", json);
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
export async function parseArchive(
  file: Blob,
): Promise<{ doc: Workspace; assets: Map<string, Blob>; warnings: string[] }> {
  if (file.size > 1024 * 1024 * 1024 + 64 * 1024 * 1024)
    throw Error("Backup exceeds size limit");
  const bytes = await file.arrayBuffer();
  inspectZip(bytes);
  const zip = await JSZip.loadAsync(bytes),
    entries = Object.values(zip.files);
  let total = 0;
  for (const e of entries) {
    const path = (e as any).unsafeOriginalName || e.name;
    if (e.dir || path !== e.name || (path !== "remo.json" && !safe(path)))
      throw Error("Unsafe backup entry");
    const size = (e as any)._data?.uncompressedSize;
    if (
      !Number.isFinite(size) ||
      size > (path === "remo.json" ? 64 * 1024 * 1024 : 64 * 1024 * 1024)
    )
      throw Error("Oversized backup entry");
    total += size;
    if (total > 1024 * 1024 * 1024 + 64 * 1024 * 1024)
      throw Error("Expanded backup exceeds limit");
  }
  const metadata = zip.file("remo.json");
  if (!metadata) throw Error("Missing remo.json");
  const m = JSON.parse(await metadata.async("string"));
  if (
    !["remo-backup", "remo-web-backup"].includes(m.format) ||
    m.version !== 1 ||
    ![10, 11].includes(m.schema)
  )
    throw Error(
      "Unsupported backup version. Your current notes were not changed.",
    );
  const tables = m.tables;
  if (m.schema === 10) {
    for (const [t, fields] of Object.entries({
      cards: [
        ["suspended", 0],
        ["buriedUntilEpochMillis", 0],
      ],
      review_logs: [["mode", "SPACED"]],
    })) {
      for (const [name, value] of fields) {
        if (tables[t].columns.includes(name))
          throw Error("Invalid legacy fields");
        tables[t].columns.push(name);
        tables[t].rows.forEach((r: any[]) => r.push(value));
      }
    }
    tables.study_limits = { columns: SCHEMA.study_limits, rows: [] };
  }
  const doc = empty();
  doc.tables = {};
  doc.columns = {};
  for (const name of Object.keys(SCHEMA))
    if (!tables[name]) throw Error("Missing backup table: " + name);
  for (const [name, entry] of Object.entries(tables) as [string, any][]) {
    if (
      !/^[a-z][a-z0-9_]*$/.test(name) ||
      ["constructor", "prototype"].includes(name)
    )
      throw Error("Unsupported table name");
    if (
      !Array.isArray(entry.columns) ||
      new Set(entry.columns).size !== entry.columns.length ||
      !entry.columns.every((x: any) => typeof x === "string") ||
      !Array.isArray(entry.rows)
    )
      throw Error("Invalid table " + name);
    if (SCHEMA[name]?.some((c) => !entry.columns.includes(c)))
      throw Error("Missing fields in " + name);
    doc.columns[name] = entry.columns;
    doc.tables[name] = entry.rows.map((r: any[]) => {
      if (
        !Array.isArray(r) ||
        r.length !== entry.columns.length ||
        r.some((x) => x !== null && !["number", "string"].includes(typeof x))
      )
        throw Error("Invalid row in " + name);
      return Object.fromEntries(
        entry.columns.map((c: string, i: number) => [c, r[i]]),
      );
    });
    for (const record of doc.tables[name])
      for (const [field, rule] of Object.entries(
        (
          fieldRules as Record<
            string,
            Record<string, { affinity: string; required: boolean }>
          >
        )[name] || {},
      )) {
        const value = record[field];
        if (value === null) {
          if (rule.required)
            throw Error("Missing value in " + name + "." + field);
        } else if (
          rule.affinity === "TEXT"
            ? typeof value !== "string"
            : typeof value !== "number" ||
              !Number.isFinite(value) ||
              (rule.affinity === "INTEGER" && !Number.isSafeInteger(value))
        )
          throw Error("Invalid value in " + name + "." + field);
      }
    const ids = doc.tables[name].map((r, i) => key(name, r, i));
    if (new Set(ids).size !== ids.length)
      throw Error("Duplicate records in " + name);
  }
  doc.tables.bullets = doc.tables.bullets.map((b) => ({
    ...b,
    collapsed: !!b.collapsed,
    autoHighlight: !!b.autoHighlight,
  }));
  validate(doc.tables.bullets);
  validateMirrors(doc.tables.bullets);
  doc.preferences = m.preferences;
  for (const p of ["appearance", "editor_tools", "study_preferences"])
    if (!doc.preferences?.[p]) throw Error("Missing preferences");
  for (const group of Object.values(doc.preferences))
    for (const v of Object.values(group))
      if (!["string", "number", "boolean"].includes(typeof v))
        throw Error("Invalid preference value");
  doc.web = {
    ...doc.web,
    ...m.web,
    deviceId: doc.web.deviceId,
    archiveExtensions: {
      ...(m.web?.archiveExtensions || {}),
      ...Object.fromEntries(
        Object.entries(m).filter(
          ([key]) =>
            ![
              "format",
              "version",
              "schema",
              "createdAt",
              "tables",
              "preferences",
              "assets",
              "web",
            ].includes(key),
        ),
      ),
    },
  };
  const nodeIds = new Set(doc.tables.bullets.map((b) => b.id));
  for (const media of doc.tables.media)
    if (!nodeIds.has(media.bulletId))
      throw Error("Attachment has missing bullet");
  for (const d of doc.tables.decks)
    if (!nodeIds.has(d.rootId)) throw Error("Deck root is missing");
  for (const t of doc.tables.trash) {
    const p = JSON.parse(t.payload),
      ids = new Set(p.nodes.map((n: Node) => n.id));
    validate(
      p.nodes.map((n: Node) => ({
        ...n,
        parentId: ids.has(n.parentId) ? n.parentId : null,
      })),
    );
    if (
      !p.nodes.length ||
      p.media.some((a: RecordData) => !ids.has(a.bulletId)) ||
      p.decks.some((d: RecordData) => !ids.has(d.rootId))
    )
      throw Error("Invalid Trash branch");
  }
  for (const s of doc.tables.study_sessions) {
    const q = JSON.parse(s.queueJson);
    if (
      !["NORMAL", "SPACED"].includes(s.mode) ||
      !Array.isArray(q) ||
      !q.every((x) => typeof x === "string") ||
      !Number.isInteger(s.cursor) ||
      s.cursor < 0 ||
      s.cursor > q.length ||
      s.reviewed < 0
    )
      throw Error("Invalid saved session");
  }
  for (const l of doc.tables.study_limits)
    if (
      ![l.newCards, l.reviewCards].every(
        (n) => Number.isInteger(n) && n >= -1 && n <= 100000,
      )
    )
      throw Error("Invalid study limit");
  for (const l of doc.tables.review_logs)
    if (!["NORMAL", "SPACED"].includes(l.mode))
      throw Error("Invalid review mode");
  const assets = new Map<string, Blob>();
  if (!Array.isArray(m.assets)) throw Error("Missing asset manifest");
  for (const a of m.assets) {
    if (!safe(a.path) || assets.has(a.path) || !zip.file(a.path))
      throw Error("Invalid or missing attachment");
    const bytes = await zip.file(a.path)!.async("arraybuffer");
    if (bytes.byteLength !== a.bytes || (await digest(bytes)) !== a.sha256)
      throw Error("Attachment integrity check failed");
    assets.set(a.path, new Blob([bytes]));
  }
  if (entries.length !== assets.size + 1)
    throw Error("Undeclared backup files");
  for (const path of references(doc))
    if (!assets.has(path)) throw Error("Missing attachment: " + path);
  validateFsrs(doc);
  validateOcclusions(doc.web.occlusions);
  validateStudyLibrary(doc.web);
  validateCalendarEvents(doc.web.calendarEvents);
  validateDashboard(doc.web.dashboard);validateReadingBooks(doc.web.readingBooks);validateReading(doc.web);validateBookmarks(doc.web);
  validateWorkdays(doc.web.workdays);validateDailyTrackers(doc.web.dailyTrackers);
  for(const item of doc.tables.media)if(item.displayWidth!=null&&(!Number.isFinite(item.displayWidth)||item.displayWidth<15||item.displayWidth>100))throw Error("Invalid image display width");
  const warnings = androidBlockers(doc);
  if(doc.web.bookmarkBackupMissing?.length)warnings.push("Some article snapshots were not cached on the exporting device. Their URLs and notes are included.");
  return { doc, assets, warnings };
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function cloudCheckpoint(value?: any,account=storageName): Promise<any> {
 const db=await openDb(account);try{const tx=db.transaction('meta',value===undefined?'readonly':'readwrite'),finished=done(tx);
 if(value!==undefined)tx.objectStore('meta').put(value,'cloud-checkpoint');
 const result=value===undefined?await request(tx.objectStore('meta').get('cloud-checkpoint')):value;await finished;return result||null;}finally{db.close();}
}
export async function keepCloudRecovery(value: any){
 const db=await openDb();try{const tx=db.transaction('recovery','readwrite'),finished=done(tx);tx.objectStore('recovery').put(value,'cloud-conflict');await finished;}finally{db.close();}
}

export async function getCloudRecovery(): Promise<any>{
 const db=await openDb();try{return await request(db.transaction('recovery','readonly').objectStore('recovery').get('cloud-conflict'));}finally{db.close();}
}

// The outbox and each local edit share IndexedDB transactions. A response may
// acknowledge only the IDs it actually accepted; later edits remain queued.
export async function syncMetadata(change?:(value:any)=>any,expectedRevision?:number,account=storageName):Promise<any>{
 const db=await openDb(account);try{
  const tx=db.transaction('meta',change?'readwrite':'readonly'),finished=done(tx),store=tx.objectStore('meta');
  if(expectedRevision!==undefined){const workspace=await request<any>(store.get('workspace'));if(workspace?.revision!==expectedRevision){tx.abort();await finished.catch(()=>{});throw Object.assign(Error('Newer device edits are ready.'),{deferred:true});}}
  let value=await request<any>(store.get(SYNC_KEY));
  if(change){value=change(value||null);store.put(value,SYNC_KEY);}
  await finished;return value||null;
 }finally{db.close();}
}

function bucketIO(store:IDBObjectStore){
 return {
  async load(kind:string,ids:string[]){const out=new Map<string,string|undefined>();for(const b of ids)out.set(b,await request<any>(store.get(kind+':'+b)));return out;},
  put(kind:string,bucket:string,state:string){store.put(state,kind+':'+bucket);},
 };
}
/** Runs `fn` on the outbox metadata and bucket states in one IndexedDB transaction. */
async function syncTransaction(fn:(meta:any,io:ReturnType<typeof bucketIO>)=>any,write:boolean,expectedRevision?:number,account=storageName):Promise<any>{
 const db=await openDb(account);try{
  const tx=db.transaction(['meta','syncBuckets'],write?'readwrite':'readonly'),finished=done(tx),store=tx.objectStore('meta'),io=bucketIO(tx.objectStore('syncBuckets'));
  if(expectedRevision!==undefined){const workspace=await request<any>(store.get('workspace'));if(workspace?.revision!==expectedRevision){tx.abort();await finished.catch(()=>{});throw Object.assign(Error('Newer device edits are ready.'),{deferred:true});}}
  let value=await request<any>(store.get(SYNC_KEY));
  const result=await fn(value||null,io);
  if(write){value=result;store.put(value,SYNC_KEY);}
  await finished;return write?value:result;
 }finally{db.close();}
}
// These operations run next to IndexedDB in the persistence worker. Every mutation
// keeps the original atomic transaction and revision checks.
export async function syncOperation(operation:string,args:any={},account=storageName):Promise<any>{
 const change=(fn:(m:any)=>any,revision?:number)=>syncMetadata(fn,revision,account);
 const read=()=>syncMetadata(undefined,undefined,account);
 if(operation==='status')return {initialized:!!await read()};
 const changeIO=(fn:(m:any,io:any)=>any,revision?:number)=>syncTransaction(fn,true,revision,account);
 const readIO=(fn:(m:any,io:any)=>any)=>syncTransaction(fn,false,undefined,account);
 if(operation==='initialize'){
  // Notes made on this device before the account had any are uploaded; otherwise the
  // device adopts the account's notes.
  const serverEmpty=!Object.keys(args.response.updates||{}).length;
  await changeIO(async(m,io)=>m||initializeOutbox(args.response,args.doc,args.assets,serverEmpty&&hasDeviceContent(args.doc,args.assets),io),args.doc.revision);return;
 }
 // Every save records its edit; this catches a document saved by an older code path. The
 // revision check avoids comparing whole documents on every sync.
 if(operation==='stage'){await changeIO(async(m,io)=>{if(m.mappedRevision!==args.doc.revision&&contentKey(m.mappedDoc)!==contentKey(args.doc))await recordLocal(m,args.doc,io);else m.mappedRevision=args.doc.revision;return stageAssets(m,args.assets,io);},args.doc.revision);return;}
 if(operation==='network'){
  const m=await change(claimOutbox);
  return {inflight:m.inflight,since:m.since,uploaded:m.uploaded||[],assets:m.inflight?await readIO((_m,io)=>bucketAssets(io,'L')):[]};
 }
 if(operation==='uploaded'){await change(m=>{m.uploaded=[...new Set([...(m.uploaded||[]),args.hash])];return m;});return;}
 if(operation==='receive'){await changeIO((m,io)=>receiveOutbox(m,args.response,io));return;}
 if(operation==='since')return (await read())?.since??0;
 if(operation==='recover'){let result:any=null;await changeIO(async(m,io)=>{result=await recoverRefused(m,io,account);return m;});return result;}
 if(operation==='recovery-export')return (await read())?.recoveries||[];
 if(operation==='recovery-notice')return null;
 if(operation==='recovery-notice-shown')return;
 if(operation==='current')return String((await read()).receivedVersion)===args.state;
 if(operation==='diagnose')return '';
 if(operation==='inspect'){
  return readIO(async(m,io)=>{
   // Nothing received since the device last adopted: its document already matches.
   if(!m.dirty&&m.mappedRevision===args.doc?.revision)return {needsApply:false,remaining:!!m.inflight||m.pending.length>0};
   const shared=await receivedProjection(m,io,account);
   const different=!args.doc||contentKey(args.doc)!==contentKey(shared.doc)||JSON.stringify(args.assets)!==JSON.stringify(shared.assets);
   const needsApply=different||!!m.dirty;
   return {needsApply,remaining:!!m.inflight||m.pending.length>0||!args.doc||contentKey(args.doc)!==contentKey(shared.doc),...(needsApply?{state:String(m.receivedVersion),doc:shared.doc,assets:shared.assets}:{})};
  });
 }
 if(operation==='selection'){
  if(!args.selection)return undefined;
  return readIO((m,io)=>mapSelection(m,args.selection,io));
 }
 throw Error('Unknown persistence operation.');
}

// Device-local research is deliberately outside workspace records and exports.
export type AiDraft={operation:'answer'|'explain'|'summarize'|'flashcards'|'mcqs';mode:'general'|'web';context:string;sourceIds:string[];sourceTexts:string[];selectionIds?:string[];complete:boolean;interrupted?:string;candidates?:any[];selected?:number[];sources?:{id:number;title:string;text:string;url:string;source:string}[];title?:string;reader?:{hash:string;selection:any;fingerprint:string};supported?:boolean};
export type ResearchDraft={id:string;query:string;answer:string;updatedAt:number;insertedId?:string;ai?:AiDraft};
export type ResearchState={generation:string;drafts:Record<string,ResearchDraft>};
export async function researchStore(change?: (value:ResearchState)=>ResearchState, expectedGeneration?:string, name=storageName):Promise<ResearchState>{
 const db=await openDb(name);try{
  const tx=db.transaction('meta','readwrite'),finished=done(tx),store=tx.objectStore('meta');
  let value=await request<ResearchState|undefined>(store.get('ai-drafts'));
  if(!value){const legacy=await request<ResearchState|undefined>(store.get('research-drafts'));if(legacy)value={generation:legacy.generation,drafts:Object.fromEntries(Object.entries(legacy.drafts).map(([id,d])=>[id,{...d,ai:{operation:'answer',mode:'web',context:d.query,sourceIds:[id],sourceTexts:[d.query],complete:false}}]))};}
  value=value||{generation:uuid(),drafts:{}};
  if(expectedGeneration&&value.generation!==expectedGeneration){tx.abort();await finished.catch(()=>{});throw Error('The workspace changed. Reopen research to continue.');}
  if(change)value=change(value);
  store.put(value,'ai-drafts');await finished;return value;
 }finally{db.close();}
}
