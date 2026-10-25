import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {authenticatedUid} from './CloudAccount';
import {CLOUD_API} from './cloud-config';
import {cloudCheckpoint,digest,keepCloudRecovery,getCloudRecovery,archive,download,type Workspace} from './data';
import {cloudDocument,contentKey,syncDecision} from './cloud-model.mjs';
type Asset={path:string;hash:string;size:number;type:string};
type Remote={revision:number;doc:Workspace|null;assets:Asset[]};
type Options={user:User|null;revision?:number;ready:boolean;get:()=>{doc:Workspace|null;assets:Map<string,Blob>};flush:()=>Promise<unknown>;canApply:()=>boolean;apply:(doc:Workspace,assets:Map<string,Blob>)=>Promise<void>};
export function useCloudSync(options:Options){
 const latest=useRef(options);latest.current=options;
 const busy=useRef(false),paused=useRef(false),conflictRef=useRef<Remote|null>(null),cache=useRef(new WeakMap<Blob,string>());
 const [summary,setSummary]=useState<{local:number;cloud:number}|null>(null);
 const [status,setStatus]=useState(options.user?'Connecting…':'Device only'),[error,setError]=useState(''),[conflict,setConflict]=useState(false);
 const request=async(path:string,init:RequestInit={})=>{
   const user=latest.current.user;if(!user||authenticatedUid()!==user.uid)throw Error('Your account changed. Reload after saving your notes.');
   const headers=new Headers(init.headers);headers.set('Authorization','Bearer '+await user.getIdToken());
   const r=await fetch(CLOUD_API+path,{...init,headers,signal:AbortSignal.timeout(30000),cache:'no-store'});
   if(!r.ok&&r.status!==304){const b=await r.json().catch(()=>({}));throw Object.assign(Error(b.error||'Cloud sync failed. Your changes remain on this device.'),{status:r.status});}return r;
 };
 async function manifest(assets:Map<string,Blob>){const result:Asset[]=[];for(const [path,blob]of assets){let hash=cache.current.get(blob);if(!hash){hash=await digest(await blob.arrayBuffer());cache.current.set(blob,hash);}result.push({path,hash,size:blob.size,type:blob.type});}return result.sort((a,b)=>a.path.localeCompare(b.path));}
 async function pull(remote:Remote){
   if(!remote.doc)return;
   const initial=latest.current.get(),key=contentKey(initial.doc!);const downloaded=new Map<string,Blob>();
   for(const a of remote.assets){const local=initial.assets.get(a.path);if(local&&cache.current.get(local)===a.hash){downloaded.set(a.path,local);continue;}const bytes=await (await request('/assets/'+a.hash)).arrayBuffer();if(await digest(bytes)!==a.hash)throw Error('Attachment verification failed.');const blob=new Blob([bytes],{type:a.type});cache.current.set(blob,a.hash);downloaded.set(a.path,blob);}
   await latest.current.flush();
   if(!latest.current.canApply()||contentKey(latest.current.get().doc!)!==key)throw Error('Finish editing, then sync again to load cloud changes.');
   await latest.current.apply(remote.doc,downloaded);
   const current=latest.current.get().doc!;await cloudCheckpoint({revision:remote.revision,key:contentKey(current)});
 }
 async function push(remote:Remote){
   await latest.current.flush();const snapshot=latest.current.get();if(!snapshot.doc)return;
   const assets=await manifest(snapshot.assets),known=new Set(remote.assets.map(a=>a.hash));
   for(const a of assets)if(!known.has(a.hash)){await request('/assets/'+a.hash,{method:'PUT',body:snapshot.assets.get(a.path)!});known.add(a.hash);}
   const result=await (await request('/workspace',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision:remote.revision,doc:cloudDocument(snapshot.doc),assets})})).json();
   await cloudCheckpoint({revision:result.revision,key:contentKey(snapshot.doc)});
 }
 async function sync(resolve?:'local'|'cloud'){
   if(busy.current||!latest.current.user||!latest.current.ready||(paused.current&&!resolve))return;
   busy.current=true;setError('');setStatus('Syncing…');
   try{
     if(!navigator.onLine)throw Error('Offline. Changes are saved on this device and will sync when you reconnect.');
     await latest.current.flush();const local=latest.current.get().doc;if(!local)return;
     const checkpoint=await cloudCheckpoint();const remote:Remote=await (await request('/workspace')).json();
     let decision=syncDecision(checkpoint,contentKey(local),remote.revision);
     if(!checkpoint&&remote.revision>0&&local.tables.bullets.length)decision='conflict';
     if(resolve){
       // Resolve only the cloud version actually reviewed; new remote writes
       // must be shown again rather than overwritten by a stale decision.
       if(remote.revision!==conflictRef.current?.revision)decision='conflict';
       else{await keepCloudRecovery({at:Date.now(),cloud:remote,local,assets:[...latest.current.get().assets]});decision=resolve==='local'?'upload':'download';}
     }
     if(decision==='conflict'){paused.current=true;conflictRef.current=remote;setSummary({local:local.tables.bullets.length,cloud:remote.doc?.tables.bullets.length||0});setConflict(true);setStatus('Conflict needs review');return;}
     if(decision==='download')await pull(remote);
     if(decision==='upload')await push(remote);
     paused.current=false;conflictRef.current=null;setConflict(false);const checkpointNow=await cloudCheckpoint();setStatus(checkpointNow?.key===contentKey(latest.current.get().doc!)?'Synced':'Saved on device · sync pending');
   }catch(e){setStatus('Saved on device · sync pending');setError(e instanceof Error?e.message:String(e));}
   finally{busy.current=false;}
 }
 const run=useRef(sync);run.current=sync;
 useEffect(()=>{if(!options.user||!options.ready)return;const timer=setTimeout(()=>void run.current(),2500);return()=>clearTimeout(timer);},[options.user?.uid,options.revision,options.ready]);
 useEffect(()=>{if(!options.user)return;const resume=()=>{if(document.visibilityState==='visible')void run.current();};const online=()=>void run.current();const interval=setInterval(()=>{if(document.visibilityState==='visible')void run.current();},60000);window.addEventListener('online',online);window.addEventListener('focus',resume);return()=>{clearInterval(interval);window.removeEventListener('online',online);window.removeEventListener('focus',resume);};},[options.user?.uid]);
 async function downloadCloudCopy(remote:Remote,name:string){
   if(!remote.doc)throw Error('The cloud workspace has no notes to export.');
   const assets=new Map<string,Blob>();
   for(const a of remote.assets){
     const bytes=await (await request('/assets/'+a.hash)).arrayBuffer();
     if(await digest(bytes)!==a.hash)throw Error('Attachment verification failed.');
     assets.set(a.path,new Blob([bytes],{type:a.type}));
   }
   const doc={...remote.doc,revision:0,web:{...remote.doc.web,deviceId:crypto.randomUUID()}};
   download(await archive(doc,assets),name);
 }
 async function downloadConflict(which:'local'|'cloud'){
   try{
     setError('');
     if(!conflictRef.current)throw Error('No sync conflict is waiting for review.');
     if(which==='cloud'){await downloadCloudCopy(conflictRef.current,'remonook-cloud-conflict.remo.zip');return;}
     await latest.current.flush();
     const snapshot=latest.current.get();
     if(!snapshot.doc)throw Error('No device workspace to export.');
     download(await archive(snapshot.doc,snapshot.assets),'remonook-device-conflict.remo.zip');
   }catch(e){setError(e instanceof Error?e.message:String(e));}
 }
 async function downloadRecovery(which:'local'|'cloud'){
   try{
     setError('');
     const recovery=await getCloudRecovery();
     if(!recovery)throw Error('No sync conflict recovery snapshot yet.');
     if(which==='local'){download(await archive(recovery.local,new Map(recovery.assets)),'remonook-recovery-device.remo.zip');return;}
     await downloadCloudCopy(recovery.cloud,'remonook-recovery-cloud.remo.zip');
   }catch(e){setError(e instanceof Error?e.message:String(e));}
 }
 return {status,error,conflict,summary,downloadConflict,downloadRecovery,sync:()=>sync(),resolve:(which:'local'|'cloud')=>sync(which)};
}
