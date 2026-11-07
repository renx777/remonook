// Device side of sync v3: the same durable outbox as v2, with bucketed CRDT state.
//
// Bucket states live in their own IndexedDB records ('L:<bucket>' for what this device wrote,
// 'R:<bucket>' for everything known: acknowledged server state plus local edits). The outbox
// metadata stays small: pending batches, the in-flight request and per-bucket version numbers.
// A save reads and writes only the buckets its change touches.
//
// `io` is supplied by the persistence layer inside one IndexedDB transaction:
//   io.load(kind, buckets) → Promise<Map bucket → state>   (kind 'L' or 'R')
//   io.put(kind, bucket, state)
import {Y,pack,unpack,projectParts} from './sync-crdt.mjs';
import {planDocument,writePlan,mergeChanged,projectVersions,openBucket,bulletBucket,ASSET_BUCKET} from './sync-buckets.mjs';
import {cloudDocument} from './cloud-model.mjs';
import {catalogAssetPaths} from './emoji-catalog.mjs';

const actor=new Y.Doc(),sessionClient=actor.clientID;actor.destroy();
const BATCH_BYTES=3*1024*1024;
const bump=(meta,kind,bucket)=>{meta.ver[kind][bucket]=(meta.ver[kind][bucket]||0)+1;};
function put(meta,io,kind,changed){for(const [b,s] of changed){io.put(kind,b,s);bump(meta,kind,b);}}

async function queue(meta,io,updates){
 const buckets=Object.keys(updates);if(!buckets.length)return;
 meta.pending.push({id:crypto.randomUUID(),updates});
 const received=await io.load('R',buckets);put(meta,io,'R',mergeChanged(b=>received.get(b),updates));
 meta.receivedVersion=(meta.receivedVersion||0)+1;
}
const caches=new Map();
/** Projection of every received bucket; only buckets whose version changed are read and decoded. */
export async function receivedProjection(meta,io,account=''){
 if(!caches.has(account))caches.set(account,new Map());
 const cache=caches.get(account),versions=new Map(Object.entries(meta.ver.R).map(([b,v])=>[b,`${meta.epoch}:${v}`]));
 const stale=[...versions].filter(([b,v])=>cache.get(b)?.version!==v).map(([b])=>b),states=await io.load('R',stale);
 return projectVersions(versions,b=>states.get(b),cache);
}
export async function bucketAssets(io,kind){const s=(await io.load(kind,[ASSET_BUCKET])).get(ASSET_BUCKET);if(!s)return [];const d=openBucket(s);try{return projectParts(d).assets.sort((a,b)=>a.path.localeCompare(b.path));}finally{d.destroy();}}

/** First sync on this device. `server` is the merged pull ({updates, revision}). */
export async function initializeOutbox(server,doc,assets,pushDevice,io){
 const meta={protocol:3,epoch:crypto.randomUUID(),ver:{L:{},R:{}},unsynced:{},receivedVersion:1,dirty:false,mappedDoc:null,assets:[],pending:[],inflight:null,since:server.revision,uploaded:[]};
 const states=mergeChanged(()=>undefined,server.updates);put(meta,io,'L',states);put(meta,io,'R',states);
 meta.assets=await bucketAssets({load:async(_,ids)=>new Map(ids.map(b=>[b,states.get(b)]))},'R');meta.uploaded=meta.assets.map(a=>a.hash);
 meta.mappedDoc=(await receivedProjection(meta,{load:async(_,ids)=>new Map(ids.map(b=>[b,states.get(b)]))})).doc;
 // A device with notes and an empty account uploads its notes; otherwise it adopts the account.
 if(pushDevice){
  const plan=planDocument(null,doc,{assetsBefore:[],assetsAfter:assets}),{changed,updates}=writePlan(plan,b=>states.get(b),{clientID:sessionClient});
  put(meta,io,'L',changed);meta.mappedDoc=cloudDocument(doc);meta.mappedRevision=doc.revision;meta.assets=assets;await queue(meta,io,updates);
 }
 return meta;
}
/** Records a local edit. When `previous` is the document this outbox last recorded, it is
 diffed instead of the stored copy: the app shares unchanged rows between the two versions,
 so only changed rows are inspected. */
export async function recordLocal(meta,doc,io,previous){
 const base=previous&&meta.mappedRevision!==undefined&&previous.revision===meta.mappedRevision?previous:meta.mappedDoc;
 const plan=planDocument(base,doc,{assetsBefore:meta.assets,assetsAfter:meta.assets});
 meta.mappedDoc=cloudDocument(doc);meta.mappedRevision=doc.revision;
 if(!plan.touched.size)return meta;
 const local=await io.load('L',[...plan.touched]),{changed,updates}=writePlan(plan,b=>local.get(b),{clientID:sessionClient});
 put(meta,io,'L',changed);await queue(meta,io,updates);
 return meta;
}
export async function stageAssets(meta,assets,io){
 const next=new Map(assets.map(a=>[a.path,a])),prior=new Map(meta.assets.map(a=>[a.path,a]));
 // Absence from an incomplete browser cache is not deletion of an emoji that still exists.
 const emojis=(meta.mappedDoc.tables.emojis||[]).filter(e=>typeof e.fileName==='string'),referenced=new Set(emojis.flatMap(catalogAssetPaths));
 for(const a of [...await bucketAssets(io,'L'),...meta.assets])if(referenced.has(a.path)&&!next.has(a.path)){next.set(a.path,a);prior.set(a.path,a);}
 const effective=[...next.values()].sort((a,b)=>a.path.localeCompare(b.path)),before=[...prior.values()].sort((a,b)=>a.path.localeCompare(b.path));
 if(JSON.stringify(effective)!==JSON.stringify(before)){
  const plan=planDocument(meta.mappedDoc,meta.mappedDoc,{assetsBefore:before,assetsAfter:effective}),local=await io.load('L',[...plan.touched]);
  const {changed,updates}=writePlan(plan,b=>local.get(b),{clientID:sessionClient});put(meta,io,'L',changed);await queue(meta,io,updates);
 }
 meta.assets=effective;return meta;
}
export function claimOutbox(meta){
 if(meta.inflight||!meta.pending.length)return meta;
 const batch=[];let bytes=0;
 for(const entry of meta.pending.slice(0,64)){const size=JSON.stringify(entry.updates).length;if(batch.length&&bytes+size>BATCH_BYTES)break;batch.push(entry);bytes+=size;}
 const lists={};for(const e of batch)for(const [b,u] of Object.entries(e.updates))(lists[b]||=[]).push(unpack(u));
 meta.inflight={operationId:crypto.randomUUID(),ids:batch.map(e=>e.id),updates:Object.fromEntries(Object.entries(lists).map(([b,l])=>[b,pack(l.length===1?l[0]:Y.mergeUpdates(l))])),since:meta.since};
 return meta;
}
export async function receiveOutbox(meta,response,io){
 if(response.protocol!==3||!Number.isSafeInteger(response.revision)||response.revision<0)throw Error('Invalid sync response');
 const buckets=Object.keys(response.updates||{});
 if(buckets.length){const received=await io.load('R',buckets);put(meta,io,'R',mergeChanged(b=>received.get(b),response.updates));for(const b of buckets)meta.unsynced[b]=true;meta.receivedVersion=(meta.receivedVersion||0)+1;meta.dirty=true;}
 meta.since=Math.max(meta.since,response.revision);
 if(response.acked){if(response.acked!==meta.inflight?.operationId)throw Error('Unexpected sync acknowledgement');const ids=new Set(meta.inflight.ids);meta.pending=meta.pending.filter(x=>!ids.has(x.id));meta.inflight=null;}
 return meta;
}
/** Adopts the received state as this device's own (after the app applied it). */
export async function adopt(meta,doc,io){
 // Buckets that received content this device has not adopted yet; local edits reach both copies.
 const stale=Object.keys(meta.unsynced),received=await io.load('R',stale);
 for(const b of stale){io.put('L',b,received.get(b));bump(meta,'L',b);}
 meta.unsynced={};
 meta.dirty=false;meta.mappedDoc=cloudDocument(doc);meta.mappedRevision=doc.revision;meta.assets=await bucketAssets(io,'R');return meta;
}
/** Maps a caret in a bullet from the local text to the received text. */
export async function mapSelection(meta,selection,io){
 const bucket=bulletBucket(selection.id),name='text:'+JSON.stringify(['bullets',selection.id]);
 const a=openBucket((await io.load('L',[bucket])).get(bucket)),b=openBucket((await io.load('R',[bucket])).get(bucket));
 try{const text=a.getText(name),out=b.getText(name);const map=pos=>{const relative=Y.createRelativePositionFromTypeIndex(text,Math.max(0,Math.min(pos,text.length)));return Y.createAbsolutePositionFromRelativePosition(relative,b)?.index??Math.min(pos,out.length);};return {...selection,anchor:map(selection.anchor),head:map(selection.head)};}
 finally{a.destroy();b.destroy();}
}
