// Sync v3: one account's shared document stored as many small Yjs documents ("buckets").
//
// The v2 CRDT layout already keys everything per record: rows["[table,id]"],
// fields["row",key,field], text:<key>, and root fields by JSON path. Yjs items under
// different keys never reference each other, so routing every key to a fixed bucket
// keeps merge behaviour identical while a save opens only the buckets it touches.
// App, server and tests must use these functions so they agree on every key's bucket.
import {Y,pack,unpack,documentParts,documentLeaves,rowKey,applyParts,projectParts,assembleParts,normalizeTree} from './sync-crdt.mjs';
import {validateMirrors} from './relations.mjs';

export const PROTOCOL_V3=3,ROW_BUCKETS=256,ROOT_BUCKETS=16,ASSET_BUCKET='a',TABLES_BUCKET='r0';
/** Root maps with one entry per bullet. Their entries live with the bullet's row. */
const PER_ROW={noteTimes:'bullets'};

function fnv(text){let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193);}return h>>>0;}
export const rowBucket=key=>'b'+(fnv(key)%ROW_BUCKETS);
export function leafBucket(pathJson){
 const path=JSON.parse(pathJson);
 if(path[0]==='web'&&PER_ROW[path[1]]&&path.length>2)return rowBucket(JSON.stringify([PER_ROW[path[1]],String(path[2])]));
 return 'r'+(fnv(JSON.stringify(path.slice(0,2)))%ROOT_BUCKETS);
}
export const isBucket=b=>typeof b==='string'&&(b===ASSET_BUCKET||/^b(?:[0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])$/.test(b)||/^r(?:[0-9]|1[0-5])$/.test(b));
/** The bucket holding a bullet's text, location and fields. */
export const bulletBucket=id=>rowBucket(JSON.stringify(['bullets',String(id)]));

const emptyPart=()=>({leaves:new Map(),tables:new Map()});
/** Splits documentParts output into per-bucket parts. Table names always go to TABLES_BUCKET
 so empty tables still project. */
export function splitParts(parts){
 const out=new Map(),at=b=>{if(!out.has(b))out.set(b,emptyPart());return out.get(b);};
 for(const [k,v] of parts.leaves)at(leafBucket(k)).leaves.set(k,v);
 for(const [name,rows] of parts.tables){
  at(TABLES_BUCKET).tables.set(name,at(TABLES_BUCKET).tables.get(name)||new Map());
  for(const [key,row] of rows){const part=at(rowBucket(key));if(!part.tables.has(name))part.tables.set(name,new Map());part.tables.get(name).set(key,row);}
 }
 return out;
}
const fast=x=>JSON.stringify(x);
function samePart(a,b){
 if(!a||!b)return !a&&!b;
 if(a.leaves.size!==b.leaves.size||a.tables.size!==b.tables.size)return false;
 for(const [k,v] of a.leaves)if(!b.leaves.has(k)||fast(v)!==fast(b.leaves.get(k)))return false;
 for(const [name,rows] of a.tables){const other=b.tables.get(name);if(!other||other.size!==rows.size)return false;for(const [k,row] of rows){const o=other.get(k);if(o!==row&&fast(o)!==fast(row))return false;}}
 return true;
}
const sameAssets=(a,b)=>fast(a)===fast(b);

/** Opens a bucket's state (base64) as a Y.Doc. */
// The client id is set after loading: Yjs treats its own id arriving in an update as a clash
// and picks a random id, which would make concurrent tie-breaks differ between devices.
export function openBucket(state,clientID){const d=new Y.Doc();if(state)Y.applyUpdate(d,unpack(state));if(clientID!==undefined)d.clientID=clientID;return d;}

/** Rows as stored in the shared document (device-only fields removed). */
const cloudRow=(table,row)=>table==='bullets'?{...row,collapsed:false}:row;
function cloudRoot(doc){
 if(!doc)return {web:{},columns:{},preferences:{}};
 const {revision,tables,...rest}=doc,{deviceId,...web}=rest.web||{};
 if(web.workdays)web.workdays={...web.workdays,view:'day'};
 return {...rest,web};
}
/**
 * The changed keys between two documents as a patch: [before, after] lists of leaves and rows.
 * Rows that are the same object in both documents are skipped without inspection, so a save
 * from the app (which shares unchanged rows between versions) costs O(changed rows).
 */
export function diffPatch(before,after){
 const patch={leaves:[[],[]],rows:[[],[]]},bl=documentLeaves(cloudRoot(before)),al=documentLeaves(cloudRoot(after));
 for(const k of new Set([...bl.keys(),...al.keys()])){const x=bl.get(k),y=al.get(k);if(x===y||fast(x)===fast(y))continue;if(bl.has(k))patch.leaves[0].push([k,x]);if(al.has(k))patch.leaves[1].push([k,y]);}
 const bt=before?.tables||{},at=after?.tables||{};
 for(const name of new Set([...Object.keys(bt),...Object.keys(at)])){
  const B=bt[name]||[],A=at[name]||[];
  if(B===A)continue;
  // Same length and the changed rows keep their place (an edit, not an insert or delete):
  // compare only those rows instead of indexing the whole table.
  if(B.length===A.length&&name in bt){
   const diff=[];for(let i=0;i<A.length;i++)if(A[i]!==B[i])diff.push(i);
   if(diff.every(i=>rowKey(name,B[i],i)===rowKey(name,A[i],i))){
    for(const i of diff){const k=rowKey(name,A[i],i),ca=cloudRow(name,A[i]),cb=cloudRow(name,B[i]);if(fast(cb)!==fast(ca)){patch.rows[0].push([name,k,cb]);patch.rows[1].push([name,k,ca]);}}
    continue;
   }
  }
  const bm=new Map(B.map((r,i)=>[rowKey(name,r,i),r])),am=new Map(A.map((r,i)=>[rowKey(name,r,i),r]));
  if(!(name in bt))patch.tables=[...(patch.tables||[]),name];
  for(const [k,r] of am){const o=bm.get(k);if(o===r)continue;const ca=cloudRow(name,r),cb=o&&cloudRow(name,o);if(cb&&fast(cb)===fast(ca))continue;if(cb)patch.rows[0].push([name,k,cb]);patch.rows[1].push([name,k,ca]);}
  for(const [k,o] of bm)if(!am.has(k))patch.rows[0].push([name,k,cloudRow(name,o)]);
 }
 return patch;
}
/** Works out which buckets differ between two documents, without opening any Yjs document. */
export function planDocument(before,after,{assetsBefore=[],assetsAfter=[]}={}){
 const patch=diffPatch(before,after),parts=patchBuckets(patch);
 if(patch.tables?.length){if(!parts.has(TABLES_BUCKET))parts.set(TABLES_BUCKET,[emptyPart(),emptyPart()]);for(const name of patch.tables)if(!parts.get(TABLES_BUCKET)[1].tables.has(name))parts.get(TABLES_BUCKET)[1].tables.set(name,new Map());}
 const b=new Map([...parts].map(([k,v])=>[k,v[0]])),a=new Map([...parts].map(([k,v])=>[k,v[1]])),touched=new Set(parts.keys());
 if(!sameAssets(assetsBefore,assetsAfter))touched.add(ASSET_BUCKET);
 return {b,a,touched,assetsBefore,assetsAfter};
}
/** Applies a plan to the touched buckets. `get(bucket)` returns a bucket's state (base64).
 Returns only the buckets that changed, and their incremental updates. */
export function writePlan(plan,get,{rebase=false,clientID}={}){
 const changed=new Map(),updates={};
 for(const bucket of plan.touched){
  const d=openBucket(get(bucket),clientID);
  try{
   const v=Y.encodeStateVector(d),asset=bucket===ASSET_BUCKET;
   applyParts(d,plan.b.get(bucket)||emptyPart(),plan.a.get(bucket)||emptyPart(),asset?plan.assetsBefore:[],asset?plan.assetsAfter:[],rebase);
   const update=Y.encodeStateAsUpdate(d,v);
   if(update.length>2){updates[bucket]=pack(update);changed.set(bucket,pack(Y.encodeStateAsUpdate(d)));}
  }finally{d.destroy();}
 }
 return {changed,updates};
}
/**
 * Writes the difference between two documents into bucket states.
 * `states` maps bucket → base64 state and is not modified. Returns the new states (a copy
 * where only touched buckets changed) and the per-bucket incremental updates.
 * Only buckets whose parts differ are opened: the cost follows the edit, not the workspace.
 */
export function applyDocument(states,before,after,{assetsBefore=[],assetsAfter=[],rebase=false,clientID}={}){
 const plan=planDocument(before,after,{assetsBefore,assetsAfter}),{changed,updates}=writePlan(plan,b=>states.get(b),{rebase,clientID});
 const next=new Map(states);for(const [b,s] of changed)next.set(b,s);
 return {states:next,updates};
}

/** Merges per-bucket updates into the given states; returns only the changed buckets. */
export function mergeChanged(get,updates){
 const changed=new Map();
 for(const [bucket,update] of Object.entries(updates||{})){
  if(!isBucket(bucket))throw Error('Invalid sync bucket');
  const current=get(bucket);
  changed.set(bucket,pack(current?Y.mergeUpdates([unpack(current),unpack(update)]):unpack(update)));
 }
 return changed;
}
/** Merges incoming per-bucket updates into states. Returns the new states. */
export function mergeUpdates(states,updates){
 const next=new Map(states);
 for(const [bucket,update] of Object.entries(updates||{})){
  if(!isBucket(bucket))throw Error('Invalid sync bucket');
  const current=next.get(bucket);
  next.set(bucket,pack(current?Y.mergeUpdates([unpack(current),unpack(update)]):unpack(update)));
 }
 return next;
}
/** Per-bucket state vectors (base64), for asking the server what this device lacks. */
export function bucketVectors(states){const out={};for(const [b,s] of states)out[b]=pack(Y.encodeStateVectorFromUpdate(unpack(s)));return out;}

/**
 * Projects bucket states into the document. `cache` (a Map) keeps each bucket's parts by its
 * state, so unchanged buckets are not decoded again.
 * The result is normalised the same way on every device and on the server: a missing parent
 * becomes a root, a move cycle is broken at its smallest id, invalid mirror links are removed.
 */
export function projectBuckets(states,cache=new Map()){
 return projectVersions(new Map([...states].map(([b,s])=>[b,s])),b=>states.get(b),cache);
}
/** Like projectBuckets, but `versions` (bucket → any value that changes with the state) decides
 which buckets to decode, and `get` is called only for those. */
export function projectVersions(versions,get,cache=new Map()){
 const parts=[];
 for(const [bucket,version] of versions){
  let hit=cache.get(bucket);
  if(!hit||hit.version!==version){const d=openBucket(get(bucket));try{hit={version,parts:projectParts(d)};}finally{d.destroy();}cache.set(bucket,hit);}
  parts.push(hit.parts);
 }
 for(const bucket of cache.keys())if(!versions.has(bucket))cache.delete(bucket);
 const value=assembleParts(parts);
 readRepair(value.doc);
 return value;
}
/** Deterministic read-time repair (no CRDT writes). */
export function readRepair(doc){
 if(!doc.tables.bullets)doc.tables.bullets=[];
 try{normalizeTree(doc);}catch{/* shape problems are rejected at write time */}
 try{validateMirrors(doc.tables.bullets);}catch{for(const n of doc.tables.bullets){delete n.mirrorSourceId;delete n.mirrorRootId;}}
 return doc;
}

export const emptyPatch=p=>!p.leaves[0].length&&!p.leaves[1].length&&!p.rows[0].length&&!p.rows[1].length&&!p.tables?.length;
/** Groups a patch by bucket: Map bucket → [beforePart, afterPart]. */
export function patchBuckets(patch){
 const out=new Map(),at=(bucket,side)=>{if(!out.has(bucket))out.set(bucket,[emptyPart(),emptyPart()]);return out.get(bucket)[side];};
 patch.leaves.forEach((list,side)=>{for(const [k,v] of list)at(leafBucket(k),side).leaves.set(k,v);});
 patch.rows.forEach((list,side)=>{for(const [name,k,row] of list){const part=at(rowBucket(k),side);if(!part.tables.has(name))part.tables.set(name,new Map());part.tables.get(name).set(k,row);}});
 return out;
}
export {applyParts,projectParts,assembleParts};
