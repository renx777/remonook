import {workdaysLegacyIntent,upgradeWorkdaysIntent} from './workdays-upgrade.mjs';
import {validateBookmarks} from '../src/bookmarks.mjs';
import {validateDashboard} from '../src/dashboard.mjs';
import {validateReading} from '../src/reading.mjs';
import {validateReadingBooks} from '../src/book-storage.mjs';
import {Y,pack,unpack,rowKey,openShared,sharedState,seed,project,normalizeTree,applyIntent,emptyShared} from '../src/sync-crdt.mjs';
import {validateMirrors} from '../src/relations.mjs';
import {validateWorkdays} from '../src/workdays.mjs';
import {validateCalendarEvents} from '../src/calendar-events.mjs';
import {validateStudyLibrary} from '../src/study-library.mjs';
import {validateOcclusions} from '../src/occlusion.mjs';
import {sharedSnapshot} from '../src/sync-validate.mjs';
const error=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const STATE_LIMIT=6*1024*1024;
function validationFailure(step){
 const legacy=step.includes('Workdays intent');
 const reason=legacy?'Legacy Workdays upgrade failed. Pending Workdays data could not be converted.':step+': validation failed.';
 console.error(JSON.stringify({event:'sync_rejected',step,reason}));
 throw Object.assign(Error('Invalid shared document: '+reason),{status:400,code:'SYNC_VALIDATION_FAILED'});
}
async function initialize(env,uid){
 for(let attempt=0;attempt<8;attempt++){
  const found=await env.DB.prepare('SELECT * FROM sync_documents WHERE uid=?').bind(uid).first();if(found)return found;
  const legacy=await env.DB.prepare('SELECT revision,body FROM workspaces WHERE uid=?').bind(uid).first();
  const value=legacy?JSON.parse(legacy.body):{doc:emptyShared(),assets:[]},revision=legacy?.revision||0;
  const y=seed(value.doc,value.assets),state=sharedState(y);y.destroy();const digest=await hash(state),now=Date.now();
  if(legacy&&env.FILES)await env.FILES.put(uid+'/sync-recovery/'+await hash(legacy.body)+'.json',legacy.body,{httpMetadata:{contentType:'application/json'}});
  await env.DB.batch([
   env.DB.prepare('INSERT OR IGNORE INTO sync_imports(uid,body,created_at) VALUES(?,?,?)').bind(uid,JSON.stringify(value),now),
   env.DB.prepare('INSERT OR IGNORE INTO sync_documents(uid,revision,state,state_hash,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE COALESCE((SELECT revision FROM workspaces WHERE uid=?),0)=?').bind(uid,revision,state,digest,now,now,uid,revision),
   env.DB.prepare('INSERT OR IGNORE INTO sync_journal(uid,operation_id,request_hash,update_body,accepted_revision,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sync_documents WHERE uid=? AND revision=? AND state_hash=?)').bind(uid,'__seed__',digest,state,revision,now,uid,revision,digest),
   env.DB.prepare('INSERT OR IGNORE INTO workspaces(uid,revision,body,updated_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM sync_documents WHERE uid=?)').bind(uid,revision,JSON.stringify(value),now,uid)
  ]);
 }
 error('Sync is retrying. Your edits are saved on this device.',503);
}
function snapshot(y){return sharedSnapshot(y);}
function requireWorkdaysCapability(request,state){
 if((request.headers.get('X-Remo-Capabilities')||'').split(',').map(s=>s.trim()).includes('workdays-v2'))return;
 const y=openShared(state);try{if(y.getMap('fields').get(JSON.stringify(['web','workdays','version']))===2)error('Update RemoNook to continue syncing Workdays. Pending edits remain saved on this device.',426);}finally{y.destroy();}
}
export async function syncV2(request,env,uid,{readLimited,validatePayload,NOTE_LIMIT}){
 const url=new URL(request.url);
 if(request.method==='GET'&&request.headers.has('If-None-Match')){
  const head=await env.DB.prepare('SELECT revision,state FROM sync_documents WHERE uid=?').bind(uid).first();
  if(head)requireWorkdaysCapability(request,head.state);
  if(head&&String(head.revision)===request.headers.get('If-None-Match'))return new Response(null,{status:304});
 }
 let row=await initialize(env,uid);
 requireWorkdaysCapability(request,row.state);
 if(request.method==='GET'){
  if(request.headers.get('If-None-Match')===String(row.revision))return new Response(null,{status:304});
  const y=openShared(row.state);try{
   const v=request.headers.get('X-Sync-Vector')||url.searchParams.get('vector');if(v&&v.length>65536)error('Invalid sync vector');
   return Response.json({protocol:2,revision:row.revision,update:v?pack(Y.encodeStateAsUpdate(y,unpack(v))):row.state});
  }catch(e){if(e.status)throw e;error('Invalid sync vector');}finally{y.destroy();}
 }
 if(request.method!=='POST')error('Method not allowed',405);
 let input;try{input=JSON.parse(new TextDecoder().decode(await readLimited(request,3*1024*1024)));}catch(e){if(e.status)throw e;error('Invalid sync request');}
 if(input?.workdaysVector!==undefined&&(typeof input.workdaysVector!=='string'||input.workdaysVector.length>65536))error('Invalid Workdays vector');
 if(input?.recovery!==undefined&&(typeof input.recovery!=='string'||!/^[a-f0-9-]{36}$/.test(input.recovery)))error('Invalid recovery operation');
 if(!input||typeof input.operationId!=='string'||!/^[a-f0-9-]{36}$/.test(input.operationId)||typeof input.update!=='string'||input.update.length>3*1024*1024||typeof input.vector!=='string'||input.vector.length>65536)error('Invalid sync operation');
 let update,v,workdaysVector;try{update=unpack(input.update);v=unpack(input.vector);workdaysVector=input.workdaysVector===undefined?v:unpack(input.workdaysVector);Y.decodeStateVector(v);Y.decodeStateVector(workdaysVector);}catch{error('Invalid sync encoding');}
 const requestHash=await hash(input.update);
 for(let attempt=0;attempt<8;attempt++){
  const prior=await env.DB.prepare('SELECT request_hash FROM sync_journal WHERE uid=? AND operation_id=?').bind(uid,input.operationId).first();
  if(prior){if(prior.request_hash!==requestHash)error('Operation identity was reused with different content');break;}
  row=await env.DB.prepare('SELECT * FROM sync_documents WHERE uid=?').bind(uid).first();requireWorkdaysCapability(request,row.state);const y=openShared(row.state);
  let state,value,journalUpdate,step='legacy Workdays intent';const beforeVector=Y.encodeStateVector(y);
  // A recovery request contains the rejected structs AND a validated corrective
  // delta. Do not reinterpret those original legacy edits using a newer context.
  // All normal shared validation, quotas, attachment checks and journalling still
  // apply; this flag never acknowledges or replaces an existing server copy.
  try{const legacy=input.recovery?null:workdaysLegacyIntent(y,update,workdaysVector);if(legacy&&!input.workdaysContext)throw Object.assign(Error('Updating pending Workdays edits…'),{status:409,code:'WORKDAYS_CONTEXT_REQUIRED'});step='apply update';Y.applyUpdate(y,update);if(legacy){step='upgrade Workdays intent';const before=project(y).doc,next=upgradeWorkdaysIntent(before,legacy,input.workdaysContext);step='apply Workdays intent';applyIntent(y,before,next);}step='Workdays capability';requireWorkdaysCapability(request,sharedState(y));step='snapshot';value=sharedSnapshot(y,name=>{step=name;});step='shared state';state=sharedState(y);step='journal';journalUpdate=pack(Y.encodeStateAsUpdate(y,beforeVector));}catch(e){y.destroy();if(e.status&&e.status!==400)throw e;validationFailure(step);}y.destroy();
  if(state.length>STATE_LIMIT)error('Shared workspace storage limit reached.',413);
  try{validatePayload({baseRevision:row.revision,...value});}catch(e){if(e.status&&e.status!==400)throw e;validationFailure('workspace payload');}const body=JSON.stringify(value);
  if(new TextEncoder().encode(body).length>NOTE_LIMIT)error('Workspace exceeds the note storage limit.',413);
  for(const a of value.assets){const file=await env.DB.prepare('SELECT size FROM assets WHERE uid=? AND hash=?').bind(uid,a.hash).first();if(!file||file.size!==a.size)error('An attachment is still uploading.',409);}
  const next=row.revision+1,digest=await hash(state),now=Date.now();
  // D1 batch is transactional. A failed CAS cannot journal an unaccepted update;
  // a response lost after commit is safely retried using the same operation ID.
  await env.DB.batch([
   env.DB.prepare('UPDATE sync_documents SET revision=?,state=?,state_hash=?,updated_at=? WHERE uid=? AND revision=? AND NOT EXISTS(SELECT 1 FROM sync_journal WHERE uid=? AND operation_id=?)').bind(next,state,digest,now,uid,row.revision,uid,input.operationId),
   env.DB.prepare('INSERT OR IGNORE INTO sync_journal(uid,operation_id,request_hash,update_body,accepted_revision,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sync_documents WHERE uid=? AND revision=? AND state_hash=?)').bind(uid,input.operationId,requestHash,journalUpdate,next,now,uid,next,digest),
   env.DB.prepare('UPDATE workspaces SET revision=?,body=?,updated_at=? WHERE uid=? AND EXISTS(SELECT 1 FROM sync_documents WHERE uid=? AND revision=? AND state_hash=?)').bind(next,body,now,uid,uid,next,digest)
  ]);
  const accepted=await env.DB.prepare('SELECT request_hash FROM sync_journal WHERE uid=? AND operation_id=?').bind(uid,input.operationId).first();
  if(accepted){if(accepted.request_hash!==requestHash)error('Operation identity was reused');break;}
  if(attempt===7)error('Sync is retrying. Your edits remain saved on this device.',503);
 }
 row=await env.DB.prepare('SELECT * FROM sync_documents WHERE uid=?').bind(uid).first();requireWorkdaysCapability(request,row.state);const y=openShared(row.state);
 try{return Response.json({protocol:2,acked:input.operationId,revision:row.revision,update:pack(Y.encodeStateAsUpdate(y,v))});}finally{y.destroy();}
}

/** Applies a server-made change (for example from a connected AI app) exactly like a device batch:
 the same snapshot validation, payload and size checks, compare-and-swap commit and journal entry,
 so every device receives it through normal sync. `change(doc)` returns {doc, result}; it may be
 called more than once if another device commits first. An operation id that was already accepted
 returns the recorded revision instead of applying the change twice. */
export async function commitServerChange(env,uid,{operationId,requestHash,change},{validatePayload,NOTE_LIMIT}){
 await initialize(env,uid);
 for(let attempt=0;attempt<8;attempt++){
  const prior=await env.DB.prepare('SELECT request_hash,accepted_revision FROM sync_journal WHERE uid=? AND operation_id=?').bind(uid,operationId).first();
  if(prior){if(prior.request_hash!==requestHash)error('This idempotency key was already used for a different request.',409);return {revision:prior.accepted_revision,replayed:true,result:null};}
  const row=await env.DB.prepare('SELECT * FROM sync_documents WHERE uid=?').bind(uid).first(),y=openShared(row.state);
  let state,value,journalUpdate,result;
  try{
   const beforeVector=Y.encodeStateVector(y),before=project(y).doc,out=change(before);result=out.result;
   if(out.doc===before)return {revision:row.revision,unchanged:true,result};
   applyIntent(y,before,out.doc);
   let step='snapshot';try{value=sharedSnapshot(y,name=>{step=name;});}catch(e){throw Object.assign(Error(`The change was refused because the workspace would not validate (${step}). Nothing was saved.`),{status:400});}
   state=sharedState(y);journalUpdate=pack(Y.encodeStateAsUpdate(y,beforeVector));
  }finally{y.destroy();}
  if(state.length>STATE_LIMIT)error('Shared workspace storage limit reached.',413);
  validatePayload({baseRevision:row.revision,...value});const body=JSON.stringify(value);
  if(new TextEncoder().encode(body).length>NOTE_LIMIT)error('Workspace exceeds the note storage limit.',413);
  const next=row.revision+1,digest=await hash(state),now=Date.now();
  await env.DB.batch([
   env.DB.prepare('UPDATE sync_documents SET revision=?,state=?,state_hash=?,updated_at=? WHERE uid=? AND revision=? AND NOT EXISTS(SELECT 1 FROM sync_journal WHERE uid=? AND operation_id=?)').bind(next,state,digest,now,uid,row.revision,uid,operationId),
   env.DB.prepare('INSERT OR IGNORE INTO sync_journal(uid,operation_id,request_hash,update_body,accepted_revision,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sync_documents WHERE uid=? AND revision=? AND state_hash=?)').bind(uid,operationId,requestHash,journalUpdate,next,now,uid,next,digest),
   env.DB.prepare('UPDATE workspaces SET revision=?,body=?,updated_at=? WHERE uid=? AND EXISTS(SELECT 1 FROM sync_documents WHERE uid=? AND revision=? AND state_hash=?)').bind(next,body,now,uid,uid,next,digest)
  ]);
  const accepted=await env.DB.prepare('SELECT request_hash,accepted_revision FROM sync_journal WHERE uid=? AND operation_id=?').bind(uid,operationId).first();
  if(accepted){if(accepted.request_hash!==requestHash)error('Operation identity was reused');return {revision:accepted.accepted_revision,result};}
 }
 error('Your notes are busy syncing. Try again in a moment.',503);
}
/** The current workspace, read-only. */
export async function readServerDocument(env,uid){
 const row=await initialize(env,uid),y=openShared(row.state);
 try{return {doc:project(y).doc,revision:row.revision};}finally{y.destroy();}
}
