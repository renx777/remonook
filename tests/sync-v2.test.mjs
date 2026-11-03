import {updateWorkdaysV2} from '../src/workdays-v2.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {Y,seed,sharedState,openShared,applyIntent,project,vector,delta,pack,unpack} from '../src/sync-crdt.mjs';
import {initializeOutbox,recordLocal,claimOutbox,receiveOutbox} from '../src/sync-outbox.mjs';
import {empty,save,load,setStorageAccount,syncMetadata} from './.build/data.mjs';
import 'fake-indexeddb/auto';
import {bullet} from '../src/domain.mjs';
import {route} from '../cloud/worker.mjs';
const copy=structuredClone;
const initial=()=>{const d=empty();d.tables.bullets=[bullet('a',{text:'Learn SQL.'}),bullet('b',{text:'Other',position:1})];return d;};
export function database(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('cloud/schema.sql','utf8'));const DB={prepare(sql){let params=[];return {bind(...p){params=p;return this;},async first(){return sqlite.prepare(sql).get(...params)||null;},run(){const r=sqlite.prepare(sql).run(...params);return {success:true,meta:{changes:r.changes}};}};},async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};return {DB,sqlite};}
const call=(env,method,path,body,uid='alice',headers={})=>route(new Request('https://sync.test'+path,{method,headers:{Authorization:'Bearer '+uid,...headers},...(body?{body:JSON.stringify(body)}:{})}),env,async t=>t);
async function started(){const env=database(),base=initial();await call(env,'PUT','/workspace',{baseRevision:0,doc:base,assets:[]});const server=await(await call(env,'GET','/sync/v2')).json();return {env,base,server};}
const edit=(state,base,fn)=>{const doc=copy(base);fn(doc);const d=openShared(state),v=vector(d);applyIntent(d,base,doc);return {state:sharedState(d),update:delta(d,v),vector:vector(d),doc};};

test('three rich-text clients converge in every arrival order with overlapping text and independent formatting',()=>{
 const base=initial(),root=seed(base),state=sharedState(root);
 const changes=[d=>d.tables.bullets[0].text='Learn SQL joins.',d=>d.tables.bullets[0].text='Learn SQL indexes.',d=>d.tables.bullets[0].formatting='0:5:BOLD'];
 const edits=changes.map(fn=>edit(state,base,fn));let expected;
 for(const order of [[0,1,2],[2,1,0],[1,0,2],[1,2,0],[0,2,1],[2,0,1]]){
  const d=openShared(state);for(const i of order){Y.applyUpdate(d,unpack(edits[i].update));Y.applyUpdate(d,unpack(edits[i].update));}
  const doc=project(d).doc;assert.match(doc.tables.bullets[0].text,/joins/);assert.match(doc.tables.bullets[0].text,/indexes/);assert.match(doc.tables.bullets[0].formatting,/BOLD/);
  const value=JSON.stringify(doc);expected??=value;assert.equal(value,expected);d.destroy();
 }root.destroy();
});

test('same text can receive concurrent bold and italic without losing either annotation',()=>{
 const base=initial(),s=sharedState(seed(base));const a=edit(s,base,d=>d.tables.bullets[0].formatting='0:5:BOLD'),b=edit(s,base,d=>d.tables.bullets[0].formatting='0:5:ITALIC');
 const y=openShared(s);Y.applyUpdate(y,unpack(a.update));Y.applyUpdate(y,unpack(b.update));const text=project(y).doc.tables.bullets[0];assert.match(text.formatting,/BOLD/);assert.match(text.formatting,/ITALIC/);
});

test('emoji edits use UTF-16 positions consistently and retain concurrent additions',()=>{
 const base=initial();base.tables.bullets[0].text='🐘 Hello';const s=sharedState(seed(base));
 const a=edit(s,base,d=>d.tables.bullets[0].text='🐘 Hello laptop'),b=edit(s,base,d=>d.tables.bullets[0].text='🐘 Hello phone');
 const y=openShared(s);Y.applyUpdate(y,unpack(a.update));Y.applyUpdate(y,unpack(b.update));const value=project(y).doc.tables.bullets[0].text;assert.ok(value.startsWith('🐘'));assert.match(value,/laptop/);assert.match(value,/phone/);assert.equal(value.includes('\uFFFD'),false);
});

test('backend serializes three clients, journals deltas once, and retries a lost acknowledgement',async()=>{
 const {env,base,server}=await started();try{
  const edits=[edit(server.update,base,d=>d.tables.bullets[0].text='Learn SQL joins.'),edit(server.update,base,d=>d.tables.bullets[0].text='Learn SQL indexes.'),edit(server.update,base,d=>d.tables.bullets[1].text='Tablet note')];
  const bodies=edits.map(e=>({operationId:crypto.randomUUID(),update:e.update,vector:e.vector}));
  const responses=await Promise.all(bodies.map(body=>call(env,'POST','/sync/v2',body)));assert.ok(responses.every(r=>r.status===200));
  const retry=await(await call(env,'POST','/sync/v2',bodies[0])).json();assert.equal(retry.revision,4);assert.equal(retry.acked,bodies[0].operationId);
  const latest=await(await call(env,'GET','/sync/v2')).json(),doc=project(openShared(latest.update)).doc;
  assert.match(doc.tables.bullets[0].text,/joins/);assert.match(doc.tables.bullets[0].text,/indexes/);assert.equal(doc.tables.bullets[1].text,'Tablet note');
  assert.equal(env.sqlite.prepare("SELECT COUNT(*) AS n FROM sync_journal WHERE operation_id!='__seed__'").get().n,3);
  assert.equal((await call(env,'GET','/sync/v2',undefined,'alice',{'If-None-Match':'4'})).status,304);
  await assert.rejects(call(env,'POST','/sync/v2',{...bodies[0],update:bodies[1].update}),e=>e.status===400);
 }finally{env.sqlite.close();}
});

test('migrated accounts reject writes from old snapshot tabs without changing their data',async()=>{
 const {env,base}=await started();try{await assert.rejects(call(env,'PUT','/workspace',{baseRevision:1,doc:base,assets:[]}),e=>e.status===426);assert.equal(env.sqlite.prepare('SELECT revision FROM workspaces').get().revision,1);}finally{env.sqlite.close();}
});

test('sync state and journal are private per user, including repeated operation IDs',async()=>{
 const {env,base,server}=await started();try{
  const a=edit(server.update,base,d=>d.tables.bullets[0].text='Private Alice'),id=crypto.randomUUID();await call(env,'POST','/sync/v2',{operationId:id,update:a.update,vector:a.vector});
  const bob=await(await call(env,'GET','/sync/v2',undefined,'bob')).json();assert.equal(project(openShared(bob.update)).doc.tables.bullets.length,0);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM sync_journal WHERE uid=? AND operation_id=?').get('bob',id).n,0);
 }finally{env.sqlite.close();}
});

test('outbox claim identity survives reload and acknowledges only its own edits',()=>{
 const base=initial(),state=sharedState(seed(base));let m=initializeOutbox(state,1,null,base,[]);
 const first=copy(base);first.tables.bullets[0].text='First';recordLocal(m,first);claimOutbox(m);const claim=copy(m.inflight);
 m=copy(m);const second=copy(first);second.tables.bullets[1].text='Second';recordLocal(m,second);claimOutbox(m);assert.equal(m.inflight.operationId,claim.operationId);
 receiveOutbox(m,{protocol:2,acked:claim.operationId,revision:2,update:pack(new Uint8Array([0,0]))});assert.equal(m.pending.length,1);assert.equal(m.inflight,null);
 assert.equal(project(openShared(m.receivedState)).doc.tables.bullets[1].text,'Second');
});

test('local edits and their Yjs outbox records commit atomically in IndexedDB',async()=>{
 setStorageAccount('v2-local-'+crypto.randomUUID());try{
  let doc=await save(null,initial(),'seed');const state=sharedState(seed(doc));await syncMetadata(()=>initializeOutbox(state,1,null,doc,[]),doc.revision);
  const next=copy(doc);next.tables.bullets[0].text='Durable offline edit';doc=await save(doc,next,'edit');
  const meta=await syncMetadata();assert.equal(meta.pending.length,1);assert.equal(project(openShared(meta.localState)).doc.tables.bullets[0].text,'Durable offline edit');assert.equal((await load()).tables.bullets[0].text,'Durable offline edit');
  await assert.rejects(save({...doc,revision:0},next,'stale'));assert.equal((await syncMetadata()).pending.length,1);
 }finally{setStorageAccount(null);}
});

test('legacy edits are imported onto a newer server baseline without deleting remote inserts',()=>{
 const base=initial(),remote=copy(base);remote.tables.bullets[0].text='Learn SQL joins.';
 const local=copy(base);local.tables.bullets[0].text='Learn SQL indexes.';
 const m=initializeOutbox(sharedState(seed(remote)),2,base,local,[],[]),value=project(openShared(m.receivedState)).doc.tables.bullets[0].text;
 assert.match(value,/joins/);assert.match(value,/indexes/);assert.equal(m.pending.length,1);
});

test('server journal replays into the exact acknowledged shared document',async()=>{
 const {env,base,server}=await started();try{
  const e=edit(server.update,base,d=>{d.tables.bullets[0].text='Journal edit';d.tables.bullets[0].formatting='0:7:BOLD';});
  await call(env,'POST','/sync/v2',{operationId:crypto.randomUUID(),update:e.update,vector:e.vector});
  const replay=new Y.Doc();for(const row of env.sqlite.prepare('SELECT update_body FROM sync_journal WHERE uid=? ORDER BY accepted_revision').all('alice'))Y.applyUpdate(replay,unpack(row.update_body));
  const current=await(await call(env,'GET','/sync/v2')).json();assert.deepEqual(project(replay),project(openShared(current.update)));
  assert.equal(JSON.parse(env.sqlite.prepare('SELECT body FROM sync_imports WHERE uid=?').get('alice').body).doc.tables.bullets[0].text,'Learn SQL.');
 }finally{env.sqlite.close();}
});

test('a failed journal transaction rolls back the state and can retry the same operation ID',async()=>{
 const {env,base,server}=await started();try{
  const e=edit(server.update,base,d=>d.tables.bullets[0].text='Durable'),body={operationId:crypto.randomUUID(),update:e.update,vector:e.vector},original=env.DB.batch;
  env.DB.batch=async stmts=>{env.sqlite.exec('BEGIN');stmts[0].run();env.sqlite.exec('ROLLBACK');throw Error('Simulated transaction failure');};
  await assert.rejects(call(env,'POST','/sync/v2',body),/Simulated transaction failure/);
  assert.equal(env.sqlite.prepare('SELECT revision FROM sync_documents WHERE uid=?').get('alice').revision,1);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM sync_journal WHERE operation_id=?').get(body.operationId).n,0);
  env.DB.batch=original;assert.equal((await(await call(env,'POST','/sync/v2',body)).json()).revision,2);
 }finally{env.sqlite.close();}
});

test('concurrent tree moves normalize automatically without dropping either note',async()=>{
 const {env,base,server}=await started();try{
  const a=edit(server.update,base,d=>d.tables.bullets[0].parentId='b'),b=edit(server.update,base,d=>d.tables.bullets[1].parentId='a');
  await Promise.all([a,b].map(e=>call(env,'POST','/sync/v2',{operationId:crypto.randomUUID(),update:e.update,vector:e.vector})));
  const current=project(openShared((await(await call(env,'GET','/sync/v2')).json()).update)).doc;
  assert.equal(current.tables.bullets.length,2);assert.equal(current.tables.bullets.find(x=>x.id==='a').parentId,null);assert.equal(current.tables.bullets.find(x=>x.id==='b').parentId,'a');
 }finally{env.sqlite.close();}
});

test('migration preserves unknown legacy formatting rather than silently stripping it',()=>{
 const doc=initial();doc.tables.bullets[0].formatting='0:5:FUTURE_STYLE';assert.equal(project(seed(doc)).doc.tables.bullets[0].formatting,'0:5:FUTURE_STYLE');
});

test('a concurrent edit of a deleted note is recovered automatically, but an observed deletion remains deleted',async()=>{
 const {env,base,server}=await started();try{
  const removed=edit(server.update,base,d=>d.tables.bullets=d.tables.bullets.filter(n=>n.id!=='a'));
  const changed=edit(server.update,base,d=>d.tables.bullets[0].text='Must survive deletion');
  for(const e of [removed,changed])await call(env,'POST','/sync/v2',{operationId:crypto.randomUUID(),update:e.update,vector:e.vector});
  const r=await(await call(env,'GET','/sync/v2')).json(),doc=project(openShared(r.update)).doc;
  assert.equal(doc.tables.bullets.find(n=>n.id==='a').text,'Must survive deletion');
  const observed=edit(r.update,doc,d=>d.tables.bullets=d.tables.bullets.filter(n=>n.id!=='a'));
  await call(env,'POST','/sync/v2',{operationId:crypto.randomUUID(),update:observed.update,vector:observed.vector});
  assert.equal(project(openShared((await(await call(env,'GET','/sync/v2')).json()).update)).doc.tables.bullets.some(n=>n.id==='a'),false);
 }finally{env.sqlite.close();}
});

test('many local saves reuse a session actor instead of growing one state-vector entry per keystroke',()=>{
 const base=initial(),m=initializeOutbox(sharedState(seed(base)),1,null,base,[]);
 for(let i=0;i<50;i++){const next=structuredClone(m.mappedDoc);next.tables.bullets[0].text='Edit '+i;recordLocal(m,next);}
 const entries=Y.decodeStateVector(unpack(vector(openShared(m.localState))));assert.ok(entries.size<=3,`Unexpected actor count: ${entries.size}`);
});

test('Workdays v2 capability gates reads, conditional reads, writes and legacy downloads without discarding outbox data',async()=>{
 const {env,base,server}=await started(),changed=edit(server.update,base,d=>{d.web.workdays=updateWorkdaysV2(d,w=>({...w,enabled:true})).web.workdays;}),body={operationId:crypto.randomUUID(),update:changed.update,vector:changed.vector};
 await assert.rejects(call(env,'POST','/sync/v2',body),e=>e.status===426);
 const response=await call(env,'POST','/sync/v2',body,'alice',{'X-Remo-Capabilities':'workdays-v2'});assert.equal(response.status,200);const result=await response.json();
 await assert.rejects(call(env,'GET','/sync/v2'),e=>e.status===426);
 await assert.rejects(call(env,'GET','/sync/v2',null,'alice',{'If-None-Match':String(result.revision)}),e=>e.status===426);
 await assert.rejects(call(env,'GET','/workspace'),e=>e.status===426);
 await assert.rejects(call(env,'POST','/sync/v2',{...body,operationId:crypto.randomUUID()}),e=>e.status===426);
 assert.equal((await call(env,'GET','/sync/v2',null,'alice',{'X-Remo-Capabilities':'workdays-v2','If-None-Match':String(result.revision)})).status,304);
});
