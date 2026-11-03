import {workdaysV2} from './workdays-v2.mjs';
import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {authenticatedUid} from './CloudAccount';
import {CLOUD_API} from './cloud-config';
import {syncOperation,storageAccountKey,digest,type Workspace} from './data';
import {createUiSignal} from './ui-signal';
type Asset={path:string;hash:string;size:number;type:string};
type Selection={id:string;anchor:number;head:number};
type Apply={state:string;selection?:Selection};
type Options={user:User|null;revision?:number;ready:boolean;get:()=>{doc:Workspace|null;assets:Map<string,Blob>};flush:()=>Promise<unknown>;canApply:()=>boolean;selection?:()=>Selection|null;apply:(doc:Workspace,assets:Map<string,Blob>,sync?:Apply)=>Promise<void>};
export function useCloudSync(options:Options){
 const latest=useRef(options);latest.current=options;
 const acknowledged=useRef<number|null>(null);
 const busy=useRef(false),queued=useRef(false),alive=useRef(true),timer=useRef<ReturnType<typeof setTimeout>|null>(null),failures=useRef(0),cache=useRef(new WeakMap<Blob,string>());
 const [signal]=useState(()=>createUiSignal({status:options.user?'Connecting…':'Device only',error:''}));
 const setStatus=(status:string)=>{if(signal.get().status!==status)signal.set({...signal.get(),status});};
 const setError=(error:string)=>{if(signal.get().error!==error)signal.set({...signal.get(),error});};
 async function request(path:string,init:RequestInit={}){
  const user=latest.current.user;if(!user||authenticatedUid()!==user.uid)throw Error('Sign in again to continue saving to your account.');
  const headers=new Headers(init.headers);headers.set('Authorization','Bearer '+await user.getIdToken());headers.set('X-Remo-Capabilities','workdays-v2');
  const r=await fetch(CLOUD_API+path,{...init,headers,signal:AbortSignal.timeout(30000),cache:'no-store'});
  if(!r.ok&&r.status!==304){const data=await r.json().catch(()=>({}));throw Object.assign(Error(data.error||'Your changes are saved on this device. Reconnecting…'),{status:r.status,code:data.code});}return r;
 }
 async function manifest(files:Map<string,Blob>){const out:Asset[]=[];for(const [path,blob]of files){let hash=cache.current.get(blob);if(!hash){hash=await digest(await blob.arrayBuffer());cache.current.set(blob,hash);}out.push({path,hash,size:blob.size,type:blob.type});}return out.sort((a,b)=>a.path.localeCompare(b.path));}
 async function materialize(assets:Asset[]){const local=latest.current.get(),known=await manifest(local.assets),byPath=new Map(known.map(a=>[a.path,a])),files=new Map<string,Blob>();
  for(const a of assets){if(byPath.get(a.path)?.hash===a.hash){files.set(a.path,local.assets.get(a.path)!);continue;}
   const bytes=await(await request('/assets/'+a.hash)).arrayBuffer();if(await digest(bytes)!==a.hash)throw Error('Attachment verification failed.');
   const blob=new Blob([bytes],{type:a.type});cache.current.set(blob,a.hash);files.set(a.path,blob);
  }return files;
 }
 async function sync(){
  if(!alive.current||!latest.current.user||!latest.current.ready)return;
  if(busy.current){queued.current=true;return;}
  if(timer.current){clearTimeout(timer.current);timer.current=null;}queued.current=false;busy.current=true;
  const account=storageAccountKey(),work=(operation:string,args:any={})=>syncOperation(operation,args,account);
  setError('');setStatus('Syncing…');
  try{
   if(!navigator.onLine){setStatus('Saved on device · sync pending');return;}
   await latest.current.flush();
   if(!(await work('status')).initialized){
    const response=await(await request('/sync/v2')).json();if(response.protocol!==2)throw Error('An app update is being prepared. Your edits are saved on this device.');
    await latest.current.flush();const current=latest.current.get();if(!current.doc)return;
    await work('initialize',{response,doc:current.doc,assets:await manifest(current.assets)});
   }
   await latest.current.flush();const local=latest.current.get();if(!local.doc)return;
   const stagedFiles=await manifest(local.assets);
   await work('stage',{doc:local.doc,assets:stagedFiles});
   // Persist the same stable operation identity before sending it over the network.
   const network=await work('network');
   if(network.inflight){
    for(const asset of network.assets){const blob=latest.current.get().assets.get(asset.path);if(blob&&cache.current.get(blob)===asset.hash&&!network.uploaded.includes(asset.hash)){await request('/assets/'+asset.hash,{method:'PUT',body:blob});await work('uploaded',{hash:asset.hash});}}
    let response;try{response=await(await request('/sync/v2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(network.inflight)})).json();}catch(e){if((e as any).code!=='WORKDAYS_CONTEXT_REQUIRED')throw e;const context=latest.current.get().doc;if(!context)throw e;response=await(await request('/sync/v2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...network.inflight,workdaysContext:workdaysV2(context)})})).json();}
    await work('receive',{response});
   }else{
    const response=await request('/sync/v2',{headers:{'X-Sync-Vector':network.vector,'If-None-Match':String(network.serverRevision)}});
    if(response.status!==304)await work('receive',{response:await response.json()});
   }
   await latest.current.flush();
   const current=latest.current.get(),localAssets=await manifest(current.assets);
   const inspected=await work('inspect',{doc:current.doc,assets:localAssets});
   if(inspected.needsApply){
    const files=await materialize(inspected.assets);
    await latest.current.flush();
    const assetSnapshot=latest.current.get().assets,newestFiles=await manifest(assetSnapshot);
    if(latest.current.get().assets!==assetSnapshot||!latest.current.canApply()||JSON.stringify(newestFiles)!==JSON.stringify(stagedFiles)){setStatus('Saved on device · sync pending');queued.current=true;return;}
    const applySnapshot=latest.current.get().doc;
    const selection=await work('selection',{state:inspected.state,selection:latest.current.selection?.()});
    const stillCurrent=await work('current',{state:inspected.state});
    if(!stillCurrent||latest.current.get().doc!==applySnapshot||latest.current.get().assets!==assetSnapshot||!latest.current.canApply()){setStatus('Saved on device · sync pending');queued.current=true;return;}
    await latest.current.apply(inspected.doc,files,{state:inspected.state,selection});
   }
   const currentDoc=latest.current.get().doc;
   const remaining=(await work('inspect',{doc:currentDoc,assets:await manifest(latest.current.get().assets)})).remaining;
   if(!remaining)acknowledged.current=currentDoc?.revision??null;
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
 return {signal,get status(){return signal.get().status;},get error(){return signal.get().error;},conflict:false,sync,get acknowledgedRevision(){return acknowledged.current;}};
}
