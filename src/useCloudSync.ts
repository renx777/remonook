import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {authenticatedUid} from './CloudAccount';
import {CLOUD_API} from './cloud-config';
import {cloudCheckpoint,digest,keepCloudRecovery,type Workspace} from './data';
import {cloudDocument,contentKey,syncDecision,recoverCheckpoint,hasDeviceContent} from './cloud-model.mjs';
import {mergeCloudWorkspaces,mergeAssetManifests,equalSyncValue,describeSyncConflict} from './cloud-merge.mjs';
type Asset={path:string;hash:string;size:number;type:string};
type Remote={revision:number;doc:Workspace|null;assets:Asset[]};
type Options={user:User|null;revision?:number;ready:boolean;get:()=>{doc:Workspace|null;assets:Map<string,Blob>};flush:()=>Promise<unknown>;canApply:()=>boolean;apply:(doc:Workspace,assets:Map<string,Blob>)=>Promise<void>};
export function useCloudSync(options:Options){
 const latest=useRef(options);latest.current=options;
 const busy=useRef(false),lastRecovery=useRef(''),cache=useRef(new WeakMap<Blob,string>());
 const retryTimer=useRef<ReturnType<typeof setTimeout>|null>(null),retries=useRef(0),queued=useRef(false),mounted=useRef(true);
 const reasons=useRef<string[]>([]);
 const [conflictDetails,setConflictDetails]=useState<string[]>([]);
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
   if(!latest.current.canApply()||contentKey(latest.current.get().doc!)!==key||
     !equalSyncValue(await manifest(latest.current.get().assets),localAssets))throw Object.assign(Error('Incoming changes are waiting for the editor.'),{deferred:true});
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
   try{return await (await request('/workspace',{method:'PUT',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({baseRevision:remote.revision,doc:cloudDocument(doc),assets})})).json();}
   catch(error){if((error as any)?.status===409)(error as any).retryRevision=true;throw error;}
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
     contentKey(checkpoint.baseDoc)!==checkpoint.key){reasons.current=['This device has no verified common sync baseline. Export both versions before choosing a copy.'];return null;}
   const docResult=mergeCloudWorkspaces(checkpoint.baseDoc,initial.doc,remote.doc);
   const assetResult=mergeAssetManifests(checkpoint.assets,localManifest,remote.assets);
   if(!docResult.ok||!assetResult.ok||!docResult.doc||!assetResult.assets){reasons.current=[...docResult.conflicts,...assetResult.conflicts];return null;}
   const initialKey=contentKey(initial.doc);
   const mergedDoc=docResult.doc as Workspace;
   const mergedAssets=await materializeAssets(assetResult.assets,initial,localManifest);
   await latest.current.flush();
   const latestState=latest.current.get();
   if(!latest.current.canApply()||!latestState.doc||contentKey(latestState.doc)!==initialKey||
     !equalSyncValue(await manifest(latestState.assets),localManifest))
     throw Object.assign(Error('Incoming changes are waiting for the editor.'),{deferred:true});
   // Capture both sides before the remote is updated or local data is replaced.
   await keepCloudRecovery({at:Date.now(),cloud:remote,local:latestState.doc,assets:[...latestState.assets]});
   await uploadAssets(assetResult.assets,mergedAssets,remote);
   const result=await uploadWorkspace(remote,mergedDoc,assetResult.assets);
   // Another edit during the upload must remain on this device, not be overwritten.
   const current=latest.current.get();
   if(!latest.current.canApply()||!current.doc||contentKey(current.doc)!==initialKey||
     !equalSyncValue(await manifest(current.assets),localManifest))
     throw Object.assign(Error('Newer device edits are waiting to sync.'),{deferred:true});
   await latest.current.apply(mergedDoc,mergedAssets);
   const synced=latest.current.get().doc!;
   await cloudCheckpoint(checkpointValue(result.revision,synced,assetResult.assets));
   return docResult.mergedNodes||0;
 }
 async function sync(){
   if(!mounted.current||!latest.current.user||!latest.current.ready)return;
   if(busy.current){queued.current=true;return;}
   queued.current=false;
   if(retryTimer.current){clearTimeout(retryTimer.current);retryTimer.current=null;}
   busy.current=true;setError('');setStatus('Syncing…');
   let mergedNodes:number|null=null;
   try{
     if(!navigator.onLine){setStatus('Saved on device · sync pending');return;}
     await latest.current.flush();
     const initial=latest.current.get(),local=initial.doc;
     if(!local)return;
     const localManifest=await manifest(initial.assets);
     const checkpoint=recoverCheckpoint(await cloudCheckpoint());
     const clean=checkpoint?.baseDoc&&checkpoint.key===contentKey(local)&&equalSyncValue(checkpoint.assets,localManifest);
     const response=await request('/workspace',clean?{headers:{'If-None-Match':String(checkpoint.revision)}}:{});
     if(response.status===304){
       await cloudCheckpoint(checkpoint);
       const now=latest.current.get();
       const unchanged=now.doc&&contentKey(now.doc)===checkpoint.key&&equalSyncValue(await manifest(now.assets),localManifest);
       setConflict(false);setConflictDetails([]);retries.current=0;
       setStatus(unchanged?'Synced':'Saved on device · sync pending');if(!unchanged)queued.current=true;return;
     }
     const remote:Remote=await response.json();
     // Old clients did not store an attachment baseline. Equality on both sides
     // is sufficient for these assets only; divergent files still need review.
     if(checkpoint&&!Array.isArray(checkpoint.assets)&&equalSyncValue(localManifest,remote.assets))checkpoint.assets=localManifest;
     let decision=syncDecision(checkpoint,contentKey(local),remote.revision);
     reasons.current=[];
     const alreadyEqual=!!remote.doc&&contentKey(remote.doc)===contentKey(local)&&equalSyncValue(localManifest,remote.assets);
     if(alreadyEqual){
       await cloudCheckpoint(checkpointValue(remote.revision,local,localManifest));
       decision='idle';
     }
     if(decision!=='idle'&&!checkpoint&&remote.revision>0&&hasDeviceContent(local,localManifest))decision='conflict';
     // Attachments can change independently of note text. Treat such edits as
     // local changes too; never discard them when the cloud revision advances.
     if(!alreadyEqual&&checkpoint&&Array.isArray(checkpoint.assets)&&
       !equalSyncValue(localManifest,checkpoint.assets)&&checkpoint.key===contentKey(local)){
       decision=remote.revision===checkpoint.revision?'upload':'conflict';
     }
     if(decision==='conflict'){
       mergedNodes=await mergeAndPush(remote,checkpoint,localManifest);
       if(mergedNodes!==null)decision='idle';
     }
     if(decision==='conflict'){
       // Keep both copies automatically, even when a safe merge is not yet
       // possible. Repeated background checks must not rewrite the same backup.
       const recoveryKey=contentKey(local)+':'+remote.revision+':'+JSON.stringify(localManifest);
       if(lastRecovery.current!==recoveryKey){
         await keepCloudRecovery({at:Date.now(),cloud:remote,local,assets:[...initial.assets]});
         lastRecovery.current=recoveryKey;
       }
       setConflictDetails(reasons.current.length?reasons.current.map(p=>describeSyncConflict(p,local)):['The cloud and device copies both changed. A common baseline is needed to merge them safely.']);
       setSummary({local:local.tables.bullets.length,cloud:remote.doc?.tables.bullets.length||0});
       setConflict(true);setStatus('Saved on device · sync pending');return;
     }
     if(decision==='download')await pull(remote);
     if(decision==='upload')await push(remote);
     // Existing installations have a revision/key checkpoint but not a merge
     // baseline. Seed one only after verifying that both sides really match.
     if(decision==='idle'&&mergedNodes===null&&!checkpoint?.baseDoc&&remote.doc&&
       contentKey(remote.doc)===contentKey(local)&&equalSyncValue(localManifest,remote.assets))
       await cloudCheckpoint(checkpointValue(remote.revision,local,remote.assets));
     setConflict(false);setConflictDetails([]);retries.current=0;
     const checkpointNow=await cloudCheckpoint(),finalState=latest.current.get();
     const finalAssets=await manifest(finalState.assets);
     const trulySynced=checkpointNow?.key===contentKey(finalState.doc!)&&
       (!Array.isArray(checkpointNow?.assets)||equalSyncValue(checkpointNow.assets,finalAssets));
     setStatus(trulySynced?
       (mergedNodes!==null?'Synced · merged '+mergedNodes+' nodes':'Synced'):'Saved on device · sync pending');
     if(!trulySynced)queued.current=true;
   }catch(e){
     setStatus('Saved on device · sync pending');
     // A stale revision is a normal race, not a user conflict. Refetch and
     // re-merge from the acknowledged baseline, with a bounded backoff.
     if((e as any)?.retryRevision&&retries.current<3){
       retries.current++;retryTimer.current=setTimeout(()=>void run.current(),250*2**(retries.current-1));
     }else if(!(e as any)?.retryRevision&&!(e as any)?.deferred)setError(e instanceof Error?e.message:String(e));
   }
   finally{
     busy.current=false;
     if(queued.current&&!retryTimer.current){queued.current=false;retryTimer.current=setTimeout(()=>void run.current(),750);}
   }
 }
 const run=useRef(sync);run.current=sync;
 useEffect(()=>{if(!options.user||!options.ready)return;const timer=setTimeout(()=>void run.current(),2500);return()=>clearTimeout(timer);},[options.user?.uid,options.revision,options.ready]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(retryTimer.current)clearTimeout(retryTimer.current);};},[]);
 useEffect(()=>{if(!options.user)return;let blurTimer:ReturnType<typeof setTimeout>;const resume=()=>{if(document.visibilityState==='visible')void run.current();};const online=()=>void run.current();const afterEdit=()=>{clearTimeout(blurTimer);blurTimer=setTimeout(resume,500);};const interval=setInterval(resume,10000);window.addEventListener('online',online);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);document.addEventListener('focusout',afterEdit);return()=>{clearInterval(interval);clearTimeout(blurTimer);window.removeEventListener('online',online);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);document.removeEventListener('focusout',afterEdit);};},[options.user?.uid]);
 // Diagnostics stay internal. There is no public force-overwrite or
 // choose-device/choose-cloud action; reconciliation is application-owned.
 return {status,error,conflict,conflictDetails,summary,sync:()=>{retries.current=0;return sync();}};
}
