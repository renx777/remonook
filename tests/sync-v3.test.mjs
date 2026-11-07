import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {route} from '../cloud/worker.mjs';
import {syncSpaces as spaces} from './helpers/sync-space.mjs';
import {empty} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';
import {applyDocument,mergeUpdates,projectBuckets,bulletBucket} from '../src/sync-buckets.mjs';

function d1(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('cloud/schema.sql','utf8'));
 const stmt=sql=>{let params=[];return {bind(...p){params=p;return this;},async first(){return sqlite.prepare(sql).get(...params)||null;},async all(){return {results:sqlite.prepare(sql).all(...params)};},async run(){const r=sqlite.prepare(sql).run(...params);return {success:true,meta:{changes:r.changes}};},exec(){return sqlite.prepare(sql).run(...params);}};};
 return {prepare:stmt,async batch(list){sqlite.exec('BEGIN');try{for(const s of list)s.exec();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}return [];}};}
function setup(){const env={DB:d1()};env.SYNC_SPACE=spaces(env);return env;}
const call=(env,method,path,body,uid='alice')=>route(new Request('https://sync.test'+path,{method,headers:{Authorization:'Bearer '+uid,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,async t=>t).catch(e=>Response.json({error:e.message,code:e.code},{status:e.status||500}));
let n=0;const op=()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`;

class Device{
 constructor(env,uid='alice',clientID){this.env=env;this.uid=uid;this.clientID=clientID;this.states=new Map();this.since=0;this.cache=new Map();}
 get doc(){return projectBuckets(this.states,this.cache).doc;}
 async pull(){let after='',target='';for(;;){const r=await(await call(this.env,'GET',`/sync/v3?since=${this.since}&after=${after}&target=${target}`,null,this.uid)).json();assert.equal(r.protocol,3,JSON.stringify(r));this.states=mergeUpdates(this.states,r.updates);this.since=r.revision;if(!r.more)return r;after=r.after||'';target=r.target||'';}}
 edit(fn){const before=this.doc,after=structuredClone(before);fn(after);const out=applyDocument(this.states,before,after,{clientID:this.clientID});this.states=out.states;return out.updates;}
 async push(updates,operationId=op()){const r=await call(this.env,'POST','/sync/v3',{operationId,updates,since:this.since},this.uid);const body=await r.json();if(r.ok){this.states=mergeUpdates(this.states,body.updates);this.since=body.revision;}return {status:r.status,body};}
}

test('v3: devices push only touched buckets, pull journal deltas and converge',async()=>{
 const env=setup(),a=new Device(env,'alice',11),b=new Device(env,'alice',12);
 await a.pull();
 const u1=a.edit(d=>{d.tables.bullets=Array.from({length:300},(_,i)=>bullet('n'+i,{text:'note '+i}));});
 assert.equal((await a.push(u1)).status,200);
 await b.pull();assert.equal(b.doc.tables.bullets.length,300);
 // Concurrent offline edits to the same bullet and to different bullets.
 const ua=a.edit(d=>{d.tables.bullets.find(x=>x.id==='n7').text+=' from A';}),ub=b.edit(d=>{d.tables.bullets.find(x=>x.id==='n7').text='Edited '+d.tables.bullets.find(x=>x.id==='n7').text;d.tables.bullets.find(x=>x.id==='n9').text='B';});
 assert.deepEqual(Object.keys(ua),[bulletBucket('n7')],'one text edit sends one bucket');
 assert.equal((await a.push(ua)).status,200);assert.equal((await b.push(ub)).status,200);await a.pull();
 const t=x=>x.doc.tables.bullets.find(n=>n.id==='n7').text;
 assert.equal(t(a),'Edited note 7 from A');assert.equal(t(a),t(b));
 assert.equal(a.doc.tables.bullets.find(n=>n.id==='n9').text,'B');
});

test('v3: replayed operation is acknowledged once; reused id with other content is refused',async()=>{
 const env=setup(),a=new Device(env,'alice',21);await a.pull();
 const u=a.edit(d=>{d.tables.bullets=[bullet('x',{text:'one'})];}),id=op();
 const first=await a.push(u,id),again=await a.push(u,id);
 assert.equal(first.status,200);assert.equal(again.status,200);assert.equal(again.body.committed,first.body.committed);
 const other=a.edit(d=>{d.tables.bullets[0].text='two';});
 assert.equal((await a.push(other,id)).status,409);
});

test('v3: an invalid record is refused with nothing committed; read-time repair breaks move cycles',async()=>{
 const env=setup(),a=new Device(env,'alice',31);await a.pull();
 await a.push(a.edit(d=>{d.tables.bullets=[bullet('p',{text:'p'}),bullet('c',{parentId:'p',text:'c'})];}));
 const rev=a.since;
 const bad=a.edit(d=>{d.tables.bullets[0].kind='WEIRD';});
 const r=await a.push(bad);assert.equal(r.status,400);assert.equal(r.body.code,'SYNC_VALIDATION_FAILED');
 const fresh=new Device(env,'alice',32);await fresh.pull();assert.equal(fresh.since,rev);assert.equal(fresh.doc.tables.bullets.find(n=>n.id==='p').kind,'NOTE');
 // Two devices create a cycle concurrently; everyone reads the same repaired tree.
 const x=new Device(env,'alice',33),y=new Device(env,'alice',34);await x.pull();await y.pull();
 await x.push(x.edit(d=>{d.tables.bullets.find(n=>n.id==='p').parentId='c';}));
 await y.push(y.edit(d=>{d.tables.bullets.find(n=>n.id==='c').parentId=null;d.tables.bullets.find(n=>n.id==='p').parentId=null;}));
 await x.pull();await y.pull();assert.deepEqual(x.doc.tables.bullets.map(n=>[n.id,n.parentId]),y.doc.tables.bullets.map(n=>[n.id,n.parentId]));
});

test('v3: first use copies the v2 workspace, old app versions get 426, AI apps read and write',async()=>{
 const env=setup(),doc=empty();doc.tables.bullets=[bullet('trip',{text:'Trip to Goa'})];
 await call(env,'PUT','/workspace',{baseRevision:0,doc,assets:[]});
 const a=new Device(env,'alice',41);await a.pull();
 assert.equal(a.doc.tables.bullets[0].text,'Trip to Goa');
 assert.equal((await call(env,'GET','/sync/v2')).status,426,'v2 is closed for this account');
 const token=(await(await call(env,'POST','/mcp/tokens',{name:'Test',scopes:['read','write']})).json()).token;
 const rpc=async(name,args)=>(await(await call(env,'POST','/mcp',{jsonrpc:'2.0',id:++n,method:'tools/call',params:{name,arguments:args}},token)).json()).result;
 assert.match((await rpc('search',{query:'Goa'})).content[0].text,/Trip to Goa/);
 const w=await rpc('write_notes',{markdown:'- Packing list\n  - Sunscreen',parent_id:'trip'});assert.ok(!w.isError,JSON.stringify(w));
 await a.pull();assert.deepEqual(a.doc.tables.bullets.map(n=>n.text).sort(),['Packing list','Sunscreen','Trip to Goa']);
});

test('v3: a device behind the journal gets whole buckets page by page',async()=>{
 const env=setup(),a=new Device(env,'alice',51);await a.pull();
 for(let k=0;k<3;k++)await a.push(a.edit(d=>{d.tables.bullets.push(...Array.from({length:50},(_,i)=>bullet(`k${k}_${i}`,{text:'x'.repeat(40)})));}));
 const space=env.SYNC_SPACE.live.get('alice');space.ctx.db.exec('DELETE FROM journal');
 const late=new Device(env,'alice',52);await late.pull();
 assert.equal(late.doc.tables.bullets.length,150);assert.equal(late.since,space.revision());
});
