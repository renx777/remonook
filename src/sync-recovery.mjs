import {Y,openShared,sharedState,project,applyIntent,pack,unpack,vector} from './sync-crdt.mjs';
import {sharedSnapshot} from './sync-validate.mjs';
import {recoveryNotes} from './sync-recovery-notes.mjs';
import {validate} from './domain.mjs';

const domains={Books:['readingBooks'],Reading:['readingProgress','readingNoteRoots','readingHighlights'],Bookmarks:['bookmarks','webHighlights'],Dashboard:['dashboard'],Workdays:['workdays'],'Calendar reminders':['calendarEvents'],'Study library':['studyFolders','deckFolders','studyExcludedCards'],'Image occlusion':['occlusions']};

// Called synchronously inside the account's durable metadata transaction. Keep
// every pending operation: the new request includes their structs plus repairs.
export function recoverRejectedBatch(meta,server,operationId,reason){
 if(meta.inflight?.operationId!==operationId)return meta;
 if(meta.inflight.recovery)throw Error('Automatic sync repair was rejected. Your original edits and recovery copy remain saved on this device.');
 const accepted=openShared(server.update),y=openShared(meta.receivedState);
 try{
  const baseline=sharedSnapshot(accepted);
  Y.applyUpdate(y,unpack(server.update));
  const before=Y.encodeStateVector(y),original=project(y),entries=[],restored=new Set();
  // Validate one domain at a time, retaining all valid operations, including
  // concurrent note edits already merged from the server.
  for(let pass=0;pass<16;pass++){
   let step='project';
   try{sharedSnapshot(y,name=>{step=name;});break;}catch(e){
    if(restored.has(step))throw e;
    restored.add(step);
    const current=project(y),next=structuredClone(current.doc),keys=domains[step];
    if(keys){for(const key of keys){entries.push({label:step+' · '+key,value:current.doc.web[key]??null});if(Object.hasOwn(baseline.doc.web,key))next.web[key]=structuredClone(baseline.doc.web[key]);else delete next.web[key];}}
    else if(step==='outline tree'){
     next.tables.bullets=next.tables.bullets.map(node=>{
      try{validate([{...node,parentId:null}]);return node;}catch{
       entries.push({label:'Invalid note metadata',value:node});
       const old=baseline.doc.tables.bullets.find(n=>n.id===node.id);
       // Preserve the merged text even if its metadata is unsupported.
       return {...(old||{}),...node,kind:['NOTE','QUESTION','ANSWER'].includes(node.kind)?node.kind:'NOTE',listType:['NONE','UNORDERED','ORDERED'].includes(node.listType)?node.listType:'NONE',taskState:['NONE','TODO','DONE'].includes(node.taskState)?node.taskState:'NONE',position:Number.isInteger(node.position)?node.position:0,dueDate:old?.dueDate||'',journalDate:old?.journalDate||''};
      }
     });
    }else if(step==='attachment and deck sources'){
     const ids=new Set(next.tables.bullets.map(n=>n.id));
     for(const [table,key]of [['media','bulletId'],['decks','rootId']])next.tables[table]=next.tables[table].filter(row=>{if(ids.has(row[key]))return true;entries.push({label:'Unavailable '+table+' source',value:row});return false;});
    }else if(step==='Attachments'){
     entries.push({label:'Invalid attachment manifest',value:current.assets});
     applyIntent(y,current.doc,next,current.assets,baseline.assets);continue;
    }else throw e;
    applyIntent(y,current.doc,next,current.assets,current.assets);
   }
  }
  const current=project(y);
  // The rejection can be in legacy conversion rather than today's validators.
  if(!entries.length)entries.push({label:'Rejected batch content',value:original.doc});
  const recovered=recoveryNotes(current.doc,entries,operationId);
  applyIntent(y,current.doc,recovered,current.assets,current.assets);
  // Do not rewrite the v2 switch marker: doing so would make other current
  // devices appear not to have seen it. The repair request is validated normally
  // by the server, without reinterpreting the preserved legacy operations.
  sharedSnapshot(y);
  const correction=pack(Y.encodeStateAsUpdate(y,before));
  const pending=[...meta.pending,{id:crypto.randomUUID(),update:correction}];
  const update=pack(Y.mergeUpdates(pending.map(p=>unpack(p.update))));
  if(update.length>3*1024*1024)throw Error('The recovered batch exceeds the sync request limit. Your original edits remain saved on this device.');
  const local=openShared(meta.localState);
  try{Y.applyUpdate(local,Y.encodeStateAsUpdate(y));
   const archive={operationId,createdAt:Date.now(),reason,request:structuredClone(meta.inflight),pending:structuredClone(meta.pending),localState:meta.localState,receivedState:meta.receivedState,doc:structuredClone(meta.mappedDoc),server:structuredClone(server),noticePending:true};
   meta.recoveries=[...(meta.recoveries||[]),archive];
   meta.pending=pending;meta.localState=sharedState(local);meta.receivedState=sharedState(y);meta.serverRevision=Math.max(meta.serverRevision,server.revision);
   meta.inflight={operationId:crypto.randomUUID(),ids:pending.map(p=>p.id),update,vector:vector(y),recovery:operationId};
  }finally{local.destroy();}
  return meta;
 }finally{accepted.destroy();y.destroy();}
}
