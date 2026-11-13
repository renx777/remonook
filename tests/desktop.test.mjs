import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
await build({entryPoints:['src/desktop.ts'],bundle:true,format:'esm',platform:'node',outfile:'tests/.build/desktop.mjs',logLevel:'silent'});
const d=await import('./.build/desktop.mjs');

test('desktop Google sign-in: the page only relays to a loopback port with the app state',()=>{
 const state='a'.repeat(48);
 assert.deepEqual(d.desktopSignInRequest(`?port=53123&state=${state}`),{port:53123,state});
 for(const bad of [`?port=80&state=${state}`,`?port=70000&state=${state}`,'?port=53123&state=short',`?port=53123&state=${'g'.repeat(48)}`,'?state='+state,''])assert.equal(d.desktopSignInRequest(bad),null,bad);
 const url=new URL(d.desktopCallback(53123,state,'h.p.s'));
 assert.equal(url.origin,'http://127.0.0.1:53123');assert.equal(url.pathname,'/callback');
 assert.equal(url.searchParams.get('state'),state);assert.equal(url.searchParams.get('id_token'),'h.p.s');
 assert.equal(d.desktopSignInSite('production'),'https://remonook.com');assert.equal(d.desktopSignInSite('staging'),'https://staging.remonook.com');
 assert.equal(d.isDesktop(),false,'not in the desktop app under Node');
});

test('desktop retires obsolete service worker shells without deleting user caches or storage',async()=>{
 const keys=['window','navigator','caches','location'],before=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));let unregistered=0,reloaded=0;const removed=[];
 try{
  Object.defineProperty(globalThis,'window',{configurable:true,value:{__TAURI_INTERNALS__:{invoke:async()=>{}},caches:true}});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{controller:{},getRegistrations:async()=>[{unregister:async()=>{unregistered++;}}]}}});
  Object.defineProperty(globalThis,'caches',{configurable:true,value:{keys:async()=>['remo-shell-old','remo-reader-assets','local-book-originals','another-cache'],delete:async k=>{removed.push(k);return true;}}});
  Object.defineProperty(globalThis,'location',{configurable:true,value:{reload:()=>{reloaded++;}}});
  await d.retireDesktopOfflineShell();assert.equal(unregistered,1);assert.equal(reloaded,0,'cleanup must never interrupt an edit with a reload');assert.deepEqual(removed,['remo-shell-old','remo-reader-assets']);
  navigator.serviceWorker.controller=null;await d.retireDesktopOfflineShell();assert.equal(reloaded,0,'an already clean desktop must not reload');
 }finally{for(const key of keys){const descriptor=before.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});

test('Android app: counts as the app but not as the desktop app; desktop stays desktop',()=>{
 const keys=['window','navigator'],before=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const as=(ua,app)=>{Object.defineProperty(globalThis,'window',{configurable:true,value:app?{__TAURI_INTERNALS__:{invoke:async()=>{}}}:{}});Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:ua}});return [d.isApp(),d.isDesktop(),d.isMobileApp()];};
 try{
  assert.deepEqual(as('Mozilla/5.0 (Linux; Android 15; CPH2621) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36',true),[true,false,true]);
  assert.deepEqual(as('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/140',true),[true,true,false]);
  assert.deepEqual(as('Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile Safari/537.36',false),[false,false,false],'the website on a phone is not the app');
 }finally{for(const key of keys){const v=before.get(key);if(v)Object.defineProperty(globalThis,key,v);else delete globalThis[key];}}
});
