import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {route} from '../cloud/worker.mjs';
import {empty} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';
import {cloudDocument,contentKey} from '../src/cloud-model.mjs';

// Exercise the actual React sync hook and actual SQLite-backed Worker routes.
// Only auth and device persistence are replaced to model a separate browser.
await build({entryPoints:['src/useCloudSync.ts'],bundle:true,packages:'external',outfile:'tests/.build/sync-hook.mjs',format:'esm',platform:'node',plugins:[{name:'device-fixture',setup(b){
 b.onResolve({filter:/^\.\/(CloudAccount|cloud-config|data)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='./CloudAccount'?`export const authenticatedUid=()=> 'alice';`:a.path==='./cloud-config'?`export const CLOUD_API='https://sync.test';`:`
 const state=()=>globalThis.__syncDevice;
 export async function cloudCheckpoint(value){if(value!==undefined)state().checkpoint=structuredClone(value);return state().checkpoint;}
 export async function keepCloudRecovery(value){state().recovery=structuredClone(value);}
 export async function getCloudRecovery(){return state().recovery;}
 export async function digest(buffer){return Buffer.from(await crypto.subtle.digest('SHA-256',buffer)).toString('hex');}
 export async function archive(){return new Blob();} export function download(){}
 `}));
}}]});
const {useCloudSync}=await import('./.build/sync-hook.mjs');
const copy=structuredClone;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<180;i++){if(check())return;await act(()=>pause(15));}assert.fail('Timed out waiting for sync');}
async function fixture({legacy=false,checkpoint=true}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://remonook.com',pretendToBeVisual:true});
 for(const key of ['window','document','navigator'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;Object.defineProperty(navigator,'onLine',{value:true});
 const base=empty();base.tables.bullets=[bullet('a',{text:'A'}),bullet('b',{text:'B',position:1})];
 const state=globalThis.__syncDevice={doc:copy(base),checkpoint:checkpoint?{revision:1,key:legacy?JSON.stringify(cloudDocument(base)):contentKey(base),...(!legacy?{baseDoc:cloudDocument(base),assets:[]}:{} )}:null,canApply:true};
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('cloud/schema.sql','utf8'));
 const env={DB:{prepare(sql){let args;return{bind(...a){args=a;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},async run(){return sqlite.prepare(sql).run(...args);}};}}};
 const send=async(method,path,body,headers={})=>route(new Request('https://sync.test'+path,{method,headers:new Headers(Object.keys(headers).length?headers:{Authorization:'Bearer alice'}),...(body?{body:JSON.stringify(body)}:{})}),env,async()=> 'alice');
 await send('PUT','/workspace',{baseRevision:0,doc:cloudDocument(base),assets:[]});
 let beforePut=null,beforeGet=null,putCount=0,notModified=0;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,init={})=>{
  if(init.method==='PUT'&&new URL(url).pathname==='/workspace'){putCount++;if(beforePut){const f=beforePut;beforePut=null;await f();}}
  if(!init.method&&beforeGet){const f=beforeGet;beforeGet=null;await f();}
  try{const r=await send(init.method||'GET',new URL(url).pathname,init.body?JSON.parse(init.body):undefined,Object.fromEntries(new Headers(init.headers)));if(r.status===304)notModified++;return r;}
  catch(e){return Response.json({error:e.message},{status:e.status||500});}
 };
 let result;
 function Harness(){result=useCloudSync({user:{uid:'alice',getIdToken:async()=> 'token'},ready:true,revision:state.doc.revision,get:()=>({doc:state.doc,assets:new Map()}),flush:async()=>{},canApply:()=>state.canApply,apply:async doc=>{state.doc=copy(doc);}});return null;}
 const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(Harness)));
 return {state,base,send,get result(){return result;},get putCount(){return putCount;},get notModified(){return notModified;},set beforeGet(fn){beforeGet=fn;},set beforePut(fn){beforePut=fn;},async sync(){await act(async()=>result.sync());},async close(){await act(async()=>root.unmount());globalThis.fetch=originalFetch;dom.window.close();sqlite.close();}};
}

test('Android with a legacy checkpoint automatically merges independent desktop and phone edits',async()=>{
 const f=await fixture({legacy:true});try{
  f.state.doc.tables.bullets[1].text='Phone';const desktop=copy(f.base);desktop.tables.bullets[0].text='Desktop';
  await f.send('PUT','/workspace',{baseRevision:1,doc:cloudDocument(desktop),assets:[]});await f.sync();
  assert.equal(f.result.conflict,false);assert.equal(f.result.error,'');assert.match(f.result.status,/Synced/);
  assert.deepEqual(f.state.doc.tables.bullets.map(n=>n.text),['Desktop','Phone']);assert.equal(f.state.checkpoint.revision,3);
 }finally{await f.close();}
});

test('revision race automatically refetches and retries without dropping the third device edit',async()=>{
 const f=await fixture();try{
  f.state.doc.tables.bullets[1].text='Phone';
  f.beforePut=async()=>{const d=copy(f.base);d.tables.bullets.push(bullet('c',{text:'Tablet',position:2}));await f.send('PUT','/workspace',{baseRevision:1,doc:cloudDocument(d),assets:[]});};
  await f.sync();await until(()=>f.state.checkpoint.revision===3);
  assert.equal(f.putCount,2);assert.equal(f.result.conflict,false);
  assert.deepEqual(f.state.doc.tables.bullets.map(n=>n.text),['A','Phone','Tablet']);
 }finally{await f.close();}
});

test('overlapping text exposes the note reason, preserves both sides, and a retry can clear a resolved conflict',async()=>{
 const f=await fixture();try{
  f.state.doc.tables.bullets[0].text='Phone';const remote=copy(f.base);remote.tables.bullets[0].text='Desktop';
  await f.send('PUT','/workspace',{baseRevision:1,doc:cloudDocument(remote),assets:[]});await f.sync();
  assert.equal(f.result.conflict,true);assert.match(f.result.conflictDetails.join(' '),/Phone.*text or formatting/);assert.equal(f.putCount,0);
  assert.equal(f.state.doc.tables.bullets[0].text,'Phone');
  f.state.doc=copy(remote);await f.sync();assert.equal(f.result.conflict,false);assert.equal(f.state.checkpoint.revision,2);
 }finally{await f.close();}
});

test('a new browser with identical notes establishes a baseline without unnecessary conflict',async()=>{
 const f=await fixture({checkpoint:false});try{await f.sync();assert.equal(f.result.conflict,false);assert.equal(f.state.checkpoint.revision,1);assert.equal(f.putCount,0);}finally{await f.close();}
});


test('unchanged polls use 304 and edits arriving during the poll stay pending and upload',async()=>{
 const f=await fixture();try{
  await f.sync();assert.equal(f.notModified,1);assert.equal(f.putCount,0);
  f.beforeGet=async()=>{f.state.doc.tables.bullets[1].text='Typed during poll';};
  await f.sync();assert.match(f.result.status,/pending/);
  await until(()=>f.state.checkpoint.revision===2);
  assert.equal(f.state.doc.tables.bullets[1].text,'Typed during poll');assert.equal(f.putCount,1);
 }finally{await f.close();}
});
