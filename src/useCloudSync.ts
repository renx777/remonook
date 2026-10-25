import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {authenticatedUid} from './CloudAccount';
import {CLOUD_API} from './cloud-config';
import {syncMetadata,cloudCheckpoint,digest,type Workspace} from './data';
import {contentKey,recoverCheckpoint,hasDeviceContent} from './cloud-model.mjs';
import {initializeOutbox,recordLocal,stageAssets,claimOutbox,receiveOutbox} from './sync-outbox.mjs';
import {Y,openShared,vector,project,emptyShared} from './sync-crdt.mjs';
type Asset={path:string;hash:string;size:number;type:string};
type Selection={id:string;anchor:number;head:number};
type Apply={state:string;selection?:Selection};
type Options={user:User|null;revision?:number;ready:boolean;get:()=>{doc:Workspace|null;assets:Map<string,Blob>};flush:()=>Promise<unknown>;canApply:()=>boolean;selection?:()=>Selection|null;apply:(doc:Workspace,assets:Map<string,Blob>,sync?:Apply)=>Promise<void>};
export function useCloudSync(options:Options){
 const latest=useRef(options);latest.current=options;
 const busy=useRef(false),queued=useRef(false),alive=useRef(true),timer=useRef<ReturnType<typeof setTimeout>|null>(null),failures=useRef(0),cache=useRef(new WeakMap<Blob,string>());
 const [status,setStatus]=useState(options.user?'Connecting…':'Device only'),[error,setError]=useState('');
 async function request(path:string,init:RequestInit={}){
  const user=latest.current.user;if(!user||authenticatedUid()!==user.uid)throw Error('Sign in again to continue saving to your account.');
  const headers=new Headers(init.headers);headers.set('Authorization','Bearer '+await user.getIdToken());
  const r=await fetch(CLOUD_API+path,{...init,headers,signal:AbortSignal.timeout(30000),cache:'no-store'});
  if(!r.ok&&r.status!==304){const data=await r.json().catch(()=>({}));throw Object.assign(Error(data.error||'Your changes are saved on this device. Reconnecting…'),{status:r.status});}return r;
 }
 async function manifest(files:Map<string,Blob>){const out:Asset[]=[];for(const [path,blob]of files){let hash=cache.current.get(blob);if(!hash){hash=await digest(await blob.arrayBuffer());cache.current.set(blob,hash);}out.push({path,hash,size:blob.size,type:blob.type});}return out.sort((a,b)=>a.path.localeCompare(b.path));}
 async function materialize(assets:Asset[]){const local=latest.current.get(),known=await manifest(local.assets),byPath=new Map(known.map(a=>[a.path,a])),files=new Map<string,Blob>();
  for(const a of assets){if(byPath.get(a.path)?.hash===a.hash){files.set(a.path,local.assets.get(a.path)!);continue;}
   const bytes=await(await request('/assets/'+a.hash)).arrayBuffer();if(await digest(bytes)!==a.hash)throw Error('Attachment verification failed.');
   const blob=new Blob([bytes],{type:a.type});cache.current.set(blob,a.hash);files.set(a.path,blob);
  }return files;
 }
 function mappedSelection(localState:string,receivedState:string){
  const selection=latest.current.selection?.();if(!selection)return undefined;
  const a=openShared(localState),b=openShared(receivedState),name='text:'+JSON.stringify(['bullets',selection.id]);
  try{const text=a.getText(name),out=b.getText(name);const map=(pos:number)=>{const relative=Y.createRelativePositionFromTypeIndex(text,Math.max(0,Math.min(pos,text.length)));return Y.createAbsolutePositionFromRelativePosition(relative,b)?.index??Math.min(pos,out.length);};return {...selection,anchor:map(selection.anchor),head:map(selection.head)};}finally{a.destroy();b.destroy();}
 }
 async function sync(){
  if(!alive.current||!latest.current.user||!latest.current.ready)return;
  if(busy.current){queued.current=true;return;}
  if(timer.current){clearTimeout(timer.current);timer.current=null;}queued.current=false;busy.current=true;
  setError('');setStatus('Syncing…');
  try{
   if(!navigator.onLine){setStatus('Saved on device · sync pending');return;}
   await latest.current.flush();let meta=await syncMetadata();
   if(!meta){
    const response=await(await request('/sync/v2')).json();if(response.protocol!==2)throw Error('An app update is being prepared. Your edits are saved on this device.');
    await latest.current.flush();const current=latest.current.get();if(!current.doc)return;
    const files=await manifest(current.assets),checkpoint=recoverCheckpoint(await cloudCheckpoint());
    const baseline=checkpoint?.baseDoc||(hasDeviceContent(current.doc,files)?emptyShared():null);
    meta=await syncMetadata(existing=>existing||initializeOutbox(response.update,response.revision,baseline,current.doc!,files,checkpoint?.assets||[]),current.doc.revision);
   }
   await latest.current.flush();const local=latest.current.get();if(!local.doc)return;
   const files=await manifest(local.assets);
   meta=await syncMetadata(m=>{if(contentKey(m.mappedDoc)!==contentKey(local.doc!))recordLocal(m,local.doc!);return stageAssets(m,files);},local.doc.revision);
   // Persist a stable batch identity BEFORE sending. New edits append behind it.
   meta=await syncMetadata(claimOutbox);
   if(meta.inflight){
    const y=openShared(meta.localState);let assets:Asset[];try{assets=project(y).assets as Asset[];}finally{y.destroy();}
    for(const asset of assets){const blob=latest.current.get().assets.get(asset.path);if(blob&&cache.current.get(blob)===asset.hash&&!(meta.uploaded||[]).includes(asset.hash)){await request('/assets/'+asset.hash,{method:'PUT',body:blob});meta=await syncMetadata(m=>{m.uploaded=[...new Set([...(m.uploaded||[]),asset.hash])];return m;});}}
    const response=await(await request('/sync/v2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(meta.inflight)})).json();
    meta=await syncMetadata(m=>receiveOutbox(m,response));
   }else{
    const y=openShared(meta.receivedState);let v:string;try{v=vector(y);}finally{y.destroy();}
    const response=await request('/sync/v2',{headers:{'X-Sync-Vector':v,'If-None-Match':String(meta.serverRevision)}});
    // response parsing is intentionally outside IndexedDB's transaction lifetime.
    if(response.status!==304){const body=await response.json();meta=await syncMetadata(m=>receiveOutbox(m,body));}
   }
   await latest.current.flush();meta=await syncMetadata();const y=openShared(meta.receivedState);let shared:any;try{shared=project(y);}finally{y.destroy();}
   const current=latest.current.get(),localAssets=await manifest(current.assets);
   const different=!current.doc||contentKey(current.doc)!==contentKey(shared.doc)||JSON.stringify(localAssets)!==JSON.stringify(shared.assets);
   if(different||meta.localState!==meta.receivedState){
    const files=await materialize(shared.assets);
    await latest.current.flush();const fresh=await syncMetadata();
    if(!latest.current.canApply()||fresh.receivedState!==meta.receivedState){setStatus('Saved on device · sync pending');queued.current=true;return;}
    await latest.current.apply(shared.doc,files,{state:meta.receivedState,selection:mappedSelection(meta.localState,meta.receivedState)});
   }
   const final=await syncMetadata(),currentDoc=latest.current.get().doc;
   const remaining=!!final.inflight||final.pending.length>0||!currentDoc||contentKey(currentDoc)!==contentKey(shared.doc);
   setStatus(remaining?'Saved on device · sync pending':'Synced');failures.current=0;
   if(remaining)queued.current=true;
  }catch(e:any){
   setStatus('Saved on device · sync pending');
   if(!e?.deferred&&[400,401,403,413].includes(e?.status))setError(e.message);
   // Temporary network failures, races and editor transactions retry quietly.
   failures.current=Math.min(failures.current+1,6);queued.current=true;
  }finally{
   busy.current=false;if(queued.current&&alive.current){const delay=failures.current?Math.min(30000,500*2**failures.current):500;timer.current=setTimeout(()=>void run.current(),delay);}
  }
 }
 const run=useRef(sync);run.current=sync;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(timer.current)clearTimeout(timer.current);};},[]);
 useEffect(()=>{if(!options.user||!options.ready)return;const t=setTimeout(()=>void run.current(),500);return()=>clearTimeout(t);},[options.user?.uid,options.revision,options.ready]);
 useEffect(()=>{if(!options.user)return;const resume=()=>{if(document.visibilityState==='visible')void run.current();};const t=setInterval(resume,2000);window.addEventListener('online',resume);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);document.addEventListener('focusout',resume);return()=>{clearInterval(t);window.removeEventListener('online',resume);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);document.removeEventListener('focusout',resume);};},[options.user?.uid]);
 return {status,error,conflict:false,sync};
}
