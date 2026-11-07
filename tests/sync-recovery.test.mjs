import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import 'fake-indexeddb/auto';
import {empty,save,load,setStorageAccount,syncMetadata,syncOperation} from './.build/data.mjs';
import {Y,seed,openShared,sharedState,project,applyIntent,vector,delta,unpack} from '../src/sync-crdt.mjs';
import {initializeOutbox,recordLocal,claimOutbox,receiveOutbox} from '../src/sync-outbox.mjs';
import {recoverRejectedBatch} from '../src/sync-recovery.mjs';
import {bullet} from '../src/domain.mjs';
import {route} from '../cloud/worker.mjs';
import {workdaysV2,validateWorkdaysV2} from '../src/workdays-v2.mjs';

function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('cloud/schema.sql','utf8'));
 const env={DB:{prepare(sql){let params=[];return{bind(...p){params=p;return this;},async first(){return sqlite.prepare(sql).get(...params)||null;},run(){sqlite.prepare(sql).run(...params);}};},async batch(list){sqlite.exec('BEGIN');try{for(const s of list)await s.run();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}}}};
 const call=(method,body)=>route(new Request('https://sync.test/sync/v2',{method,headers:{Authorization:'Bearer alice','X-Remo-Capabilities':'workdays-v2'},...(body?{body:JSON.stringify(body)}:{})}),env,async()=> 'alice');
 return {sqlite,call};
}
const base=()=>{const d=empty();d.tables.bullets=[bullet('a',{text:'Initial.'}),bullet('b',{text:'Another note.',position:1})];return d;};
async function setup(){const f=fixture(),server=await(await f.call('GET')).json(),doc=base();const m=initializeOutbox(server.update,server.revision,project(openShared(server.update)).doc,doc,[]);claimOutbox(m);receiveOutbox(m,await(await f.call('POST',m.inflight)).json());return {...f,doc,m};}
const snapshot=m=>{const y=openShared(m.receivedState);try{return project(y).doc;}finally{y.destroy();}};

test('permanent rejection preserves bytes, fixes only invalid domain, and later dependent text reaches two devices',async()=>{
 const f=await setup();try{
  const bad=structuredClone(f.doc);bad.web.dashboard={version:'unsupported',customText:'Keep this setting'};bad.tables.bullets[0].text='First edit from phone.';recordLocal(f.m,bad);claimOutbox(f.m);
  const rejected=structuredClone(f.m.inflight),ids=f.m.pending.map(p=>p.id);
  await assert.rejects(f.call('POST',rejected),e=>e.status===400&&e.code==='SYNC_VALIDATION_FAILED');
  // Another local operation and an accepted remote operation arrive during POST.
  const later=structuredClone(bad);later.tables.bullets[0].text='First edit from phone. Later dependent text.';recordLocal(f.m,later);
  const server=await(await f.call('GET')).json(),remote=openShared(server.update),rbase=project(remote).doc,rnext=structuredClone(rbase),v=vector(remote);rnext.tables.bullets[1].text='Another note. Laptop edit retained.';applyIntent(remote,rbase,rnext);await f.call('POST',{operationId:crypto.randomUUID(),update:delta(remote,v),vector:vector(remote)});remote.destroy();
  const latest=await(await f.call('GET')).json();recoverRejectedBatch(f.m,latest,rejected.operationId,'Dashboard validation failed');
  assert.equal(f.m.recoveries[0].request.update,rejected.update);
  assert.ok(ids.every(id=>f.m.pending.some(p=>p.id===id)),'no pending ID acknowledged during repair');
  assert.ok(f.m.inflight.recovery);assert.match(JSON.stringify(snapshot(f.m)),/Keep this setting/);
  // Reload and response loss reuse one immutable corrected operation.
  const restored=structuredClone(f.m),request=structuredClone(restored.inflight),ack=await(await f.call('POST',request)).json();
  const retry=await(await f.call('POST',request)).json();assert.equal(retry.revision,ack.revision);
  const after=structuredClone(later);after.tables.bullets[1].text='Another note. Local edit while repair was in flight.';recordLocal(restored,after);
  receiveOutbox(restored,retry);assert.equal(restored.pending.length,1);
  claimOutbox(restored);receiveOutbox(restored,await(await f.call('POST',restored.inflight)).json());assert.equal(restored.pending.length,0);
  const one=snapshot(restored),two=project(openShared((await(await f.call('GET')).json()).update)).doc;
  assert.equal(one.tables.bullets.find(n=>n.id==='a').text,'First edit from phone. Later dependent text.');
  assert.match(two.tables.bullets.find(n=>n.id==='b').text,/Laptop edit retained/);
  assert.match(two.tables.bullets.find(n=>n.id==='b').text,/Local edit while repair/);
  assert.deepEqual(one,two);assert.equal(restored.recoveries.length,1);
 }finally{f.sqlite.close();}
});

test('server repairs v1 leftovers and holiday names beside v2 without losing originals or note edits',async()=>{
 const f=await setup();try{
  const doc=structuredClone(f.doc);doc.web.workdays=workdaysV2(doc,'2026-11-01');recordLocal(f.m,doc);claimOutbox(f.m);receiveOutbox(f.m,await(await f.call('POST',f.m.inflight)).json());
  const next=structuredClone(doc);next.tables.bullets[0].text='A good edit';next.web.workdays.holidays={'2026-11-03':'','2026-11-04':'x'.repeat(200),'2026-11-05':123};next.web.workdays.entries={'2026-11-02':{actual:{status:'WFH',detail:'',updatedAt:7,am:{mode:'WFO',updatedAt:9}}}};next.web.workdays.policies=[{legacy:'keep me'}];recordLocal(f.m,next);claimOutbox(f.m);
  // A v2 sender with stray *new* v1 fields uses the compatibility context path.
  f.m.inflight.workdaysContext=next.web.workdays;
  receiveOutbox(f.m,await(await f.call('POST',f.m.inflight)).json());
  const result=snapshot(f.m);validateWorkdaysV2(result.web.workdays);assert.equal(result.web.workdays.entries['2026-11-02'].actual.am.mode,'WFO');assert.equal(result.tables.bullets.find(n=>n.id==='a').text,'A good edit');
  const text=result.tables.bullets.map(n=>n.text).join('\n');assert.match(text,/keep me/);assert.match(text,/x{200}/);assert.match(text,/WFH/);assert.match(text,/123/);
  const replay=new Y.Doc();for(const row of f.sqlite.prepare('SELECT update_body FROM sync_journal ORDER BY accepted_revision').all())Y.applyUpdate(replay,unpack(row.update_body));assert.deepEqual(project(replay).doc,project(openShared((await(await f.call('GET')).json()).update)).doc);replay.destroy();
 }finally{f.sqlite.close();}
});

test('a full 64-operation claim includes its correction, retains the switch marker, and can be accepted',async()=>{
 const f=await setup();try{
  let doc=structuredClone(f.doc);doc.web.workdays=workdaysV2(doc,'2026-11-01');recordLocal(f.m,doc);claimOutbox(f.m);receiveOutbox(f.m,await(await f.call('POST',f.m.inflight)).json());
  const server=await(await f.call('GET')).json(),version=JSON.stringify(['web','workdays','version']),prior=openShared(server.update),marker=prior.getMap('fields')._map.get(version).id;prior.destroy();
  for(let i=0;i<64;i++){const next=structuredClone(doc);next.tables.bullets[0].text+=' '+i;next.web.dashboard={version:'bad'};recordLocal(f.m,next);doc=next;}
  claimOutbox(f.m);assert.equal(f.m.inflight.ids.length,64);const rejected=f.m.inflight.operationId;
  recoverRejectedBatch(f.m,server,rejected,'Dashboard validation');assert.equal(f.m.inflight.ids.length,65);assert.equal(f.m.pending.length,65);
  const local=openShared(f.m.receivedState);assert.deepEqual(local.getMap('fields')._map.get(version).id,marker);local.destroy();
  receiveOutbox(f.m,await(await f.call('POST',f.m.inflight)).json());assert.equal(f.m.pending.length,0);assert.match(snapshot(f.m).tables.bullets.find(n=>n.id==='a').text,/ 63$/);
 }finally{f.sqlite.close();}
});

test('invalid note metadata is preserved while its text and other notes continue syncing',async()=>{
 const f=await setup();try{
  const doc=structuredClone(f.doc);doc.tables.bullets[0].kind='FUTURE_KIND';doc.tables.bullets[0].text='Never lose this text.';doc.tables.bullets[1].text='Valid independent edit.';recordLocal(f.m,doc);claimOutbox(f.m);
  await assert.rejects(f.call('POST',f.m.inflight),e=>e.code==='SYNC_VALIDATION_FAILED');
  recoverRejectedBatch(f.m,await(await f.call('GET')).json(),f.m.inflight.operationId,'Invalid metadata');receiveOutbox(f.m,await(await f.call('POST',f.m.inflight)).json());
  const result=snapshot(f.m);assert.equal(result.tables.bullets.find(n=>n.id==='a').text,'Never lose this text.');assert.equal(result.tables.bullets.find(n=>n.id==='b').text,'Valid independent edit.');assert.match(JSON.stringify(result),/FUTURE_KIND/);
 }finally{f.sqlite.close();}
});
