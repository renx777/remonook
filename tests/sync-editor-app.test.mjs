import {pathToFileURL} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import 'fake-indexeddb/auto';
import {empty,save,cloudCheckpoint,setStorageAccount} from './.build/data.mjs';
import {contentKey} from '../src/cloud-model.mjs';
import {bullet} from '../src/domain.mjs';
import {openShared,project,applyIntent,vector,delta} from '../src/sync-crdt.mjs';
import {route} from '../cloud/worker.mjs';
await build({entryPoints:['src/main.tsx'],bundle:true,packages:'external',outfile:'tests/.build/sync-app.mjs',format:'esm',platform:'node',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env.PROD':'true'},plugins:[{name:'signed-in-fixture',setup(b){
 b.onResolve({filter:/^\.\/data$/},()=>({path:pathToFileURL(resolve('tests/.build/data.mjs')).href,external:true}));
 b.onResolve({filter:/^\.\/(CloudAccount|cloud-config)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='./CloudAccount'?`export const authenticatedUid=()=> 'alice';export const openAccountSignIn=async()=>{};export const switchWorkspace=async()=>{};export const AccountSecurity=()=>null;export const googleSignOut=async()=>{};export const setAccountTransitionHandler=()=>()=>{};const user={uid:'alice',email:'test@example.invalid',getIdToken:async()=> 'token'};export function AuthGate({children}){return children(user);}`:`export const CLOUD_API='https://sync.test';export const APP_ENV='test';`}));
}}]});

import {applyDocument,mergeUpdates,projectBuckets} from '../src/sync-buckets.mjs';
import {syncSpaces} from './helpers/sync-space.mjs';
async function serverStates(send){let states=new Map(),since=0,after='',target='';for(;;){const r=await(await send('GET',`/sync/v3?since=${since}&after=${after}&target=${target}`)).json();states=mergeUpdates(states,r.updates);if(!r.more)return states;after=r.after||'';target=r.target||'';if(!r.after)since=r.revision;}}
test('the real focused Tiptap editor receives remote text, keeps its caret, and continues syncing new typing',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://remonook.com/#app',pretendToBeVisual:true});
 for(const k of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLSelectElement','Node','DOMParser','MutationObserver','getComputedStyle','Range'])Object.defineProperty(globalThis,k,{value:k==='getComputedStyle'?dom.window[k].bind(dom.window):dom.window[k],configurable:true});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);globalThis.ResizeObserver=undefined;
 HTMLElement.prototype.scrollTo=function({top=0}){this.scrollTop=top;};
 Range.prototype.getClientRects=()=>[];Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0,width:0,height:0});
 setStorageAccount('sync-editor-'+crypto.randomUUID());const base=empty();base.web.studyVersion=2;base.tables.bullets=[bullet('a',{text:'Learn SQL.'})];let local=await save(null,base,'initial');await cloudCheckpoint({revision:1,key:contentKey(local),baseDoc:local,assets:[]});
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('cloud/schema.sql','utf8'));
 const env={SYNC_SPACE:null,DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},run(){return{success:true,meta:{changes:sqlite.prepare(sql).run(...args).changes}};}};},async batch(statements){sqlite.exec('BEGIN');try{const out=statements.map(s=>s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}}};
 env.SYNC_SPACE=syncSpaces(env);
 const send=(method,path,body,headers={})=>route(new Request('https://sync.test'+path,{method,headers:new Headers(Object.keys(headers).length?headers:{Authorization:'Bearer alice'}),...(body?{body:JSON.stringify(body)}:{})}),env,async()=> 'alice');
 await send('PUT','/workspace',{baseRevision:0,doc:base,assets:[]});
 const originalFetch=globalThis.fetch;globalThis.fetch=async(url,init={})=>{try{return await send(init.method||'GET',new URL(url).pathname,init.body?JSON.parse(init.body):undefined,Object.fromEntries(new Headers(init.headers)));}catch(e){return Response.json({error:e.message},{status:e.status||500});}};
 const until=async check=>{for(let i=0;i<250;i++){if(await check())return;await act(()=>new Promise(r=>setTimeout(r,20)));}assert.fail('Timed out');};
 let app;
 try{
  await act(async()=>{app=await import('./.build/sync-app.mjs');});
  await until(()=>document.querySelector('.save-status')?.title.includes('Cloud: Synced'));
  await act(async()=>document.querySelector('[data-node-id="a"] .text-button').dispatchEvent(new window.MouseEvent('click',{bubbles:true})));
  await until(()=>document.querySelector('.tiptap')?.editor?.isFocused);const editor=document.querySelector('.tiptap').editor;
  await act(async()=>editor.commands.setTextSelection(6));assert.equal(editor.isFocused,true);
  const states=await serverStates(send),before=projectBuckets(states).doc,next=structuredClone(before),prefix='From laptop: ';
  next.tables.bullets[0].text=prefix+next.tables.bullets[0].text;
  await send('POST','/sync/v3',{operationId:crypto.randomUUID(),updates:applyDocument(states,before,next,{clientID:424242}).updates,since:0});
  await act(async()=>document.dispatchEvent(new window.Event('visibilitychange')));
  await until(()=>editor.getText().startsWith(prefix));assert.equal(editor.isFocused,true);assert.equal(editor.state.selection.anchor,6+prefix.length);
  await act(async()=>editor.commands.insertContent('typed '));
  await until(async()=>projectBuckets(await serverStates(send)).doc.tables.bullets[0].text.includes('typed '));
  await until(()=>document.querySelector('.save-status')?.title.includes('Cloud: Synced'));
  assert.equal(document.querySelector('button[aria-label="Undo"]').disabled,false,'Acknowledging the local edit must preserve its undo step');
  await act(async()=>document.querySelector('button[aria-label="Undo"]').click());
  await until(async()=>{const text=projectBuckets(await serverStates(send)).doc.tables.bullets[0].text;return text.startsWith(prefix)&&!text.includes('typed ');});
  await act(async()=>document.querySelector('button[aria-label="Redo"]').click());
  await until(async()=>projectBuckets(await serverStates(send)).doc.tables.bullets[0].text.includes('typed '));
  assert.match(editor.getText(),/From laptop/);assert.equal(document.querySelector('.recovery-screen'),null);
 }finally{if(app)await act(async()=>app.appRoot.unmount());globalThis.fetch=originalFetch;setStorageAccount(null);sqlite.close();dom.window.close();}
});
