import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair, exportJWK, SignJWT} from 'jose';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{route,readLimited,validatePayload,verifyUser} from '../cloud/worker.mjs';
import {cloudDocument,contentKey,syncDecision} from '../src/cloud-model.mjs';
import {mergeCloudWorkspaces} from '../src/cloud-merge.mjs';
import {bullet} from '../src/domain.mjs';
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

test('two clients reconcile separate nodes with server revision CAS; stale merge cannot overwrite a third client',async()=>{
 const env=setup(),base=empty();
 base.tables.bullets=[bullet('root',{text:'Root'}),bullet('a',{parentId:'root',text:'A'}),bullet('b',{parentId:'root',position:1,text:'B'})];
 const write=async(revision,doc)=>route(req('PUT','/workspace',{baseRevision:revision,doc:cloudDocument(doc),assets:[]}),env,auth);
 const seed=await write(0,base);assert.equal((await seed.json()).revision,1);
 const first=structuredClone(base),second=structuredClone(base);
 first.tables.bullets[1].text='A from laptop';
 second.tables.bullets[2].text='B from phone';

 assert.equal((await(await write(1,first)).json()).revision,2);
 const cloudAt2=await (await route(req('GET','/workspace'),env,auth)).json();
 const third=structuredClone(cloudAt2.doc);
 third.tables.bullets.push(bullet('c',{parentId:'root',position:2,text:'C from tablet'}));
 const firstMerge=mergeCloudWorkspaces(base,second,cloudAt2.doc);
 assert.equal(firstMerge.ok,true,JSON.stringify(firstMerge.conflicts));
 // Tablet wins before the phone's merged revision-2 update arrives.
 assert.equal((await(await write(2,third)).json()).revision,3);
 await assert.rejects(write(2,firstMerge.doc),error=>error.status===409);
 const latest=await (await route(req('GET','/workspace'),env,auth)).json();
 // Tablet's new node coexists with A because it started from revision 2;
 // the server rejected the phone's stale PUT rather than discarding C.
 assert.equal(latest.revision,3);
 assert.ok(latest.doc.tables.bullets.some(row=>row.id==='c'));
 assert.equal(latest.doc.tables.bullets.find(row=>row.id==='b').text,'B');
 // A base-aware retry merges the phone's B edit with laptop A and tablet C.
 const finalMerge=mergeCloudWorkspaces(base,second,latest.doc);
 assert.equal(finalMerge.ok,true,JSON.stringify(finalMerge.conflicts));
 assert.equal((await(await write(3,finalMerge.doc)).json()).revision,4);
 const finished=(await(await route(req('GET','/workspace'),env,auth)).json()).doc;
 assert.equal(finished.tables.bullets.find(n=>n.id==='a').text,'A from laptop');
 assert.equal(finished.tables.bullets.find(n=>n.id==='b').text,'B from phone');
 assert.ok(finished.tables.bullets.some(n=>n.id==='c'));
 env.sqlite.close();
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
test('authentication verifies the configured Firebase project and rejects another project',async(t)=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');
 const jwk={...await exportJWK(publicKey),kid:'test-google-key',alg:'RS256',use:'sig'};
 t.mock.method(globalThis,'fetch',async(url)=>{assert.equal(String(url),'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');return Response.json({keys:[jwk]});});
 const token=await new SignJWT({auth_time:Math.floor(Date.now()/1000),firebase:{sign_in_provider:'google.com'}}).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setSubject('staging-user').setIssuedAt().setExpirationTime('1h').setIssuer('https://securetoken.google.com/remonook-staging').setAudience('remonook-staging').sign(privateKey);
 assert.equal(await verifyUser(token,'remonook-staging'),'staging-user');
 await assert.rejects(verifyUser(token,'remo-978fb'),{code:'ERR_JWT_CLAIM_VALIDATION_FAILED'});
});
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
