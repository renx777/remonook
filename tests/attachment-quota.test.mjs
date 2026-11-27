import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {route} from '../cloud/worker.mjs';import {syncSpaces} from './helpers/sync-space.mjs';import {empty} from './.build/data.mjs';import {bullet} from '../src/domain.mjs';
import {applyDocument,projectBuckets} from '../src/sync-buckets.mjs';import {Y,unpack} from '../src/sync-crdt.mjs';
import {initializeOutbox,recordLocal,stageAssets,claimOutbox,claimQuotaProgress,receiveQuotaProgress,receiveOutbox} from '../src/sync-outbox-v3.mjs';
const MiB=1024*1024,id=()=>crypto.randomUUID(),hash=n=>n.toString(16).padStart(64,'0');
function setup(){const db=new DatabaseSync(':memory:');db.exec(readFileSync('cloud/schema.sql','utf8'));const files=new Map();let deleted=0;
 const env={DB:{prepare(sql){let p=[];return{bind(...a){p=a;return this;},async first(){return db.prepare(sql).get(...p)||null;},async all(){return{results:db.prepare(sql).all(...p)};},async run(){return db.prepare(sql).run(...p);}};},async batch(list){db.exec('BEGIN');try{for(const s of list)await s.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}},FILES:{async put(k,b){files.set(k,{size:b.length,bytes:b});},async head(k){return files.get(k)||null;},async get(k){const f=files.get(k);return f?{...f,body:new Blob([f.bytes||'retained']).stream()}:null;},async delete(k){deleted++;files.delete(k);}}};env.SYNC_SPACE=syncSpaces(env);
 const send=async(method,path,body,uid='alice')=>{try{return await route(new Request('https://sync.test'+path,{method,headers:{Authorization:'Bearer '+uid},...(body===undefined?{}:{body:body instanceof Uint8Array?body:JSON.stringify(body)})}),env,async t=>t);}catch(e){return Response.json({error:e.message,code:e.code},{status:e.status||500});}};
 return {db,env,files,send,get deleted(){return deleted;}};
}
function memoryIO(){const values=new Map();return {values,async load(kind,ids){return new Map(ids.flatMap(b=>values.has(kind+':'+b)?[[b,values.get(kind+':'+b)]]:[]));},put(kind,b,state){values.set(kind+':'+b,state);}};}
async function fullAccount(){const f=setup();let response=await(await f.send('GET','/sync/v3?since=0')).json(),states=new Map(Object.entries(response.updates));const base=projectBuckets(states).doc,doc=structuredClone(base);doc.tables.bullets=[bullet('note',{text:'Original note'})];
 const assets=Array.from({length:10},(_,i)=>({path:'media/old'+i+'.bin',hash:hash(i+1),size:2*MiB,type:'application/octet-stream'}));
 for(const [i,a] of assets.entries()){doc.tables.media.push({id:'file'+i,bulletId:'note',fileName:'old'+i+'.bin',mimeType:a.type,sourceUrl:'',credit:'',licenseUrl:''});f.db.prepare('INSERT INTO assets VALUES(?,?,?)').run('alice',a.hash,a.size);f.files.set('alice/'+a.hash,{size:a.size});}
 const written=applyDocument(states,base,doc,{assetsBefore:[],assetsAfter:assets,clientID:31});const seeded=await f.send('POST','/sync/v3',{operationId:id(),updates:written.updates,since:0});assert.equal(seeded.status,200,await seeded.clone().text());
 response=await(await f.send('GET','/sync/v3?since=0')).json();const io=memoryIO(),meta=await initializeOutbox(response,doc,assets,false,io);return {...f,doc,assets,io,meta};
}
async function progress(f,mode){claimQuotaProgress(f.meta,mode);const body=f.meta.quotaProgress?.[mode];if(!body)return;const r=await f.send('POST','/sync/v3',{...body,since:f.meta.since});assert.equal(r.status,200,await r.clone().text());await receiveQuotaProgress(f.meta,await r.json(),f.io,mode);}
const retire=(f,hashes,uid='alice')=>f.send('POST','/assets/reconcile',{operationId:id(),hashes,since:0},uid);
const state=f=>f.env.SYNC_SPACE.live.get('alice').read();

test('a full account retires an explicit deletion, uploads the replacement, and drains immutable batches without losing later text',async()=>{
 const f=await fullAccount();const bytes=new Uint8Array([7,8,9]),digest=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex'),added={path:'media/new.bin',hash:digest,size:bytes.length,type:'application/octet-stream'};
 let d=structuredClone(f.doc);d.tables.media.push({id:'new',bulletId:'note',fileName:'new.bin',mimeType:added.type,sourceUrl:'',credit:'',licenseUrl:''});await recordLocal(f.meta,d,f.io);await stageAssets(f.meta,[...f.assets,added],f.io);claimOutbox(f.meta);const immutable=JSON.stringify(f.meta.inflight),originalPending=JSON.stringify(f.meta.pending);
 const full=await f.send('PUT','/assets/'+digest,bytes);assert.equal(full.status,413);assert.equal((await full.json()).code,'ATTACHMENT_QUOTA_FULL');
 d=structuredClone(d);d.tables.media=d.tables.media.filter(m=>m.id!=='file0');d.tables.bullets[0].text='Later edit survives';await recordLocal(f.meta,d,f.io);await stageAssets(f.meta,[...f.assets.slice(1),added],f.io);
 await progress(f,'notes');await progress(f,'removals');assert.equal(JSON.stringify(f.meta.inflight),immutable);assert.ok(f.meta.pending.length);assert.equal(state(f).doc.tables.bullets[0].text,'Later edit survives');assert.ok(!state(f).assets.some(a=>a.hash===hash(1)));
 const cleanup=await retire(f,[hash(1)]);assert.equal(cleanup.status,200);assert.equal((await cleanup.json()).freed,2*MiB);assert.ok(f.files.has('alice/'+hash(1)),'original retained for offline recovery');assert.equal(f.deleted,0);
 assert.equal((await f.send('PUT','/assets/'+digest,bytes)).status,200);
 let rounds=0;while(f.meta.pending.length&&rounds++<10){claimOutbox(f.meta);const request=structuredClone(f.meta.inflight),r=await f.send('POST','/sync/v3',{...request,since:f.meta.since});assert.equal(r.status,200,await r.clone().text());await receiveOutbox(f.meta,await r.json(),f.io);}
 assert.equal(f.meta.pending.length,0);assert.equal(f.meta.inflight,null);assert.equal(state(f).doc.tables.bullets[0].text,'Later edit survives');assert.ok(state(f).assets.some(a=>a.hash===digest));assert.equal(state(f).assets.length,10);assert.ok(originalPending.length>0);f.db.close();
});
test('progress identity and bytes survive reload/lost response; progress never acknowledges original outbox data',async()=>{
 const f=await fullAccount(),d=structuredClone(f.doc);d.tables.bullets[0].text='Queued text';await recordLocal(f.meta,d,f.io);claimOutbox(f.meta);const original=JSON.stringify(f.meta.inflight),pending=JSON.stringify(f.meta.pending);claimQuotaProgress(f.meta,'notes');const request=structuredClone(f.meta.quotaProgress.notes),r=await f.send('POST','/sync/v3',{...request,since:0});assert.equal(r.status,200);
 f.meta=structuredClone(f.meta);claimQuotaProgress(f.meta,'notes');assert.deepEqual(f.meta.quotaProgress.notes,request);const replay=await f.send('POST','/sync/v3',{...request,since:0});assert.equal(replay.status,200);await receiveQuotaProgress(f.meta,await replay.json(),f.io,'notes');assert.equal(JSON.stringify(f.meta.inflight),original);assert.equal(JSON.stringify(f.meta.pending),pending);assert.equal(f.meta.quotaProgress.notes,undefined);claimQuotaProgress(f.meta,'notes');assert.equal(f.meta.quotaProgress.notes,undefined);assert.equal(state(f).doc.tables.bullets[0].text,'Queued text');f.db.close();
});
test('delete-set progress cancels an addition deleted before its immutable batch ever reached the server',async()=>{
 const f=await fullAccount(),fresh={path:'media/never-uploaded.bin',hash:hash(90),size:10,type:'application/octet-stream'};
 await stageAssets(f.meta,[...f.assets,fresh],f.io);claimOutbox(f.meta);const original=structuredClone(f.meta.inflight);await stageAssets(f.meta,f.assets,f.io);await progress(f,'removals');
 const r=await f.send('POST','/sync/v3',{...original,since:0});assert.equal(r.status,200,await r.clone().text());assert.ok(!state(f).assets.some(a=>a.hash===fresh.hash));f.db.close();
});
test('Trash and another device’s live references protect allocation after a manifest deletion',async()=>{
 const f=await fullAccount(),d=structuredClone(f.doc);d.tables.media=d.tables.media.filter(m=>m.id!=='file0');d.tables.trash.push({id:'trash',payload:JSON.stringify({nodes:[],media:[{fileName:'old0.bin'}]}),nodeCount:0,deletedAt:Date.now()});await recordLocal(f.meta,d,f.io);await stageAssets(f.meta,f.assets.slice(1),f.io);await progress(f,'notes');await progress(f,'removals');
 let r=await retire(f,[hash(1)]);assert.deepEqual((await r.json()).retired,[]);assert.equal(f.db.prepare('SELECT size FROM assets WHERE uid=? AND hash=?').get('alice',hash(1)).size,2*MiB);
 const server=state(f),states=new Map(Object.entries((await(await f.send('GET','/sync/v3?since=0')).json()).updates)),remote=structuredClone(server.doc);remote.tables.trash=[];remote.tables.media.push({id:'remote',bulletId:'note',fileName:'old0.bin',mimeType:'application/octet-stream',sourceUrl:'',credit:'',licenseUrl:''});const u=applyDocument(states,server.doc,remote,{clientID:45});assert.equal((await f.send('POST','/sync/v3',{operationId:id(),updates:u.updates,since:0})).status,200);
 r=await retire(f,[hash(1)]);assert.deepEqual((await r.json()).retired,[]);assert.equal(f.deleted,0);f.db.close();
});
test('account-scoped retirement protects upload leases and does not remove another account’s allocation',async()=>{
 const f=await fullAccount();f.db.prepare('INSERT INTO assets VALUES(?,?,?)').run('bob',hash(71),25);const stub=f.env.SYNC_SPACE.get('alice');
 f.db.prepare('DELETE FROM assets WHERE uid=? AND hash=?').run('alice',hash(1));
 const lease=await(await stub.fetch(new Request('https://sync-space/asset-reserve',{method:'POST',headers:{'X-Remo-Uid':'alice'},body:JSON.stringify({hash:hash(88),size:10})}))).json();assert.ok(lease.token);
 let r=await retire(f,[hash(88),hash(71)]);assert.ok(!(await r.json()).retired.includes(hash(88)));assert.ok(f.db.prepare('SELECT * FROM assets WHERE uid=? AND hash=?').get('bob',hash(71)));
 await stub.fetch(new Request('https://sync-space/asset-finish',{method:'POST',headers:{'X-Remo-Uid':'alice'},body:JSON.stringify({token:lease.token})}));r=await retire(f,[hash(88)]);assert.deepEqual((await r.json()).retired,[hash(88)]);f.db.close();
});
test('retained originals are reallocated before an offline client restores their manifest references',async()=>{
 const f=await fullAccount(),d=structuredClone(f.doc);d.tables.media=d.tables.media.filter(m=>m.id!=='file0');await recordLocal(f.meta,d,f.io);await stageAssets(f.meta,f.assets.slice(1),f.io);await progress(f,'notes');await progress(f,'removals');await retire(f,[hash(1)]);
 assert.equal(f.db.prepare('SELECT * FROM assets WHERE uid=? AND hash=?').get('alice',hash(1)),undefined);const pulled=await(await f.send('GET','/sync/v3?since=0')).json(),states=new Map(Object.entries(pulled.updates)),before=projectBuckets(states),next=structuredClone(before.doc);next.tables.media.push({id:'restored',bulletId:'note',fileName:'old0.bin',mimeType:'application/octet-stream',sourceUrl:'',credit:'',licenseUrl:''});const write=applyDocument(states,before.doc,next,{assetsBefore:before.assets,assetsAfter:f.assets,clientID:62});
 const r=await f.send('POST','/sync/v3',{operationId:id(),updates:write.updates,since:0});assert.equal(r.status,200,await r.clone().text());assert.equal(f.db.prepare('SELECT size FROM assets WHERE uid=? AND hash=?').get('alice',hash(1)).size,2*MiB);assert.equal(f.deleted,0);f.db.close();
});
test('legacy orphan allocations are reclaimed without a device hash receipt and without deleting originals',async()=>{
 const f=await fullAccount();f.db.prepare('DELETE FROM assets WHERE uid=? AND hash=?').run('alice',hash(10));f.db.prepare('INSERT INTO assets VALUES(?,?,?)').run('alice',hash(99),2*MiB);f.files.set('alice/'+hash(99),{size:2*MiB});
 const r=await retire(f,[]),result=await r.json();assert.equal(result.freed,2*MiB);assert.ok(result.retired.includes(hash(99)));assert.ok(!result.retired.includes(hash(1)));assert.ok(f.files.has('alice/'+hash(99)));assert.equal(f.db.prepare('SELECT * FROM assets WHERE uid=? AND hash=?').get('alice',hash(99)),undefined);f.db.close();
});
test('failed binary writes release only their own unreferenced reservation',async()=>{
 const f=await fullAccount();f.db.prepare('DELETE FROM assets WHERE uid=? AND hash=?').run('alice',hash(10));const bytes=new Uint8Array([1,6,4]),digest=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');f.env.FILES.put=async()=>{throw Error('Temporary object-store failure');};const r=await f.send('PUT','/assets/'+digest,bytes);assert.equal(r.status,500);assert.equal(f.db.prepare('SELECT * FROM assets WHERE uid=? AND hash=?').get('alice',digest),undefined);assert.ok(f.db.prepare('SELECT * FROM assets WHERE uid=? AND hash=?').get('alice',hash(1)));f.db.close();
});
test('combined storage remains enforced after accounting recovery',async()=>{
 const f=await fullAccount();for(let i=0;i<4;i++)f.db.prepare('INSERT INTO books VALUES(?,?,?,?,?,?,?,?,?)').run('alice',id(),'Book '+i+'.pdf','pdf',20*MiB,hash(200+i),'ready',0,0);
 const bytes=new Uint8Array([2,2,7]),digest=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');assert.equal((await f.send('PUT','/assets/'+digest,bytes)).status,413);const result=await(await retire(f,[])).json();assert.equal(result.freed,0);assert.equal((await f.send('PUT','/assets/'+digest,bytes)).status,413);f.db.close();
});
test('quota maintenance uses attachment reference indexes without assembling every note',async()=>{
 const f=await fullAccount();f.env.SYNC_SPACE.live.get('alice').read=()=>{throw Error('Whole-document scan is forbidden on this path');};const r=await retire(f,[]);assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).freed,0);f.db.close();
});
test('lightweight catalogue paths retain animations, posters and required attribution for every current catalogue item',async()=>{
 const {catalogEmojis,catalogPosterPath,catalogCreditPath}=await import('../src/emoji-catalog.mjs');const {catalogAssetPaths}=await import('../src/emoji-asset-paths.mjs');
 for(const item of catalogEmojis)assert.deepEqual(catalogAssetPaths(item),['emoji/'+item.fileName,catalogPosterPath(item),catalogCreditPath(item)]);
 assert.deepEqual(catalogAssetPaths({token:':custom:',fileName:'local.gif'}),['emoji/local.gif']);
});

test('completed uploads stay leased until manifest acknowledgement or an explicit device retirement',async()=>{
 const f=await fullAccount();f.db.prepare('DELETE FROM assets WHERE uid=? AND hash=?').run('alice',hash(10));const bytes=new Uint8Array([9,3,1]),digest=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');assert.equal((await f.send('PUT','/assets/'+digest,bytes)).status,200);
 let result=await(await retire(f,[])).json();assert.ok(!result.retired.includes(digest));assert.ok(f.db.prepare('SELECT * FROM assets WHERE uid=? AND hash=?').get('alice',digest));result=await(await retire(f,[digest])).json();assert.ok(result.retired.includes(digest));assert.ok(f.files.has('alice/'+digest));f.db.close();
});
test('manifest quota rejection also recovers when a later removal makes the immutable original fit',async()=>{
 const f=await fullAccount(),copy={...f.assets[0],path:'media/copy.bin'};await stageAssets(f.meta,[...f.assets,copy],f.io);claimOutbox(f.meta);const original=structuredClone(f.meta.inflight);
 let r=await f.send('POST','/sync/v3',{...original,since:0});assert.equal(r.status,413);assert.equal((await r.json()).code,'ATTACHMENT_MANIFEST_FULL');await stageAssets(f.meta,[...f.assets.slice(1),copy],f.io);await progress(f,'removals');r=await f.send('POST','/sync/v3',{...original,since:0});assert.equal(r.status,200,await r.clone().text());assert.equal(state(f).assets.length,10);f.db.close();
});
test('reference history and upload leases remain protective after a Durable Object restart',async()=>{
 const f=await fullAccount(),d=structuredClone(f.doc);d.tables.media=d.tables.media.filter(m=>m.id!=='file0');d.tables.trash.push({id:'t',payload:JSON.stringify({nodes:[],media:[{fileName:'old0.bin'}]}),nodeCount:0,deletedAt:Date.now()});await recordLocal(f.meta,d,f.io);await stageAssets(f.meta,f.assets.slice(1),f.io);await progress(f,'notes');await progress(f,'removals');
 const old=f.env.SYNC_SPACE.live.get('alice');for(const cached of old.cache.values())cached.doc.destroy();const {SyncSpace}=await import('../cloud/sync-v3.mjs');f.env.SYNC_SPACE.live.set('alice',new SyncSpace(old.ctx,f.env));const r=await retire(f,[hash(1)]);assert.equal(r.status,200);assert.ok(!(await r.json()).retired.includes(hash(1)));assert.ok(f.db.prepare('SELECT * FROM assets WHERE uid=? AND hash=?').get('alice',hash(1)));f.db.close();
});
test('expired abandoned upload leases release quota without removing retained bytes',async()=>{
 const f=await fullAccount();f.db.prepare('DELETE FROM assets WHERE uid=? AND hash=?').run('alice',hash(10));const stub=f.env.SYNC_SPACE.get('alice'),r=await stub.fetch(new Request('https://sync-space/asset-reserve',{method:'POST',headers:{'X-Remo-Uid':'alice'},body:JSON.stringify({hash:hash(86),size:100})}));assert.equal(r.status,200);f.files.set('alice/'+hash(86),{size:100});assert.ok(!(await(await retire(f,[])).json()).retired.includes(hash(86)));
 f.env.SYNC_SPACE.live.get('alice').sql.exec('UPDATE asset_uploads SET expires=0 WHERE hash=?',hash(86));const result=await(await retire(f,[])).json();assert.ok(result.retired.includes(hash(86)));assert.ok(f.files.has('alice/'+hash(86)));f.db.close();
});
