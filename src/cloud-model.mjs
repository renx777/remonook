// Revision and device identity belong to a browser, not the shared content.
export function cloudDocument(doc){
 const {revision,...rest}=doc;const {deviceId,...web}=rest.web;
 // Navigation state belongs to each device, not to the shared document.
 if(web.workdays)web.workdays={...web.workdays,view:'day'};
 return {...rest,tables:{...rest.tables,bullets:rest.tables.bullets.map(n=>({...n,collapsed:false}))},web};
}
export function restoreDeviceState(remote,local){
 const nodes=new Map(local.tables.bullets.map(n=>[n.id,n]));
 return {...remote,web:{...remote.web,deviceId:local.web.deviceId,
   ...(remote.web.workdays?{workdays:{...remote.web.workdays,view:local.web.workdays?.view||'day'}}:{})},
   tables:{...remote.tables,bullets:remote.tables.bullets.map(n=>({...n,collapsed:nodes.get(n.id)?.collapsed??false}))}};
}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])])):value;
export const contentKey=doc=>JSON.stringify(canonical(cloudDocument(doc)));
// CRDT projection sorts database rows by identity. That storage order does not
// change the outline: sibling order is stored in each bullet's position field.
// Keep snapshot undo only for an unchanged view; genuine remote edits still
// invalidate snapshots so undo cannot overwrite another device's changes.
export function historyAfterSync(history,local,remote){
 const key=doc=>{const shared=canonical(cloudDocument(doc));for(const rows of Object.values(shared.tables))if(Array.isArray(rows))rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return JSON.stringify(shared);};
 return key(local)===key(remote)?history:{undo:[],redo:[]};
}
// Historical keys contain the complete acknowledged document, not a hash.
// Recover that exact baseline; never infer it from the current local/cloud copies.
export function recoverCheckpoint(checkpoint){
 if(!checkpoint)return null;
 try{
   const recorded=JSON.parse(checkpoint.key);
   if(!recorded?.tables?.bullets||!recorded.web)return checkpoint;
   const key=contentKey(recorded);
   if(checkpoint.baseDoc&&contentKey(checkpoint.baseDoc)!==key)return checkpoint;
   return {...checkpoint,key,baseDoc:cloudDocument(checkpoint.baseDoc||recorded)};
 }catch{return checkpoint;}
}
export function hasDeviceContent(doc,assets=[]){
 if(assets.length||Object.values(doc.tables).some(rows=>Array.isArray(rows)&&rows.length))return true;
 const ignored=new Set(['deviceId','contract','studyVersion','noteTimes']);
 const nonempty=value=>Array.isArray(value)?value.length>0:value&&typeof value==='object'?Object.values(value).some(nonempty):!!value;
 return Object.entries(doc.web).some(([key,value])=>!ignored.has(key)&&nonempty(value));
}
export function syncDecision(checkpoint,localKey,remoteRevision){
 if(!checkpoint)return remoteRevision===0?'upload':'download';
 if(remoteRevision===checkpoint.revision)return localKey===checkpoint.key?'idle':'upload';
 return localKey===checkpoint.key?'download':'conflict';
}
