// Local sync between devices (desktop app): which CRDT content a device has, and what another
// device lacks. A device's 'R' bucket states are its complete copy of a workspace (its own edits
// and everything received), so two devices only need each other's state vectors to send exactly
// the missing updates. Yjs merging makes the order of delivery irrelevant.
import {Y,pack,unpack} from './sync-crdt.mjs';
import {isBucket} from './sync-buckets.mjs';

const caches=new Map();
/** Per-bucket state vectors of this device's copy; only buckets that changed are re-read. */
export async function peerVectors(meta,io,account=''){
 if(!caches.has(account))caches.set(account,new Map());
 const cache=caches.get(account),ver=meta.ver.R,stamp=b=>`${meta.epoch}:${ver[b]}`;
 const stale=Object.keys(ver).filter(b=>cache.get(b)?.v!==stamp(b)),states=await io.load('R',stale);
 for(const b of stale){const s=states.get(b);if(s)cache.set(b,{v:stamp(b),sv:pack(Y.encodeStateVectorFromUpdate(unpack(s)))});}
 const out={};for(const b of Object.keys(ver)){const x=cache.get(b);if(x)out[b]=x.sv;}
 return out;
}
/** Whether state vector `a` already contains everything in `b`. */
export function covers(a,b){
 const A=Y.decodeStateVector(unpack(a)),B=Y.decodeStateVector(unpack(b));
 for(const [client,clock] of B)if((A.get(client)||0)<clock)return false;
 return true;
}
/** Checks vectors received from another device. */
export function validVectors(v){
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 return Object.entries(v).every(([b,s])=>isBucket(b)&&typeof s==='string'&&s.length<1e6&&(()=>{try{Y.decodeStateVector(unpack(s));return true;}catch{return false;}})());
}
/** Whether this device lacks content the other device has. */
export function lacks(ours,theirs){return Object.keys(theirs).some(b=>!ours[b]||!covers(ours[b],theirs[b]));}
/** The updates another device lacks, given its vectors: per bucket, only the missing part. */
export async function peerDiff(meta,io,account,theirs){
 const ours=await peerVectors(meta,io,account),need=Object.keys(ours).filter(b=>!theirs[b]||!covers(theirs[b],ours[b]));
 if(!need.length)return {};
 const states=await io.load('R',need),out={};
 for(const b of need){const s=states.get(b);if(!s)continue;const d=theirs[b]?Y.diffUpdate(unpack(s),unpack(theirs[b])):unpack(s);if(d.length>2)out[b]=pack(d);}
 return out;
}
