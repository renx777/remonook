import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import 'fake-indexeddb/auto';
import {empty,save,load,getAssets,setStorageAccount} from './.build/data.mjs';
import {getNotoEmoji,notoPosterPath,NOTO_CREDIT_PATH} from '../src/noto-emojis.mjs';
import {bullet} from '../src/domain.mjs';
import {seed,sharedState,project,openShared} from '../src/sync-crdt.mjs';
import {initializeOutbox,stageAssets,recordLocal} from '../src/sync-outbox.mjs';
await build({entryPoints:['src/useEmojiAssetRepair.ts'],bundle:true,packages:'external',outfile:'tests/.build/emoji-repair.mjs',format:'esm',platform:'node'});
const {useEmojiAssetRepair}=await import('./.build/emoji-repair.mjs');

test('an incomplete browser cache never deletes cloud files for registered emojis',()=>{
 const doc=empty(),item=getNotoEmoji(':noto_1f680:');doc.tables.emojis=[item];doc.tables.bullets=[bullet('a',{text:item.token})];
 const assets=[{path:'emoji/'+item.fileName,hash:'a',size:1,type:'image/webp'},{path:notoPosterPath(item),hash:'b',size:1,type:'image/svg+xml'}];
 const y=seed(doc,assets),state=sharedState(y);y.destroy();const meta=initializeOutbox(state,1,null,doc,[]);
 stageAssets(meta,[]);let d=openShared(meta.localState);assert.deepEqual(project(d).assets,[...assets].sort((a,b)=>a.path.localeCompare(b.path)));d.destroy();assert.equal(meta.pending.length,0);
 const removed=structuredClone(doc);removed.tables.emojis=[];recordLocal(meta,removed);stageAssets(meta,[]);d=openShared(meta.localState);assert.deepEqual(project(d).assets,[]);d.destroy();
});

test('missing saved Noto files recover on reconnect, persist without changing notes, and stop fetching once complete',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://repair.test',pretendToBeVisual:true});
 for(const k of ['window','document','navigator'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;let online=false;Object.defineProperty(navigator,'onLine',{get:()=>online,configurable:true});
 setStorageAccount('emoji-repair-'+crypto.randomUUID());const item=getNotoEmoji(':noto_1f680:'),doc=empty();doc.tables.emojis=[{token:item.token,fileName:item.fileName,label:item.label}];doc.tables.bullets=[bullet('a',{text:'Keep this '+item.token})];let saved=await save(null,doc,'initial'),requests=[];
 const originalFetch=globalThis.fetch;globalThis.fetch=async url=>{requests.push(String(url));return new Response(await readFile(new URL(`./fixtures/noto/1f680.${String(url).endsWith('webp')?'webp':'svg'}`,import.meta.url)));};
 let renderAgain;function Harness(){const [assets,setAssets]=useState(new Map()),[,tick]=useState(0);renderAgain=()=>tick(v=>v+1);useEmojiAssetRepair({emojis:doc.tables.emojis,assets,ready:true,store:async(_item,recovered)=>{saved=await save(saved,saved,'emoji repair',recovered);setAssets(new Map([...assets,...recovered]));}});return null;}
 const root=createRoot(document.getElementById('root'));
 try{
  await act(async()=>root.render(React.createElement(Harness)));await act(()=>new Promise(r=>setTimeout(r,150)));assert.equal(requests.length,0);
  online=true;await act(async()=>window.dispatchEvent(new window.Event('online')));
  for(let i=0;i<100;i++){if((await getAssets()).has(NOTO_CREDIT_PATH))break;await act(()=>new Promise(r=>setTimeout(r,10)));}
  const files=await getAssets();assert.ok(files.has('emoji/'+item.fileName));assert.ok(files.has(notoPosterPath(item)));assert.ok(files.has(NOTO_CREDIT_PATH));assert.equal((await load()).tables.bullets[0].text,'Keep this '+item.token);assert.equal(requests.length,2);
  await act(async()=>{renderAgain();window.dispatchEvent(new window.Event('focus'));});await act(()=>new Promise(r=>setTimeout(r,150)));assert.equal(requests.length,2,'Completed assets must not redownload on every render or focus');
  assert.ok(requests.every(url=>url.startsWith('https://fonts.gstatic.com/s/e/notoemoji/latest/1f680/')));
 }finally{await act(async()=>root.unmount());globalThis.fetch=originalFetch;setStorageAccount(null);dom.window.close();}
});
