import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {authenticatedUid} from './CloudAccount';
import {CLOUD_API} from './cloud-config';
import {cloudCheckpoint,digest,keepCloudRecovery,getCloudRecovery,archive,download,type Workspace} from './data';
import {cloudDocument,contentKey,syncDecision} from './cloud-model.mjs';
import {mergeCloudWorkspaces,mergeAssetManifests,equalSyncValue} from './cloud-merge.mjs';
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
 async function materializeAssets(target:Asset[],initial:{assets:Map<string,Blob>},localManifest:Asset[]){
   const localHashes=new Map(localManifest.map(a=>[a.path,a])),downloaded=new Map<string,Blob>();
   for(const a of target){
     const local=initial.assets.get(a.path);
     if(local&&equalSyncValue(localHashes.get(a.path),a)){
       downloaded.set(a.path,local);continue;
     }
     const bytes=await (await request('/assets/'+a.hash)).arrayBuffer();
     if(await digest(bytes)!==a.hash)throw Error('Attachment verification failed.');
     const blob=new Blob([bytes],{type:a.type});
     cache.current.set(blob,a.hash);downloaded.set(a.path,blob);
   }
   return downloaded;
 }
 const checkpointValue=(revision:number,doc:Workspace,assets:Asset[])=>({
   revision,key:contentKey(doc),baseDoc:cloudDocument(doc),assets
 });
 async function pull(remote:Remote){
   if(!remote.doc)return;
   const initial=latest.current.get(),key=contentKey(initial.doc!);
   const localAssets=await manifest(initial.assets);
   const downloaded=await materializeAssets(remote.assets,initial,localAssets);
   await latest.current.flush();
   if(!latest.current.canApply()||contentKey(latest.current.get().doc!)!==key)throw Error('Finish editing, then sync again to load cloud changes.');
   await latest.current.apply(remote.doc,downloaded);
   const current=latest.current.get().doc!;
   await cloudCheckpoint(checkpointValue(remote.revision,current,remote.assets));
 }
 async function uploadAssets(assets:Asset[],files:Map<string,Blob>,remote:Remote){
   const known=new Set(remote.assets.map(a=>a.hash));
   for(const asset of assets){
     if(known.has(asset.hash))continue;
     const blob=files.get(asset.path);
     if(!blob)throw Error('An attachment is missing from this device. Export a backup and review sync before continuing.');
     await request('/assets/'+asset.hash,{method:'PUT',body:blob});
     known.add(asset.hash);
   }
 }
 async function uploadWorkspace(remote:Remote,doc:Workspace,assets:Asset[]){
   return await (await request('/workspace',{method:'PUT',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({baseRevision:remote.revision,doc:cloudDocument(doc),assets})})).json();
 }
 async function push(remote:Remote){
   await latest.current.flush();
   const snapshot=latest.current.get();if(!snapshot.doc)return;
   const assets=await manifest(snapshot.assets);
   await uploadAssets(assets,snapshot.assets,remote);
   const result=await uploadWorkspace(remote,snapshot.doc,assets);
   await cloudCheckpoint(checkpointValue(result.revision,snapshot.doc,assets));
 }
 async function mergeAndPush(remote:Remote,checkpoint:any,localManifest:Asset[]){
   const initial=latest.current.get();
   if(!initial.doc||!remote.doc||!checkpoint?.baseDoc||!Array.isArray(checkpoint.assets)||
     contentKey(checkpoint.baseDoc)!==checkpoint.key)return null;
   const docResult=mergeCloudWorkspaces(checkpoint.baseDoc,initial.doc,remote.doc);
   const assetResult=mergeAssetManifests(checkpoint.assets,localManifest,remote.assets);
   if(!docResult.ok||!assetResult.ok||!docResult.doc||!assetResult.assets)return null;
   const initialKey=contentKey(initial.doc);
   const mergedDoc=docResult.doc as Workspace;
   const mergedAssets=await materializeAssets(assetResult.assets,initial,localManifest);
   await latest.current.flush();
   const latestState=latest.current.get();
   if(!latest.current.canApply()||!latestState.doc||contentKey(latestState.doc)!==initialKey||
     !equalSyncValue(await manifest(latestState.assets),localManifest))
     throw Error('Finish editing, then sync again to merge the changes safely.');
   // Capture both sides before the remote is updated or local data is replaced.
   await keepCloudRecovery({at:Date.now(),cloud:remote,local:latestState.doc,assets:[...latestState.assets]});
   await uploadAssets(assetResult.assets,mergedAssets,remote);
   const result=await uploadWorkspace(remote,mergedDoc,assetResult.assets);
   // Another edit during the upload must remain on this device, not be overwritten.
   const current=latest.current.get();
   if(!latest.current.canApply()||!current.doc||contentKey(current.doc)!==initialKey)
     throw Error('Cloud accepted the merge, but this device has newer edits. Finish editing and sync again.');
   await latest.current.apply(mergedDoc,mergedAssets);
   const synced=latest.current.get().doc!;
   await cloudCheckpoint(checkpointValue(result.revision,synced,assetResult.assets));
   return docResult.mergedNodes||0;
 }
 async function sync(resolve?:'local'|'cloud'){
   if(busy.current||!latest.current.user||!latest.current.ready||(paused.current&&!resolve))return;
   busy.current=true;setError('');setStatus('Syncing…');
   let mergedNodes:number|null=null;
   try{
     if(!navigator.onLine)throw Error('Offline. Changes are saved on this device and will sync when you reconnect.');
     await latest.current.flush();
     const initial=latest.current.get(),local=initial.doc;
     if(!local)return;
     const localManifest=await manifest(initial.assets);
     const checkpoint=await cloudCheckpoint();
     const remote:Remote=await (await request('/workspace')).json();
     let decision=syncDecision(checkpoint,contentKey(local),remote.revision);
     if(!checkpoint&&remote.revision>0&&local.tables.bullets.length)decision='conflict';
     // Attachments can change independently of note text. Treat such edits as
     // local changes too; never discard them when the cloud revision advances.
     if(checkpoint&&Array.isArray(checkpoint.assets)&&
       !equalSyncValue(localManifest,checkpoint.assets)&&checkpoint.key===contentKey(local)){
       decision=remote.revision===checkpoint.revision?'upload':'conflict';
     }
     if(resolve){
       // Refuse a stale confirmation if another device has updated the cloud.
       if(remote.revision!==conflictRef.current?.revision)decision='conflict';
       else{
         await keepCloudRecovery({at:Date.now(),cloud:remote,local,assets:[...initial.assets]});
         decision=resolve==='local'?'upload':'download';
       }
     }else if(decision==='conflict'){
       mergedNodes=await mergeAndPush(remote,checkpoint,localManifest);
       if(mergedNodes!==null)decision='idle';
     }
     if(decision==='conflict'){
       paused.current=true;conflictRef.current=remote;
       setSummary({local:local.tables.bullets.length,cloud:remote.doc?.tables.bullets.length||0});
       setConflict(true);setStatus('Conflict needs review');return;
     }
     if(decision==='download')await pull(remote);
     if(decision==='upload')await push(remote);
     // Existing installations have a revision/key checkpoint but not a merge
     // baseline. Seed one only after verifying that both sides really match.
     if(decision==='idle'&&mergedNodes===null&&!checkpoint?.baseDoc&&remote.doc&&
       contentKey(remote.doc)===contentKey(local)&&equalSyncValue(localManifest,remote.assets))
       await cloudCheckpoint(checkpointValue(remote.revision,local,remote.assets));
     paused.current=false;conflictRef.current=null;setConflict(false);
     const checkpointNow=await cloudCheckpoint();
     setStatus(checkpointNow?.key===contentKey(latest.current.get().doc!)?
       (mergedNodes!==null?'Synced · merged '+mergedNodes+' nodes':'Synced'):'Saved on device · sync pending');
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
