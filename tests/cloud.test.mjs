import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{route,readLimited,validatePayload,verifyUser} from '../cloud/worker.mjs';
import {cloudDocument,contentKey,syncDecision} from '../src/cloud-model.mjs';
import 'fake-indexeddb/auto';
import {empty,save,load,getAssets,setStorageAccount,cloudCheckpoint} from './.build/data.mjs';
function setup(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../cloud/schema.sql',import.meta.url),'utf8'));const DB={prepare(sql){let params=[];return {bind(...p){params=p;return this;},async first(){return sqlite.prepare(sql).get(...params)||null;},async run(){return sqlite.prepare(sql).run(...params);}};}};return {DB,sqlite};}
const req=(method,path,body,user='alice')=>new Request('https://sync.example'+path,{method,headers:{Authorization:'Bearer '+user},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
const auth=async token=>token;
const payload=(baseRevision=0,text='Hello')=>({baseRevision,doc:{tables:{bullets:[{id:'a',text}]},columns:{},preferences:{},web:{}},assets:[]});
test('sync CORS accepts both published origins and rejects lookalike domains',async()=>{
 for(const origin of ['https://remo-notes.arenukaprasad.chatgpt.site','https://remonook.com']){
  const r=await worker.fetch(new Request('https://sync.example/workspace',{method:'OPTIONS',headers:{Origin:origin}}),{FIREBASE_PROJECT_ID:'test-project',ALLOWED_ORIGINS:'https://remo-notes.arenukaprasad.chatgpt.site,https://remonook.com'});
  assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(r.headers.get('Vary'),'Origin');
 }
 for(const origin of ['https://remonook.com.evil.example','http://remonook.com','null']){
  const r=await worker.fetch(new Request('https://sync.example/workspace',{method:'OPTIONS',headers:{Origin:origin}}),{FIREBASE_PROJECT_ID:'test-project',ALLOWED_ORIGINS:'https://remo-notes.arenukaprasad.chatgpt.site,https://remonook.com'});
  assert.equal(r.status,403);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
 }
});
test('private workspaces isolate users and reject stale or missing revisions atomically',async()=>{
 const env=setup();let r=await route(req('PUT','/workspace',payload()),env,auth);assert.equal((await r.json()).revision,1);
 r=await route(req('GET','/workspace'),env,auth);assert.equal((await r.json()).doc.tables.bullets[0].text,'Hello');
 r=await route(req('GET','/workspace',undefined,'bob'),env,auth);assert.equal((await r.json()).doc,null);
 await assert.rejects(route(req('PUT','/workspace',payload(0,'Overwrite')),env,auth),e=>e.status===409);
 await assert.rejects(route(req('PUT','/workspace',payload(9),'bob'),env,auth),e=>e.status===409);
 const results=await Promise.allSettled([route(req('PUT','/workspace',payload(1,'One')),env,auth),route(req('PUT','/workspace',payload(1,'Two')),env,auth)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 await assert.rejects(route(new Request('https://sync.example/workspace'),env,auth),e=>e.status===401);env.sqlite.close();
});
test('bounded streaming reads and attachment manifests enforce server limits',async()=>{
 await assert.rejects(readLimited(new Request('https://x',{method:'PUT',body:'12345'}),4),e=>e.status===413);
 const p=payload();p.assets=[{path:'media/a',hash:'a'.repeat(64),size:2097153,type:'image/png'}];assert.throws(()=>validatePayload(p),e=>e.status===400);
 const env=setup();p.assets[0].size=1;await assert.rejects(route(req('PUT','/workspace',p),env,auth),e=>e.status===503);env.sqlite.close();
});
test('content addressed files enforce ownership, checksums and account quota',async()=>{
 const env=setup(),files=new Map();env.FILES={put:async(key,bytes)=>files.set(key,bytes),get:async key=>files.has(key)?{body:files.get(key)}:null};
 const body=new TextEncoder().encode('test'),hash=Buffer.from(await crypto.subtle.digest('SHA-256',body)).toString('hex');
 await route(req('PUT','/assets/'+hash,'test'),env,auth);
 await assert.rejects(route(req('GET','/assets/'+hash,undefined,'bob'),env,auth),e=>e.status===404);
 await assert.rejects(route(req('PUT','/assets/'+'a'.repeat(64),'test'),env,auth),e=>e.status===400);
 for(let i=0;i<10;i++)env.sqlite.prepare('INSERT INTO assets VALUES(?,?,?)').run('full',String(i),2097152);
 await assert.rejects(route(req('PUT','/assets/'+hash,'test','full'),env,auth),e=>e.status===413);env.sqlite.close();
});
test('untrusted authentication tokens are rejected',async()=>{await assert.rejects(verifyUser('invalid.jwt.token','test-project'));});
test('sync decisions protect changes on both devices',()=>{
 const d={revision:1,web:{deviceId:'one'},tables:{bullets:[]}};assert.equal(contentKey(d),contentKey({...d,revision:10,web:{deviceId:'two'}}));assert.equal(cloudDocument(d).revision,undefined);
 assert.equal(syncDecision(null,'new',0),'upload');assert.equal(syncDecision(null,'new',2),'download');assert.equal(syncDecision({revision:2,key:'old'},'new',3),'conflict');assert.equal(syncDecision({revision:2,key:'old'},'old',3),'download');assert.equal(syncDecision({revision:2,key:'old'},'new',2),'upload');
});
test('account databases isolate guest notes, assets and checkpoints',async()=>{
 setStorageAccount(null);await save(null,empty(),'guest',new Map([['guest',new Blob(['private'])]]));
 setStorageAccount('alice');assert.equal(await load(),null);assert.equal((await getAssets()).size,0);await cloudCheckpoint({revision:7,key:'alice'});await save(null,empty(),'alice');
 setStorageAccount('bob');assert.equal(await load(),null);assert.equal(await cloudCheckpoint(),null);
 setStorageAccount('alice');assert.equal((await cloudCheckpoint()).revision,7);assert.ok(await load());
 setStorageAccount(null);assert.equal(await (await getAssets()).get('guest').text(),'private');
});

test('sync worker fails closed without environment configuration',async()=>{const r=await worker.fetch(new Request('https://sync.example/health'),{});assert.equal(r.status,503);});
