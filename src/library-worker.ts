import {parseEpub} from './epub-parser.mjs';
import {cachedBook} from './book-cache';
import {cachedArticle} from './article-cache.mjs';
import {checkedUnits,searchLibrary,LIBRARY_TEXT_LIMIT} from './library-discovery.mjs';
// Dedicated worker: extraction, cache deserialization and matching never run on the editor thread.
let entries=new Map<string,any>(),budget=0,owner='',bookOwner='';
let database:Promise<IDBDatabase>|undefined;
const pdfRequests=new Map<string,{resolve:(units:any)=>void;reject:(e:Error)=>void}>();
function db(){return database??=new Promise((resolve,reject)=>{const r=indexedDB.open(owner+'-library-search',1);r.onupgradeneeded=()=>r.result.createObjectStore('units');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function cache(key:string,value?:any){const d=await db();return new Promise<any>((resolve,reject)=>{const tx=d.transaction('units',value?'readwrite':'readonly'),s=tx.objectStore('units'),r=value?s.put(value,key):s.get(key);let result:any;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error);});}
async function extract(source:any,blob:Blob){
 if(blob.size>25*1024*1024)throw Error('This file exceeds the local search budget.');
 if(source.kind==='article'){const value=JSON.parse(await blob.text());if(value.schema!==1||typeof value.text!=='string')throw Error('This saved article has no searchable text.');return [{unit:0,text:value.text}];}
 if(source.kind==='epub'){return (await parseEpub(await blob.arrayBuffer())).map((u:any,unit:number)=>({...u,unit}));}
 return new Promise<any>((resolve,reject)=>{pdfRequests.set(source.key,{resolve,reject});self.postMessage({type:'pdf',key:source.key,blob});});
}
self.onmessage=async(event:MessageEvent)=>{
 const m=event.data;
 if(m.type==='pdf-result'){const request=pdfRequests.get(m.key);if(request){pdfRequests.delete(m.key);m.error?request.reject(Error(m.error)):request.resolve(m.units);}return;}
 if(m.type==='search'){self.postMessage({type:'results',sequence:m.sequence,hits:searchLibrary(entries,m.query)});return;}
 if(m.type!=='open'||owner)return;owner=m.owner;bookOwner=m.bookOwner;
 for(const source of m.sources){
  self.postMessage({type:'status',key:source.key,state:'Indexing…'});
  try{
   const blob=source.kind==='article'?(source.blob||(await cachedArticle(owner,source.hash))?.blob):await cachedBook(bookOwner,source.id+':'+source.hash);
   if(!blob){self.postMessage({type:'status',key:source.key,state:'Not available on this device. Open it once, then refresh search.'});continue;}
   const key='v1:'+source.kind+':'+source.hash;let units;try{units=await cache(key);if(units)checkedUnits(units);}catch{units=undefined;}
   const reused=!!units;if(!units)units=await extract(source,blob);const value=checkedUnits(units);
   if(!units.some((u:any)=>u.text.trim()))throw Error(source.kind==='pdf'?'No searchable text. Image-only PDFs need OCR.':'No searchable text.');
   if(budget+value.size>LIBRARY_TEXT_LIMIT)throw Error('Local search budget reached. Search a smaller library.');
   entries.set(source.key,{...value,hash:source.hash});budget+=value.size;let retained=true;
   if(!reused)try{await cache(key,units);}catch{retained=false;}
   self.postMessage({type:'status',key:source.key,state:retained?'Ready':'Ready for this session; index cache unavailable',ready:true,reused});
  }catch(error){self.postMessage({type:'status',key:source.key,state:(error as Error).message||'This source could not be indexed.'});}
 }
 self.postMessage({type:'done'});
};
