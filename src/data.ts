import {syncMirrors,validateMirrors} from "./relations.mjs";
import {validateOcclusions} from "./occlusion.mjs";
import {validateStudyLibrary,studyFolders} from './study-library.mjs';
import {validateCalendarEvents} from './calendar-events.mjs';
import {validateWorkdays} from './workdays.mjs';
import JSZip from "jszip";
import { inspectZip } from "./zip-safety";
import fieldRules from "./android-fields.json" with { type: "json" };
import schema from "./android-schema.json" with { type: "json" };
import { bullet, validate, refreshCards } from "./domain.mjs";
import { isNotoEmoji, notoPosterPath, NOTO_CREDIT_PATH } from './noto-emojis.mjs';
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
    web: { contract: "1.0.0", deviceId: crypto.randomUUID() },
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
  nodes = syncMirrors(doc.tables.bullets, nodes);
  const oldNodes=new Map(doc.tables.bullets.map(n=>[n.id,n]));
  const noteTimes={...doc.web.noteTimes},now=Date.now();
  for(const n of nodes){const before=oldNodes.get(n.id);if(!before||['text','formatting','parentId','position','taskState','dueDate','kind','blockStyle','codeLanguage'].some(k=>before[k]!==n[k]))noteTimes[n.id]={...noteTimes[n.id],...(!before?{createdAt:now}:{}),updatedAt:now};}
  doc={...doc,web:{...doc.web,noteTimes}};
  const detached=nodes.filter(n=>!n.mirrorSourceId&&oldNodes.get(n.id)?.mirrorSourceId);
  const detachedMedia=detached.flatMap(n=>doc.tables.media.filter(m=>m.bulletId===oldNodes.get(n.id)!.mirrorSourceId).map(m=>({...m,id:crypto.randomUUID(),bulletId:n.id})));
  if(detachedMedia.length)doc={...doc,tables:{...doc.tables,media:[...doc.tables.media,...detachedMedia]}};

  validate(nodes);
  const ids = new Set(nodes.map((n) => n.id)),
    sourceIds = new Set([...doc.tables.bullets.map(node => node.id), ...ids]),
    sourceCards = doc.tables.cards.filter(card => sourceIds.has(card.id)),
    independentCards = doc.tables.cards.filter(card => !sourceIds.has(card.id));
  const media = doc.tables.media.filter((m) => ids.has(m.bulletId)),
    decks = doc.tables.decks.filter((d) => ids.has(d.rootId)),excluded=new Set(doc.web.studyExcludedCards||[]);
  return {
    ...doc,
    columns: { ...doc.columns,
      media: media.some(item=>item.displayWidth!==undefined) && !doc.columns.media.includes("displayWidth") ? [...doc.columns.media,"displayWidth"] : doc.columns.media,
      bullets: [...new Set([...doc.columns.bullets.filter(field=>nodes.some(n=>n.mirrorSourceId)||!['mirrorSourceId','mirrorRootId'].includes(field)), ...nodes.flatMap(node => node.mirrorSourceId ? ['mirrorSourceId','mirrorRootId'] : []), ...(nodes.some(node=>node.blockStyle&&node.blockStyle!=='paragraph')?['blockStyle']:[])])],
      decks: doc.tables.decks.some(deck => deck.layout) && !doc.columns.decks.includes('layout') ? [...doc.columns.decks, 'layout'] : doc.columns.decks,
    },
    tables: {
      ...doc.tables,
      bullets: nodes,
      media,
      decks,
      cards: [...independentCards, ...refreshCards(nodes, decks.filter(deck => doc.web.deckTypes?.[deck.rootId] !== "MCQ"), media, sourceCards, Date.now())].map(card=>excluded.has(card.id)?{...card,state:'INACTIVE'}:card),
    },
  };
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
  if(doc.tables.bullets.some(node=>node.mirrorSourceId))reasons.push("Mirrors require a full web backup");
  if(doc.web.calendarEvents?.length)reasons.push('Calendar reminders require a full web backup');
  if(doc.web.workdays)reasons.push('Workdays require a full web backup');
  if(doc.web.studyFolders?.length||Object.keys(doc.web.deckFolders||{}).length||doc.web.studyExcludedCards?.length)reasons.push("Study folders and removed study cards require a full web backup");
  if(Object.keys(doc.web.occlusions||{}).length)reasons.push("Image occlusion cards require a full web backup");
  if (doc.tables.bullets.some(node => /(?:^|;)\d+:\d+:MASK(?:;|$)/.test(node.formatting || ""))) reasons.push("Masked text requires a full web backup");
  if (doc.tables.emojis.some(isNotoEmoji)) reasons.push("Noto animated WebP emojis require a full web backup");
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
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("meta");
      r.result.createObjectStore("records");
      r.result.createObjectStore("assets");
      r.result.createObjectStore("recovery");
      r.result.createObjectStore("operations", { autoIncrement: true });
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
    validateWorkdays(m.web?.workdays);
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
): Promise<Workspace> {
  validateWorkdays(after.web.workdays);
  const db = await openDb();
  try {
    const tx = db.transaction(
        ["meta", "records", "assets", "recovery", "operations"],
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
      const next = { ...after, revision: (before?.revision ?? 0) + 1 };
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
        if (!prev.has(k) || JSON.stringify(prev.get(k)) !== JSON.stringify(v)) {
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
        id: crypto.randomUUID(),
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
export const digest = async (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
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
    paths.add("emoji/" + e.fileName);
    if (isNotoEmoji(e)) { paths.add(notoPosterPath(e)); paths.add(NOTO_CREDIT_PATH); }
  }
  for (const t of doc.tables.trash) {
    const p = JSON.parse(t.payload);
    for (const m of p.media || []) paths.add("media/" + m.fileName);
  }
  return paths;
}
const safe = (p: string) =>
  /^(media|emoji)\/[A-Za-z0-9._-]+$/.test(p) &&
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
    ...(!android ? { web: doc.web } : {}),
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
  validateOcclusions(doc.web.occlusions);
  validateStudyLibrary(doc.web);
  validateCalendarEvents(doc.web.calendarEvents);
  validateWorkdays(doc.web.workdays);
  for(const item of doc.tables.media)if(item.displayWidth!=null&&(!Number.isFinite(item.displayWidth)||item.displayWidth<15||item.displayWidth>100))throw Error("Invalid image display width");
  const warnings = androidBlockers(doc);
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

export async function cloudCheckpoint(value?: any): Promise<any> {
 const db=await openDb();try{const tx=db.transaction('meta',value===undefined?'readonly':'readwrite'),finished=done(tx);
 if(value!==undefined)tx.objectStore('meta').put(value,'cloud-checkpoint');
 const result=value===undefined?await request(tx.objectStore('meta').get('cloud-checkpoint')):value;await finished;return result||null;}finally{db.close();}
}
export async function keepCloudRecovery(value: any){
 const db=await openDb();try{const tx=db.transaction('recovery','readwrite'),finished=done(tx);tx.objectStore('recovery').put(value,'cloud-conflict');await finished;}finally{db.close();}
}

export async function getCloudRecovery(): Promise<any>{
 const db=await openDb();try{return await request(db.transaction('recovery','readonly').objectStore('recovery').get('cloud-conflict'));}finally{db.close();}
}
