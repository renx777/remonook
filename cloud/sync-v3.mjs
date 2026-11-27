import {attachmentReferences} from '../src/asset-references.mjs';
import {reserveAttachment,FILE_LIMIT} from './attachment-storage.mjs';
import {ReminderPush,reminderFieldsChanged} from './reminder-push.mjs';
import {repeatTemplate,validateRepeatReceipts} from '../src/task-repeat-fields.mjs';
import {advanceRecurringTasks} from '../src/recurring-tasks.mjs';
// Sync protocol v3: one Durable Object per account holds the workspace as buckets.
//
// A push opens only the buckets it touches, checks the changed records and the root data
// it touched, and commits those buckets, a journal entry and the projected records in one
// SQLite transaction. A pull returns journal entries since the device's revision, so
// unchanged buckets are never decoded. Records (projected rows as JSON) serve the AI apps
// connection and other server readers without opening any Yjs document.
import {Y,pack,unpack,projectParts,assembleParts,applyParts,emptyShared} from '../src/sync-crdt.mjs';
import {bulletBucket,leafBucket,applyDocument,isBucket,readRepair,patchBuckets,diffPatch,emptyPatch,ASSET_BUCKET,PROTOCOL_V3} from '../src/sync-buckets.mjs';
import {checkRow,checkRoot,checkAssets} from '../src/sync-checks.mjs';

const CHUNK=1_000_000,REQUEST_LIMIT=4*1024*1024,PULL_LIMIT=4*1024*1024,BUCKET_LIMIT=8*1024*1024,ACCOUNT_LIMIT=1024*1024*1024,JOURNAL_KEEP=5000,CACHE_LIMIT=24*1024*1024;
const error=(message,status=400,code)=>{throw Object.assign(Error(message),{status,code});};
const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const json=(body,status=200)=>Response.json(body,{status});

const rowMap=parts=>new Map(parts.rows.map(r=>[r.key,r]));
const leafMap=parts=>new Map(parts.rootFields.map(f=>[JSON.stringify(f.path),f.value]));

export class SyncSpace{
 constructor(ctx,env){
  this.ctx=ctx;this.env=env;this.sql=ctx.storage.sql;this.cache=new Map();this.cacheBytes=0;this.queue=Promise.resolve();
  this.sql.exec(`CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
  this.sql.exec(`CREATE TABLE IF NOT EXISTS blobs(k TEXT NOT NULL, n INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(k,n))`);
  this.sql.exec(`CREATE TABLE IF NOT EXISTS buckets(id TEXT PRIMARY KEY, rev INTEGER NOT NULL, size INTEGER NOT NULL)`);
  this.sql.exec(`CREATE TABLE IF NOT EXISTS journal(rev INTEGER PRIMARY KEY, op TEXT NOT NULL UNIQUE, hash TEXT NOT NULL, created INTEGER NOT NULL)`);
  this.sql.exec(`CREATE TABLE IF NOT EXISTS records(k TEXT PRIMARY KEY, tbl TEXT NOT NULL, bucket TEXT NOT NULL, body TEXT NOT NULL)`);
  // Children lookups for the AI apps connection read only the part of the outline they need.
  this.sql.exec(`CREATE INDEX IF NOT EXISTS records_parent ON records(tbl, json_extract(body,'$.parentId'))`);
  this.sql.exec("CREATE INDEX IF NOT EXISTS records_timed ON records(k) WHERE tbl='bullets' AND json_extract(body,'$.taskState')='TODO' AND json_extract(body,'$.taskStartTime')!=''");
  this.sql.exec('CREATE TABLE IF NOT EXISTS asset_paths(hash TEXT NOT NULL,path TEXT NOT NULL,PRIMARY KEY(hash,path))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS asset_uploads(token TEXT PRIMARY KEY,hash TEXT NOT NULL,expires INTEGER NOT NULL,completed INTEGER NOT NULL DEFAULT 0)');
  this.reminders=new ReminderPush(this);
 }
 // ---- storage helpers
 meta(k){return this.sql.exec('SELECT v FROM meta WHERE k=?',k).toArray()[0]?.v;}
 setMeta(k,v){this.sql.exec('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v',k,String(v));}
 revision(){return Number(this.meta('revision')||0);}
 readBlob(k){const parts=this.sql.exec('SELECT data FROM blobs WHERE k=? ORDER BY n',k).toArray();if(!parts.length)return null;const chunks=parts.map(p=>new Uint8Array(p.data)),out=new Uint8Array(chunks.reduce((s,c)=>s+c.length,0));let o=0;for(const c of chunks){out.set(c,o);o+=c.length;}return out;}
 writeBlob(k,bytes){this.sql.exec('DELETE FROM blobs WHERE k=?',k);for(let n=0,i=0;i<bytes.length||n===0;n++,i+=CHUNK)this.sql.exec('INSERT INTO blobs(k,n,data) VALUES(?,?,?)',k,n,bytes.subarray(i,i+CHUNK));}
 bucketIds(){return this.sql.exec('SELECT id FROM buckets ORDER BY id').toArray().map(r=>r.id);}
 /** A bucket as a Y.Doc with its projected parts, from the in-memory cache when possible. */
 load(id){
  let hit=this.cache.get(id);
  if(hit){this.cache.delete(id);this.cache.set(id,hit);return hit;}
  const bytes=this.readBlob('b:'+id),doc=new Y.Doc();if(bytes)Y.applyUpdate(doc,bytes);
  hit={doc,parts:projectParts(doc),size:bytes?.length||0};this.cache.set(id,hit);this.cacheBytes+=hit.size;
  for(const [key,old] of this.cache){if(this.cacheBytes<=CACHE_LIMIT||key===id)break;old.doc.destroy();this.cache.delete(key);this.cacheBytes-=old.size;}
  return hit;
 }
 evict(ids){for(const id of ids){const hit=this.cache.get(id);if(hit){hit.doc.destroy();this.cache.delete(id);this.cacheBytes-=hit.size;}}}
 rootIds(){return this.bucketIds().filter(id=>id.startsWith('r'));}
 serial(fn){const run=this.queue.then(fn,fn);this.queue=run.catch(()=>{});return run;}

 // ---- first use: an empty space, or a copy of the account's v2 workspace
 async ensure(uid){
  if(this.meta('uid'))return;
  this.setMeta('uid',uid);
  let seed=null;
  if(this.env.DB){
   const row=await this.env.DB.prepare('SELECT body FROM workspaces WHERE uid=?').bind(uid).first();
   if(row){let text=row.body;if(text.startsWith('r2:')){const o=await this.env.FILES?.get(text.slice(3));text=o?await o.text():null;}if(text)seed=JSON.parse(text);}
  }
  // A new account starts from the empty workspace, as v2 did, so its tables exist in the CRDT.
  if(!seed?.doc)seed={doc:emptyShared(),assets:[]};
  if(seed?.doc){
   const {states}=applyDocument(new Map(),null,seed.doc,{assetsAfter:seed.assets||[]});
   this.ctx.storage.transactionSync(()=>{
    for(const [id,state] of states){const bytes=unpack(state);this.writeBlob('b:'+id,bytes);this.sql.exec('INSERT INTO buckets(id,rev,size) VALUES(?,?,?)',id,1,bytes.length);}
    for(const id of states.keys())this.indexRecords(id,{rows:[],rootFields:[]},this.load(id).parts);
    this.rememberAssetPaths(seed.assets||[]);
    this.setMeta('revision',1);
   });
  }
  // Older app versions must not write v2 changes for this account any more.
  if(this.env.DB)await this.env.DB.prepare("INSERT INTO sync_documents(uid,revision,state,state_hash,created_at,updated_at) VALUES(?,0,'','v3',?,?) ON CONFLICT(uid) DO UPDATE SET state_hash='v3'").bind(uid,Date.now(),Date.now()).run();
 }
 indexRecords(bucket,before,after){
  const b=rowMap(before),a=rowMap(after);
  for(const [key] of b)if(!a.has(key))this.sql.exec('DELETE FROM records WHERE k=?',key);
  for(const [key,r] of a)if(JSON.stringify(b.get(key)?.row)!==JSON.stringify(r.row))this.sql.exec('INSERT INTO records(k,tbl,bucket,body) VALUES(?,?,?,?) ON CONFLICT(k) DO UPDATE SET body=excluded.body',key,r.table,bucket,JSON.stringify(r.row));
  if(!bucket.startsWith('b'))return;
  // Per-bullet root entries (noteTimes) live in row buckets; keep them readable too.
  const bl=leafMap(before),al=leafMap(after);
  for(const [k] of bl)if(!al.has(k))this.sql.exec('DELETE FROM records WHERE k=?','leaf:'+k);
  for(const [k,v] of al)if(JSON.stringify(bl.get(k))!==JSON.stringify(v))this.sql.exec('INSERT INTO records(k,tbl,bucket,body) VALUES(?,?,?,?) ON CONFLICT(k) DO UPDATE SET body=excluded.body','leaf:'+k,'$leaf',bucket,JSON.stringify(v));
 }

 rememberAssetPaths(assets){for(const a of assets)this.sql.exec('INSERT OR IGNORE INTO asset_paths(hash,path) VALUES(?,?)',a.hash,a.path);}
 async reserveFile({hash,size}){
  if(!/^[a-f0-9]{64}$/.test(hash)||!Number.isSafeInteger(size)||size<0||size>FILE_LIMIT)error('Invalid attachment',400);
  await reserveAttachment(this.env,this.meta('uid'),hash,size);const token=crypto.randomUUID();
  this.sql.exec('INSERT INTO asset_uploads(token,hash,expires) VALUES(?,?,?)',token,hash,Date.now()+15*60000);return {token};
 }
 async reconcileAssets(input){
  if(!input||typeof input.operationId!=='string'||!/^[a-f0-9-]{36}$/.test(input.operationId)||!Array.isArray(input.hashes)||input.hashes.length>2000||input.hashes.some(h=>typeof h!=='string'||!/^[a-f0-9]{64}$/.test(h)))error('Invalid attachment reconciliation');
  const domains=new Set(['studyFolders','quizReactions','deckDesigns']),roots=new Set([...domains].map(key=>leafBucket(JSON.stringify(['web',key]))));
  const rootFields=[...roots].flatMap(bucket=>this.load(bucket).parts.rootFields.filter(f=>f.path[0]==='web'&&domains.has(f.path[1])));
  const rows=this.sql.exec("SELECT k,tbl,body FROM records WHERE tbl IN ('media','emojis','trash')").toArray().map(r=>({key:r.k,table:r.tbl,row:JSON.parse(r.body)}));
  const doc=assembleParts([{rootFields,rows,tables:['media','emojis','trash'],assets:[]}]).doc;
  const refs=attachmentReferences(doc),protectedHashes=new Set(this.load(ASSET_BUCKET).parts.assets.map(a=>a.hash));
  // Fail closed on malformed Trash; retain historical path associations for offline edits.
  for(const row of this.sql.exec('SELECT hash,path FROM asset_paths').toArray())if(refs.has(row.path))protectedHashes.add(row.hash);
  const explicit=new Set(input.hashes);for(const lease of this.sql.exec('SELECT hash,completed FROM asset_uploads WHERE expires>?',Date.now()).toArray())if(!lease.completed||!explicit.has(lease.hash))protectedHashes.add(lease.hash);
  const candidates=new Set(input.hashes),expired=this.sql.exec('SELECT token,hash FROM asset_uploads WHERE expires<=? LIMIT ?',Date.now(),2000-candidates.size).toArray();
  for(const lease of expired)if(candidates.size<2000)candidates.add(lease.hash);
  // Legacy rows have no creation timestamp. Reclaim their allocation only; retaining
  // bytes plus serialized current references/leases makes old offline restoration safe.
  const excluded=JSON.stringify([...new Set([...protectedHashes,...candidates])]);
  if(candidates.size<2000&&excluded.length<=1024*1024){const orphaned=await this.env.DB.prepare('SELECT hash FROM assets WHERE uid=? AND hash NOT IN (SELECT value FROM json_each(?)) LIMIT ?').bind(this.meta('uid'),excluded,2000-candidates.size).all();for(const row of orphaned.results)candidates.add(row.hash);}
  const retired=[...candidates].filter(hash=>!protectedHashes.has(hash));let freed=0;
  // <= 46 bounded D1 queries at the 2,000-hash request limit; never one round trip per file.
  for(let i=0;i<retired.length;i+=90){const batch=retired.slice(i,i+90),slots=batch.map(()=>'?').join(',');
   const rows=await this.env.DB.prepare('SELECT hash,size FROM assets WHERE uid=? AND hash IN ('+slots+')').bind(this.meta('uid'),...batch).all();
   if(rows.results.length){await this.env.DB.prepare('DELETE FROM assets WHERE uid=? AND hash IN ('+slots+')').bind(this.meta('uid'),...batch).run();freed+=rows.results.reduce((n,r)=>n+r.size,0);}
  }
  // Only accounting is retired. Every immutable R2 original remains recoverable.
  for(const lease of expired)this.sql.exec('DELETE FROM asset_uploads WHERE token=?',lease.token);
  return {operationId:input.operationId,retired,freed,...this.pull(Number(input.since)||0)};
 }

 // ---- commit: mutate touched buckets, check what changed, persist atomically
 async commit({operationId,requestHash},mutate){
  const prior=this.sql.exec('SELECT rev,hash FROM journal WHERE op=?',operationId).toArray()[0];
  if(prior){if(prior.hash!==requestHash)error('Operation identity was reused with different content',409);return {revision:prior.rev,replayed:true};}
  const touched=new Map();
  const open=id=>{if(!touched.has(id)){const hit=this.load(id);touched.set(id,{hit,vector:Y.encodeStateVector(hit.doc),before:hit.parts});}return touched.get(id).hit.doc;};
  try{
   mutate(open);
   // Old forms omit unknown daily metadata. New forms explicitly write false.
   for(const [,t] of touched){const after=projectParts(t.hit.doc),fields=t.hit.doc.getMap('fields');
    for(const f of t.before.rootFields)if(f.path[0]==='web'&&f.path[1]==='calendarEvents'&&f.path[3]==='daily'&&f.value===true){
     const rest=after.rootFields.filter(a=>a.path[0]==='web'&&a.path[1]==='calendarEvents'&&a.path[2]===f.path[2]);
     if(rest.some(a=>a.path[3]==='id')&&rest.some(a=>a.path[3]==='repeat'&&a.value==='none')&&!rest.some(a=>a.path[3]==='daily'))fields.set(JSON.stringify(f.path),true);
    }
   }
   // Reconcile legacy-client completions before validation/journalling. Only a
   // changed completed repeating row opens this indexed projection path.
   const recurring=[];let generated=false;const overrides=new Map();
   for(const [id,t] of touched){const after=projectParts(t.hit.doc);overrides.set(id,after);const before=rowMap(t.before);for(const r of after.rows)if(r.table==='bullets'&&!r.row.mirrorSourceId&&r.row.taskState==='DONE'&&r.row.taskRepeat&&r.row.taskRepeat!=='NONE'&&JSON.stringify(before.get(r.key)?.row)!==JSON.stringify(r.row))recurring.push(r.row);}
   let needsRepeat=false;
   if(recurring.length){
    needsRepeat=recurring.some(n=>{const t=repeatTemplate(n.taskRepeatTemplate);if(!t)return false;const parts=overrides.get(bulletBucket(n.id))||this.load(bulletBucket(n.id)).parts;
     return !parts.rootFields.some(f=>f.path[0]==='web'&&f.path[1]==='taskRepeatReceipts'&&f.path[2]===n.id&&f.path[3]===t.id);
    });
   }
   if(needsRepeat){const current=this.read(overrides).doc;let next;try{next=advanceRecurringTasks(current);}catch(e){error('Recurring tasks: '+e.message,400,'SYNC_VALIDATION_FAILED');}if(next!==current){generated=true;for(const [id,[b,a]] of patchBuckets(diffPatch(current,next)))applyParts(open(id),b,a,[],[],true);}}
   const updates={},changed=[];
   let rootTouched=false,assetsTouched=false;
   for(const [id,t] of touched){
    const update=Y.encodeStateAsUpdate(t.hit.doc,t.vector);if(update.length<=2)continue;
    updates[id]=pack(update);
    t.after=!generated&&overrides.has(id)?overrides.get(id):projectParts(t.hit.doc);
    const receiptFields=t.after.rootFields.filter(f=>f.path[0]==='web'&&f.path[1]==='taskRepeatReceipts');
    if(receiptFields.length)try{validateRepeatReceipts(assembleParts([{rootFields:receiptFields,rows:[],tables:[],assets:[]}]).doc.web.taskRepeatReceipts);}catch(e){error(e.message,400,'SYNC_VALIDATION_FAILED');}
    const b=rowMap(t.before);
    for(const [key,r] of rowMap(t.after))if(JSON.stringify(b.get(key)?.row)!==JSON.stringify(r.row))try{checkRow(r.table,r.row);}catch(e){error(`Invalid shared document: ${r.table} record: ${e.message}`,400,'SYNC_VALIDATION_FAILED');}
    if(id.startsWith('r'))rootTouched=true;if(id===ASSET_BUCKET)assetsTouched=true;
    changed.push(id);
   }
   if(!changed.length)return {revision:this.revision(),unchanged:true};
   if(rootTouched){
    const parts=this.rootIds().filter(id=>!touched.has(id)).map(id=>this.load(id).parts);
    for(const id of changed)if(id.startsWith('r'))parts.push(touched.get(id).after);
    const {doc}=assembleParts(parts);
    try{checkRoot(doc.web||{});}catch(e){error(`Invalid shared document: ${e.message}`,400,'SYNC_VALIDATION_FAILED');}
   }
   if(assetsTouched){
    const assets=touched.get(ASSET_BUCKET).after.assets;try{checkAssets(assets);}catch(e){error(e.status===413?e.message:`Invalid shared document: ${e.message}`,e.status||400,e.status===413?'ATTACHMENT_MANIFEST_FULL':'SYNC_VALIDATION_FAILED');}
    const before=new Set(touched.get(ASSET_BUCKET).before.assets.map(a=>a.hash+':'+a.size));
    for(const a of assets)if(!before.has(a.hash+':'+a.size)){const file=this.env.DB&&await this.env.DB.prepare('SELECT size FROM assets WHERE uid=? AND hash=?').bind(this.meta('uid'),a.hash).first();if(this.env.DB&&(!file||file.size!==a.size)){const retained=await this.env.FILES?.head?.(this.meta('uid')+'/'+a.hash);if(retained?.size===a.size)await reserveAttachment(this.env,this.meta('uid'),a.hash,a.size);else error('An attachment is still uploading.',409);}}
   }
   const states=new Map(changed.map(id=>[id,Y.encodeStateAsUpdate(touched.get(id).hit.doc)]));
   for(const [id,bytes] of states)if(bytes.length>BUCKET_LIMIT)error(`Your workspace is full: one storage part would be ${(bytes.length/1048576).toFixed(1)} MB. Nothing was saved.`,413);
   const total=this.sql.exec('SELECT COALESCE(SUM(size),0) AS s FROM buckets').toArray()[0].s;
   if(total>ACCOUNT_LIMIT)error('Your workspace is full. Nothing was saved.',413);
   const next=this.revision()+1;
   this.ctx.storage.transactionSync(()=>{
    for(const [id,bytes] of states){this.writeBlob('b:'+id,bytes);this.sql.exec('INSERT INTO buckets(id,rev,size) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET rev=excluded.rev,size=excluded.size',id,next,bytes.length);this.indexRecords(id,touched.get(id).before,touched.get(id).after);if(id===ASSET_BUCKET){this.rememberAssetPaths([...touched.get(id).before.assets,...touched.get(id).after.assets]);this.sql.exec('DELETE FROM asset_uploads WHERE hash IN (SELECT value FROM json_each(?))',JSON.stringify(touched.get(id).after.assets.map(a=>a.hash)));}}
    this.sql.exec('INSERT INTO journal(rev,op,hash,created) VALUES(?,?,?,?)',next,operationId,requestHash,Date.now());
    this.writeBlob('j:'+next,new TextEncoder().encode(JSON.stringify(updates)));
    this.setMeta('revision',next);
    const old=this.sql.exec('SELECT rev FROM journal ORDER BY rev DESC LIMIT 1 OFFSET ?',JOURNAL_KEEP).toArray()[0];
    if(old){for(const r of this.sql.exec('SELECT rev FROM journal WHERE rev<=?',old.rev).toArray())this.sql.exec('DELETE FROM blobs WHERE k=?','j:'+r.rev);this.sql.exec('DELETE FROM journal WHERE rev<=?',old.rev);}
   });
   for(const id of changed){const t=touched.get(id);t.hit.parts=t.after;const size=states.get(id).length;this.cacheBytes+=size-t.hit.size;t.hit.size=size;}
   this.notify(next);
   if([...touched.values()].some(t=>t.after&&reminderFieldsChanged(t.before,t.after)))try{await this.reminders.nudge();}catch{console.error(JSON.stringify({event:'reminder_alarm_retry'}));}
   return {revision:next};
  }catch(e){this.evict(touched.keys());throw e;}
 }

 // ---- pull: journal entries since a revision, or whole buckets when the journal is too short
 pull(since,after='',target=0){
  const revision=this.revision();
  if(!Number.isSafeInteger(since)||since<0||since>revision)since=0;
  if(since===revision&&!after)return {protocol:PROTOCOL_V3,revision,updates:{}};
  const first=this.sql.exec('SELECT MIN(rev) AS m FROM journal').toArray()[0]?.m;
  if(!after&&first!==null&&first!==undefined&&first<=since+1){
   const lists={};let bytes=0,upTo=since;
   for(const {rev} of this.sql.exec('SELECT rev FROM journal WHERE rev>? ORDER BY rev',since).toArray()){
    const text=new TextDecoder().decode(this.readBlob('j:'+rev));if(bytes&&bytes+text.length>PULL_LIMIT)break;
    for(const [id,u] of Object.entries(JSON.parse(text)))(lists[id]||=[]).push(unpack(u));bytes+=text.length;upTo=rev;
   }
   const updates=Object.fromEntries(Object.entries(lists).map(([id,list])=>[id,pack(list.length===1?list[0]:Y.mergeUpdates(list))]));
   return {protocol:PROTOCOL_V3,revision:upTo,updates,more:upTo<revision};
  }
  // Whole buckets in id order, a page at a time. Merging a whole bucket is idempotent, so a
  // device may receive content it already has; the journal covers commits made meanwhile.
  // The device reports `revision` only after the last page (it echoes `target`).
  if(!after)target=revision;
  const ids=this.sql.exec('SELECT id FROM buckets WHERE rev>? AND id>? ORDER BY id',since,after).toArray().map(r=>r.id),updates={};let bytes=0,last='',more=false;
  for(const id of ids){const state=this.readBlob('b:'+id);if(bytes&&bytes+state.length>PULL_LIMIT){more=true;break;}updates[id]=pack(state);bytes+=state.length;last=id;}
  return more?{protocol:PROTOCOL_V3,revision:since,updates,more,after:last,target}:{protocol:PROTOCOL_V3,revision:Math.max(since,Number(target)||revision),updates,more:Number(target)<revision};
 }

 /** The whole document from projected records; no Yjs documents are opened for rows. */
 read(overrides=new Map()){
  const rows=this.sql.exec("SELECT k,tbl,body,bucket FROM records WHERE tbl!='$leaf'").toArray().filter(r=>!overrides.has(r.bucket)).map(r=>({key:r.k,table:r.tbl,row:JSON.parse(r.body)}));
  const leaves=this.sql.exec("SELECT k,body,bucket FROM records WHERE tbl='$leaf'").toArray().filter(r=>!overrides.has(r.bucket)).map(r=>({path:JSON.parse(r.k.slice(5)),value:JSON.parse(r.body)}));
  const roots=this.rootIds().filter(id=>!overrides.has(id)).map(id=>this.load(id).parts),assets=overrides.has(ASSET_BUCKET)?[]:this.bucketIds().includes(ASSET_BUCKET)?this.load(ASSET_BUCKET).parts.assets:[];
  const value=assembleParts([...roots,...overrides.values(),{rootFields:leaves,rows,tables:[],assets}]);
  readRepair(value.doc);
  return {...value,revision:this.revision()};
 }

 /** Part of the outline, read from projected records (no Yjs): text-search candidates, the
  children and grandchildren of a parent, or a subtree, always with the ancestors of every
  bullet returned (for paths). Media rows are included for attachment-aware matching. */
 subset({word,parent,root,limit=20000}={}){
  const bullets=new Map(),add=rows=>{for(const r of rows){const n=JSON.parse(r.body);bullets.set(n.id,n);}};
  const byIds=ids=>{const out=[];for(const id of ids)out.push(...this.sql.exec("SELECT body FROM records WHERE k=?",JSON.stringify(['bullets',String(id)])).toArray());return out;};
  const childrenOf=ids=>{const out=[];for(const id of ids)out.push(...(id===null?this.sql.exec("SELECT body FROM records WHERE tbl='bullets' AND json_extract(body,'$.parentId') IS NULL").toArray():this.sql.exec("SELECT body FROM records WHERE tbl='bullets' AND json_extract(body,'$.parentId')=?",id).toArray()));return out;};
  const ids=rows=>rows.map(r=>JSON.parse(r.body).id);
  if(typeof word==='string')add(this.sql.exec("SELECT body FROM records WHERE tbl='bullets' AND body LIKE ? ESCAPE '\\' ORDER BY k LIMIT 2000",'%'+word.replace(/[\\%_]/g,c=>'\\'+c)+'%').toArray());
  let childCounts;
  if(parent!==undefined){if(parent)add(byIds([parent]));const kids=childrenOf([parent]);add(kids);
   // Only the number of grandchildren is needed, so count them instead of reading them.
   childCounts={};for(const id of ids(kids))childCounts[id]=this.sql.exec("SELECT COUNT(*) AS c FROM records WHERE tbl='bullets' AND json_extract(body,'$.parentId')=?",id).toArray()[0].c;}
  if(root){add(byIds([root]));let level=[root];while(level.length&&bullets.size<limit){const rows=childrenOf(level).filter(r=>!bullets.has(JSON.parse(r.body).id));add(rows);level=ids(rows);}}
  // Ancestors, guarding against cycles (read-time repair is not applied to a subset).
  const seen=new Set();let missing=[...bullets.values()].map(n=>n.parentId).filter(p=>p&&!bullets.has(p));
  while(missing.length){const next=[];for(const row of byIds([...new Set(missing)].filter(id=>!seen.has(id)))){const n=JSON.parse(row.body);seen.add(n.id);bullets.set(n.id,n);if(n.parentId&&!bullets.has(n.parentId))next.push(n.parentId);}for(const id of missing)seen.add(id);missing=next;}
  const media=this.sql.exec("SELECT body FROM records WHERE tbl='media'").toArray().map(r=>JSON.parse(r.body));
  return {doc:{tables:{bullets:[...bullets.values()].sort((a,b)=>a.id.localeCompare(b.id)),media},web:{}},revision:this.revision(),...(childCounts?{childCounts}:{})};
 }

 // ---- live updates: devices keep a WebSocket open and pull when told a new revision exists
 notify(revision){for(const ws of this.ctx.getWebSockets?.()||[])try{ws.send(JSON.stringify({revision}));}catch{}}
 webSocketMessage(ws,message){if(message==='ping')ws.send(JSON.stringify({revision:this.revision()}));}
 webSocketClose(ws,code){try{ws.close(code);}catch{}}

 async alarm(){return this.reminders.alarm();}
 async fetch(request){
  const url=new URL(request.url),uid=request.headers.get('X-Remo-Uid');
  if(!uid)return json({error:'Missing account'},400);
  try{
   await this.serial(()=>this.ensure(uid));
   if(this.meta('reminder_dirty')==='1')try{await this.serial(()=>this.reminders.nudge());}catch{console.error(JSON.stringify({event:'reminder_alarm_retry'}));}
   if(url.pathname==='/ws'){
    if(request.headers.get('Upgrade')!=='websocket')return json({error:'Expected WebSocket'},426);
    const pair=new WebSocketPair();this.ctx.acceptWebSocket(pair[1]);pair[1].send(JSON.stringify({revision:this.revision()}));
    return new Response(null,{status:101,webSocket:pair[0]});
   }
   if(url.pathname==='/pull')return json(this.pull(Number(url.searchParams.get('since')||0),url.searchParams.get('after')||'',Number(url.searchParams.get('target')||0)));
   if(url.pathname==='/read')return json(this.read());
   if(url.pathname==='/subset')return json(this.subset(await request.json()));
   const body=await request.json();
   if(url.pathname==='/asset-reserve')return json(await this.serial(()=>this.reserveFile(body)));
   if(url.pathname==='/asset-finish'){await this.serial(async()=>{const lease=this.sql.exec('SELECT hash FROM asset_uploads WHERE token=?',body.token).toArray()[0];if(body.failed){this.sql.exec('DELETE FROM asset_uploads WHERE token=?',body.token);if(lease)await this.reconcileAssets({operationId:crypto.randomUUID(),hashes:[lease.hash]});}else this.sql.exec('UPDATE asset_uploads SET completed=1 WHERE token=?',body.token);});return json({ok:true});}
   if(url.pathname==='/asset-reconcile')return json(await this.serial(()=>this.reconcileAssets(body)));
   if(url.pathname==='/reminders')return json(await this.serial(()=>this.reminders.request(body)));
   if(url.pathname==='/push')return json(await this.serial(()=>this.push(body)));
   if(url.pathname==='/patch')return json(await this.serial(()=>this.patch(body)));
   return json({error:'Not found'},404);
  }catch(e){return json({error:e.status?e.message:'Sync is retrying. Your edits are saved on this device.',code:e.code},e.status||500);}
 }
 async push(input){
  if(!input||typeof input.operationId!=='string'||!/^[a-f0-9-]{36}$/.test(input.operationId)||!input.updates||typeof input.updates!=='object')error('Invalid sync operation');
  const entries=Object.entries(input.updates);if(!entries.length||entries.length>400)error('Invalid sync operation');
  const decoded=entries.map(([id,u])=>{if(!isBucket(id))error('Invalid sync bucket');try{return [id,unpack(u)];}catch{error('Invalid sync encoding');}});
  const requestHash=await sha(entries.sort(([a],[b])=>a.localeCompare(b)).map(([id,u])=>id+':'+u).join('|'));
  const result=await this.commit({operationId:input.operationId,requestHash},open=>{for(const [id,u] of decoded)Y.applyUpdate(open(id),u);});
  return {...this.pull(Number(input.since)||0),acked:input.operationId,committed:result.revision};
 }
 /** A server-side change (AI apps): before/after values of the changed keys, rebased onto
  whatever is current, so concurrent device edits are kept. */
 async patch({operationId,requestHash,patch,assetsBefore,assetsAfter}){
  if(!patch||emptyPatch(patch))return {revision:this.revision(),unchanged:true};
  return this.commit({operationId,requestHash},open=>{for(const [id,[b,a]] of patchBuckets(patch))applyParts(open(id),b,a,id===ASSET_BUCKET?assetsBefore||[]:[],id===ASSET_BUCKET?assetsAfter||[]:[],true);});
 }
}

// ---- Worker side
const stub=(env,uid)=>env.SYNC_SPACE.get(env.SYNC_SPACE.idFromName(uid));
async function call(env,uid,path,body){
 const r=await stub(env,uid).fetch('https://sync-space'+path,{method:body?'POST':'GET',headers:{'X-Remo-Uid':uid,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'Sync failed'),{status:r.status,code:data.code});return data;
}
export const v3Enabled=env=>!!env.SYNC_SPACE;
/** Whether an account already uses v3 (its v2 row carries the marker). */
export async function isV3Account(env,uid){if(!env.SYNC_SPACE||!env.DB)return false;const row=await env.DB.prepare('SELECT state_hash FROM sync_documents WHERE uid=?').bind(uid).first();return row?.state_hash==='v3';}
export async function syncV3(request,env,uid,{readLimited}){
 if(!env.SYNC_SPACE)error('Sync v3 is not available on this server.',404);
 const url=new URL(request.url);
 if(url.pathname==='/assets/reconcile'&&request.method!=='POST')error('Method not allowed',405);
 if(url.pathname==='/sync/v3/ws'){
  if(request.headers.get('Upgrade')!=='websocket')error('Expected WebSocket',426);
  const headers=new Headers(request.headers);headers.set('X-Remo-Uid',uid);
  return stub(env,uid).fetch(new Request('https://sync-space/ws',{headers}));
 }
 if(request.method==='GET'){const q=k=>encodeURIComponent(url.searchParams.get(k)||'');return json(await call(env,uid,`/pull?since=${q('since')}&after=${q('after')}&target=${q('target')}`));}
 if(request.method!=='POST')error('Method not allowed',405);
 let input;try{input=JSON.parse(new TextDecoder().decode(await readLimited(request,url.pathname==='/assets/reconcile'?256*1024:REQUEST_LIMIT)));}catch(e){if(e.status)throw e;error('Invalid sync request');}
 return json(await call(env,uid,url.pathname==='/assets/reconcile'?'/asset-reconcile':'/push',input));
}
/** Part of the outline for AI app reads; see SyncSpace.subset. */
export async function readSubsetV3(env,uid,query){return call(env,uid,'/subset',query);}
export async function readDocumentV3(env,uid){const {doc,revision}=await call(env,uid,'/read');return {doc,revision};}
/** v3 counterpart of commitServerChange: compute the change on the current document, send
 only the changed keys, and let the space rebase them onto concurrent edits. */
export async function commitChangeV3(env,uid,{operationId,requestHash,change}){
 const {doc,assets,revision}=await call(env,uid,'/read');
 const out=change(doc);if(out.doc===doc)return {revision,unchanged:true,result:out.result};
 const patch=diffPatch(doc,out.doc);if(emptyPatch(patch))return {revision,unchanged:true,result:out.result};
 const r=await call(env,uid,'/patch',{operationId,requestHash,patch,assetsBefore:assets,assetsAfter:assets});
 return {revision:r.revision,replayed:r.replayed,result:r.replayed?null:out.result};
}

export const reserveV3Attachment=(env,uid,hash,size)=>call(env,uid,'/asset-reserve',{hash,size});
export const finishV3Attachment=(env,uid,token,failed=false)=>call(env,uid,'/asset-finish',{token,failed});
