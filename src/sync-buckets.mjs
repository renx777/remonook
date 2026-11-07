// Sync v3: one account's shared document stored as many small Yjs documents ("buckets").
//
// The v2 CRDT layout already keys everything per record: rows["[table,id]"],
// fields["row",key,field], text:<key>, and root fields by JSON path. Yjs items under
// different keys never reference each other, so routing every key to a fixed bucket
// keeps merge behaviour identical while a save opens only the buckets it touches.
// App, server and tests must use these functions so they agree on every key's bucket.
import {Y,pack,unpack,documentParts,applyParts,projectParts,assembleParts,normalizeTree} from './sync-crdt.mjs';
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

/**
 * Writes the difference between two documents into bucket states.
 * `states` maps bucket → base64 state and is not modified. Returns the new states (a copy
 * where only touched buckets changed) and the per-bucket incremental updates.
 * Only buckets whose parts differ are opened: the cost follows the edit, not the workspace.
 */
export function applyDocument(states,before,after,{assetsBefore=[],assetsAfter=[],rebase=false,clientID}={}){
 const b=splitParts(documentParts(before)),a=splitParts(documentParts(after)),next=new Map(states),updates={};
 const touched=new Set();
 for(const key of new Set([...b.keys(),...a.keys()]))if(!samePart(b.get(key),a.get(key)))touched.add(key);
 if(!sameAssets(assetsBefore,assetsAfter))touched.add(ASSET_BUCKET);
 for(const bucket of touched){
  const d=openBucket(states.get(bucket),clientID);
  try{
   const v=Y.encodeStateVector(d);
   const asset=bucket===ASSET_BUCKET;
   applyParts(d,b.get(bucket)||emptyPart(),a.get(bucket)||emptyPart(),asset?assetsBefore:[],asset?assetsAfter:[],rebase);
   const update=Y.encodeStateAsUpdate(d,v);
   if(update.length>2){updates[bucket]=pack(update);next.set(bucket,pack(Y.encodeStateAsUpdate(d)));}
  }finally{d.destroy();}
 }
 return {states:next,updates};
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
 const parts=[];
 for(const [bucket,state] of states){
  let hit=cache.get(bucket);
  if(!hit||hit.state!==state){const d=openBucket(state);try{hit={state,parts:projectParts(d)};}finally{d.destroy();}cache.set(bucket,hit);}
  parts.push(hit.parts);
 }
 for(const bucket of cache.keys())if(!states.has(bucket))cache.delete(bucket);
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

/** The keys that differ between two documents, with their before and after values.
 Serializable, so a server-side change (AI apps) can be sent to the account's sync store
 and applied there with rebase against whatever other devices committed meanwhile. */
export function diffPatch(before,after){
 const b=documentParts(before),a=documentParts(after),patch={leaves:[[],[]],rows:[[],[]]};
 for(const k of new Set([...b.leaves.keys(),...a.leaves.keys()])){const x=b.leaves.get(k),y=a.leaves.get(k);if(fast(x)===fast(y))continue;if(b.leaves.has(k))patch.leaves[0].push([k,x]);if(a.leaves.has(k))patch.leaves[1].push([k,y]);}
 for(const name of new Set([...b.tables.keys(),...a.tables.keys()])){const B=b.tables.get(name)||new Map(),A=a.tables.get(name)||new Map();
  for(const k of new Set([...B.keys(),...A.keys()])){const x=B.get(k),y=A.get(k);if(fast(x)===fast(y))continue;if(B.has(k))patch.rows[0].push([name,k,x]);if(A.has(k))patch.rows[1].push([name,k,y]);}}
 return patch;
}
export const emptyPatch=p=>!p.leaves[0].length&&!p.leaves[1].length&&!p.rows[0].length&&!p.rows[1].length;
/** Groups a patch by bucket: Map bucket → [beforePart, afterPart]. */
export function patchBuckets(patch){
 const out=new Map(),at=(bucket,side)=>{if(!out.has(bucket))out.set(bucket,[emptyPart(),emptyPart()]);return out.get(bucket)[side];};
 patch.leaves.forEach((list,side)=>{for(const [k,v] of list)at(leafBucket(k),side).leaves.set(k,v);});
 patch.rows.forEach((list,side)=>{for(const [name,k,row] of list){const part=at(rowBucket(k),side);if(!part.tables.has(name))part.tables.set(name,new Map());part.tables.get(name).set(k,row);}});
 return out;
}
export {applyParts,projectParts,assembleParts};
