import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {route} from '../cloud/worker.mjs';
import {empty,save,load,getAssets,setStorageAccount,cloudCheckpoint,syncMetadata} from './.build/data.mjs';
import 'fake-indexeddb/auto';
import {bullet} from '../src/domain.mjs';
import {cloudDocument,contentKey} from '../src/cloud-model.mjs';
import {openShared,sharedState,project,vector,delta,applyIntent} from '../src/sync-crdt.mjs';
await build({entryPoints:['src/useCloudSync.ts'],bundle:true,packages:'external',outfile:'tests/.build/sync-hook.mjs',format:'esm',platform:'node',plugins:[{name:'test-auth-only',setup(b){
 b.onResolve({filter:/^\.\/data$/},()=>({path:resolve('tests/.build/data.mjs'),external:true}));
 b.onResolve({filter:/^\.\/(CloudAccount|cloud-config)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='./CloudAccount'?`export const authenticatedUid=()=> 'alice';`:`export const CLOUD_API='https://sync.test';`}));
}}]});
const {useCloudSync}=await import('./.build/sync-hook.mjs');
const copy=structuredClone,pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<250;i++){if(check())return;await act(()=>pause(20));}assert.fail('Timed out waiting for sync');}
async function fixture(){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://remonook.com',pretendToBeVisual:true});
 for(const k of ['window','document','navigator'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;let online=true;Object.defineProperty(navigator,'onLine',{get:()=>online,configurable:true});
 setStorageAccount('v2-runtime-'+crypto.randomUUID());
 const base=empty();base.tables.bullets=[bullet('a',{text:'Learn SQL.'}),bullet('b',{text:'Other',position:1})];
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('cloud/schema.sql','utf8'));
 const env={DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},run(){const r=sqlite.prepare(sql).run(...args);return{success:true,meta:{changes:r.changes}};}};},async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}}};
 const send=(method,path,body,headers={})=>route(new Request('https://sync.test'+path,{method,headers:new Headers(Object.keys(headers).length?headers:{Authorization:'Bearer alice'}),...(body?{body:body instanceof Blob?body:JSON.stringify(body)}:{})}),env,async()=> 'alice');
 await send('PUT','/workspace',{baseRevision:0,doc:cloudDocument(base),assets:[]});
 let local=await save(null,base,'initial');await cloudCheckpoint({revision:1,key:JSON.stringify(cloudDocument(base))});
 let files=new Map(),uploads=0;env.FILES={async put(key,bytes){},async get(key){return null;}};
 const originalFetch=globalThis.fetch;let intercept=null,posts=0,fetches=0;
 globalThis.fetch=async(url,init={})=>{
  fetches++;if(init.method==='POST')posts++;if(init.method==='PUT'&&new URL(url).pathname.startsWith('/assets/'))uploads++;
  try{const perform=()=>send(init.method||'GET',new URL(url).pathname,typeof init.body==='string'?JSON.parse(init.body):init.body,Object.fromEntries(new Headers(init.headers)));
   if(intercept){const f=intercept;intercept=null;return await f(perform,init);}
   return await perform();
  }catch(e){if(!e.status)throw e;return Response.json({error:e.message},{status:e.status});}
 };
 let result,root,canApply=true;
 function Harness(){result=useCloudSync({user:{uid:'alice',getIdToken:async()=> 'token'},ready:true,revision:local.revision,get:()=>({doc:local,assets:files}),flush:async()=>{},canApply:()=>canApply,apply:async(doc,assets,sync)=>{local=await save(local,{...doc,web:{...doc.web,deviceId:local.web.deviceId}},'cloud download',assets,true,[],sync?.state);files=assets;}});return null;}
 const mount=async()=>{root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(Harness)));};await mount();
 return {base,sqlite,send,get doc(){return local;},get result(){return result;},get posts(){return posts;},get fetches(){return fetches;},get uploads(){return uploads;},get files(){return files;},async cacheFile(){files=new Map([...files,['emoji/recovered.webp',new Blob(['recovered'],{type:'image/webp'})]]);await act(async()=>{local=await save(local,local,'recovered file',files);root.render(React.createElement(Harness));});},async attach(){const d=copy(local);d.tables.media.push({id:'file',bulletId:'a',fileName:'x.bin',mimeType:'application/octet-stream',sourceUrl:'',credit:'',licenseUrl:''});files=new Map([['media/x.bin',new Blob(['attachment'],{type:'application/octet-stream'})]]);await act(async()=>{local=await save(local,d,'attachment',files);root.render(React.createElement(Harness));});},set intercept(f){intercept=f;},set online(value){online=value;},set canApply(value){canApply=value;},async sync(){await act(async()=>result.sync());},async edit(fn){const d=copy(local);fn(d);await act(async()=>{local=await save(local,d,'edit');root.render(React.createElement(Harness));});},async reload(){await act(async()=>root.unmount());local=await load();await mount();},async close(){await act(async()=>root.unmount());globalThis.fetch=originalFetch;setStorageAccount(null);sqlite.close();dom.window.close();}};
}
async function remoteEdit(f,fn){const response=await(await f.send('GET','/sync/v2')).json(),y=openShared(response.update),before=project(y).doc,next=copy(before),v=vector(y);fn(next);applyIntent(y,before,next);return {operationId:crypto.randomUUID(),update:delta(y,v),vector:vector(y)};}

test('legacy Android edits and desktop edits migrate automatically into rich-text operations',async()=>{
 const f=await fixture();try{
  await f.edit(d=>d.tables.bullets[0].text='Learn SQL phone.');const remote=copy(f.base);remote.tables.bullets[0].text='Learn SQL desktop.';
  await f.send('PUT','/workspace',{baseRevision:1,doc:cloudDocument(remote),assets:[]});await f.sync();
  assert.equal(f.result.error,'');assert.match(f.result.status,/Synced/);assert.match(f.doc.tables.bullets[0].text,/phone/);assert.match(f.doc.tables.bullets[0].text,/desktop/);
  assert.equal(f.result.resolve,undefined);
 }finally{await f.close();}
});

test('lost response retries the same persisted batch while later edits remain queued',async()=>{
 const f=await fixture();try{
  await f.sync();await f.edit(d=>d.tables.bullets[0].text='First phone edit');
  f.intercept=async perform=>{await perform();throw TypeError('Connection lost after commit');};await f.sync();
  const first=await syncMetadata();assert.ok(first.inflight);const id=first.inflight.operationId;
  await f.edit(d=>d.tables.bullets[1].text='Second phone edit');await f.reload();assert.equal((await syncMetadata()).inflight.operationId,id);
  await f.sync();await until(()=>f.result.status==='Synced');
  const meta=await syncMetadata();assert.equal(meta.pending.length,0);assert.equal(meta.inflight,null);assert.equal(f.doc.tables.bullets[1].text,'Second phone edit');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM sync_journal WHERE operation_id!='__seed__'").get().n,2);
 }finally{await f.close();}
});

test('offline edits survive a browser reload and upload automatically on reconnect',async()=>{
 const f=await fixture();try{
  await f.sync();f.online=false;await f.edit(d=>d.tables.bullets[0].text='Saved offline');const count=f.fetches;await f.sync();assert.equal(f.fetches,count);assert.equal(f.result.error,'');
  await f.reload();assert.equal(f.doc.tables.bullets[0].text,'Saved offline');assert.ok((await syncMetadata()).pending.length);
  f.online=true;await act(async()=>window.dispatchEvent(new window.Event('online')));await until(()=>f.result.status==='Synced');
  assert.equal(project(openShared((await(await f.send('GET','/sync/v2')).json()).update)).doc.tables.bullets[0].text,'Saved offline');
 }finally{await f.close();}
});

test('same-node concurrent rich-text changes converge without a conflict decision',async()=>{
 const f=await fixture();try{
  await f.sync();const remote=await remoteEdit(f,d=>d.tables.bullets[0].text='Learn SQL laptop.');
  await f.edit(d=>d.tables.bullets[0].text='Learn SQL phone.');await f.send('POST','/sync/v2',remote);await f.sync();
  assert.equal(f.result.conflict,false);assert.equal(f.result.error,'');assert.equal(f.result.status,'Synced');
  assert.match(f.doc.tables.bullets[0].text,/laptop/);assert.match(f.doc.tables.bullets[0].text,/phone/);
 }finally{await f.close();}
});

test('edits during a network request cannot be acknowledged or discarded with an earlier batch',async()=>{
 const f=await fixture();try{
  await f.sync();await f.edit(d=>d.tables.bullets[0].text='Before request');
  f.intercept=async perform=>{await f.edit(d=>d.tables.bullets[1].text='During request');return perform();};await f.sync();await until(()=>f.result.status==='Synced');
  assert.equal(f.doc.tables.bullets[0].text,'Before request');assert.equal(f.doc.tables.bullets[1].text,'During request');assert.equal((await syncMetadata()).pending.length,0);
 }finally{await f.close();}
});

test('composition defers visual updates while text operations continue syncing, then adopts both edits',async()=>{
 const f=await fixture();try{
  await f.sync();f.canApply=false;const remote=await remoteEdit(f,d=>d.tables.bullets[0].text='Learn SQL laptop.');await f.send('POST','/sync/v2',remote);
  await f.sync();assert.match(f.result.status,/pending/);assert.equal(f.result.error,'');
  await f.edit(d=>d.tables.bullets[0].text='Learn SQL phone.');await f.sync();assert.match(f.result.status,/pending/);
  f.canApply=true;await f.sync();assert.equal(f.result.status,'Synced');assert.match(f.doc.tables.bullets[0].text,/laptop/);assert.match(f.doc.tables.bullets[0].text,/phone/);
 }finally{await f.close();}
});

test('quota failures retain a durable pending batch and never falsely report Synced',async()=>{
 const f=await fixture();try{await f.sync();await f.edit(d=>d.tables.bullets[0].text='Pending');f.intercept=async()=>Response.json({error:'Workspace limit reached'},{status:413});await f.sync();assert.match(f.result.status,/pending/);assert.match(f.result.error,/limit/);assert.ok((await syncMetadata()).pending.length);}finally{await f.close();}
});


test('an acknowledged attachment is uploaded once rather than on every later text edit',async()=>{
 const f=await fixture();try{await f.sync();await f.attach();await f.sync();assert.equal(f.result.status,'Synced',JSON.stringify({error:f.result.error,uploads:f.uploads}));assert.equal(f.uploads,1);await f.edit(d=>d.tables.bullets[0].text='Edited after attachment');await f.sync();assert.equal(f.result.status,'Synced');assert.equal(f.uploads,1);}finally{await f.close();}
});


test('a cloud response cannot discard an emoji file restored after the outgoing manifest was staged',async()=>{
 const f=await fixture();try{
  await f.sync();const remote=await remoteEdit(f,d=>{d.tables.bullets[0].text='Remote edit';});await f.send('POST','/sync/v2',remote);
  f.intercept=async perform=>{const response=await perform();await f.cacheFile();return response;};
  await f.sync();assert.ok(f.files.has('emoji/recovered.webp'),'A late local asset must survive cloud adoption');
  await f.sync();assert.ok(f.files.has('emoji/recovered.webp'));assert.equal(f.uploads,1);
  const response=await(await f.send('GET','/sync/v2')).json(),d=openShared(response.update);assert.ok(project(d).assets.some(a=>a.path==='emoji/recovered.webp'));d.destroy();
 }finally{await f.close();}
});
