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
const error=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const STATE_LIMIT=6*1024*1024;
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
function snapshot(y){
 let value=project(y);
 for(const [table,rows]of Object.entries(value.doc.tables))rows.forEach((row,i)=>{const key=rowKey(table,row,i);if(y.getMap('rows').get(key)===false)y.getMap('rows').set(key,true);});
 // Retain source notes when a concurrent attachment/deck references a node
 // deleted elsewhere. A nonexistent source is invalid input, not recoverable.
 const ids=new Set(value.doc.tables.bullets.map(n=>n.id));
 for(const id of [...(value.doc.tables.media||[]).map(x=>x.bulletId),...(value.doc.tables.decks||[]).map(x=>x.rootId)])if(!ids.has(id)){
  const key=JSON.stringify(['bullets',id]);if(!y.getMap('rows').has(key))error('Invalid attachment or deck source');y.getMap('rows').set(key,true);ids.add(id);
 }
 value=project(y);const before=structuredClone(value.doc);normalizeTree(value.doc);
 // Invalid mirror references can arise when a source is deleted concurrently.
 // Detaching keeps the note text; the journal retains the original link.
 try{validateMirrors(value.doc.tables.bullets);}catch{for(const n of value.doc.tables.bullets){delete n.mirrorSourceId;delete n.mirrorRootId;}}
 validateReadingBooks(value.doc.web.readingBooks);validateReading(value.doc.web);validateBookmarks(value.doc.web);validateDashboard(value.doc.web.dashboard);validateWorkdays(value.doc.web.workdays);validateCalendarEvents(value.doc.web.calendarEvents);validateStudyLibrary(value.doc.web);validateOcclusions(value.doc.web.occlusions);
 applyIntent(y,before,value.doc,value.assets,value.assets);
 return value;
}
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
 if(!input||typeof input.operationId!=='string'||!/^[a-f0-9-]{36}$/.test(input.operationId)||typeof input.update!=='string'||input.update.length>3*1024*1024||typeof input.vector!=='string'||input.vector.length>65536)error('Invalid sync operation');
 let update,v;try{update=unpack(input.update);v=unpack(input.vector);}catch{error('Invalid sync encoding');}
 const requestHash=await hash(input.update);
 for(let attempt=0;attempt<8;attempt++){
  const prior=await env.DB.prepare('SELECT request_hash FROM sync_journal WHERE uid=? AND operation_id=?').bind(uid,input.operationId).first();
  if(prior){if(prior.request_hash!==requestHash)error('Operation identity was reused with different content');break;}
  row=await env.DB.prepare('SELECT * FROM sync_documents WHERE uid=?').bind(uid).first();requireWorkdaysCapability(request,row.state);const y=openShared(row.state);
  let state,value,journalUpdate;const beforeVector=Y.encodeStateVector(y);
  try{Y.applyUpdate(y,update);requireWorkdaysCapability(request,sharedState(y));value=snapshot(y);state=sharedState(y);journalUpdate=pack(Y.encodeStateAsUpdate(y,beforeVector));}catch(e){y.destroy();if(e.status)throw e;error('Invalid shared document');}y.destroy();
  if(state.length>STATE_LIMIT)error('Shared workspace storage limit reached.',413);
  validatePayload({baseRevision:row.revision,...value});const body=JSON.stringify(value);
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
