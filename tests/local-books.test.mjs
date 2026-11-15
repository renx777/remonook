import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act,useState} from 'react';
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
await build({stdin:{contents:"export * from './src/local-books';export * from './src/book-client';export * from './src/book-cache';export * from './src/data-store';export * from './src/workspaces';export {BookStorage} from './src/BookStorage';export {registerBooks} from './src/book-storage.mjs';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,packages:'external',outfile:'tests/.build/local-books.mjs',format:'esm',platform:'node',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'auth',setup(b){b.onResolve({filter:/^\.\/(CloudAccount|cloud-config)$/},a=>({path:a.path,namespace:'auth'}));b.onLoad({filter:/.*/,namespace:'auth'},a=>({contents:a.path==='./CloudAccount'?"export const authenticatedUid=()=> 'alice';":"export const CLOUD_API='https://books.test';"}));}}]});
const dom=new JSDOM('<div id="root"></div>',{url:'https://local.test',pretendToBeVisual:true});for(const k of ['window','document','navigator','HTMLElement','Node','Element','CustomEvent','localStorage'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
window.HTMLAnchorElement.prototype.click=()=>{};URL.createObjectURL=()=> 'blob:test';URL.revokeObjectURL=()=>{};
const {createRoot}=await import('react-dom/client'),m=await import('./.build/local-books.mjs');
const wait=async check=>{for(let i=0;i<150;i++){if(check())return;await act(()=>new Promise(r=>setTimeout(r,10)));}throw Error('Timed out');};
const originalFetch=globalThis.fetch;
const file=()=>new File(['%PDF-1.7\nlocal original'],'book.pdf',{type:'application/pdf'});

test('offline local import, reader bytes, duplicate reimport, backup and restore keep originals without cloud requests',async()=>{
 m.setStorageName('remo-web-local-bookstest01');Object.defineProperty(navigator,'onLine',{value:false,configurable:true});let doc=m.empty(),requests=0;globalThis.fetch=async()=>{requests++;throw Error('Local books must not use cloud storage');};
 function Host(){const [value,set]=useState(doc);doc=value;return React.createElement(m.BookStorage,{user:null,doc:value,disabled:false,onChange:update=>set(update),onSignIn:async()=>assert.fail('No login'),onRead:()=>{}});}
 const root=createRoot(document.querySelector('#root'));
 const add=async f=>act(async()=>{const input=document.querySelector('[type=file]');Object.defineProperty(input,'files',{value:[f],configurable:true});input.dispatchEvent(new window.Event('change',{bubbles:true}));});
 try{
  await act(()=>root.render(React.createElement(Host)));assert.equal(document.querySelector('[type=file]').disabled,false);await add(file());await wait(()=>document.querySelector('.book-library li')&&!document.querySelector('.book-library button').disabled);
  const book=Object.values(doc.web.readingBooks)[0];assert.equal(book.format,'pdf');const first=await m.loadReadingFile(null,book,new AbortController().signal);assert.equal(await first.blob.text(),await file().text());
  await add(file());await wait(()=>document.querySelector('[role=status]')?.textContent.includes('offline'));assert.equal(Object.values(doc.web.readingBooks).length,1);
  const archive=await m.archive(doc,new Map()),restored=await m.parseArchive(archive);assert.equal(restored.assets.has(m.bookPath(book)),true);
  const zip=await JSZip.loadAsync(archive);assert.ok(zip.file(m.bookPath(book)));
  m.setStorageName('remo-web-local-bookstest02');await assert.rejects(m.loadReadingFile(null,book,new AbortController().signal),/not available/);
  await m.restoreLocalBook(restored.doc,m.storageAccountKey(),m.bookPath(book),restored.assets.get(m.bookPath(book)));
  assert.equal(await (await m.loadReadingFile(null,book,new AbortController().signal)).blob.text(),await file().text());
  await assert.rejects(m.restoreLocalBook(restored.doc,m.storageAccountKey(),m.bookPath(book),new Blob(['corrupt'])),/integrity/);
  assert.equal(await (await m.loadReadingFile(null,book,new AbortController().signal)).blob.text(),await file().text());assert.equal(requests,0);
 }finally{await act(()=>root.unmount());globalThis.fetch=originalFetch;m.setStorageAccount(null);}
});

test('failed original storage never adds library metadata or makes a cloud request',async()=>{
 m.setStorageName('remo-web-local-bookstest03');let doc=m.empty();const root=createRoot(document.querySelector('#root'));globalThis.fetch=async()=>assert.fail('No cloud request');
 function Host(){const [value,set]=useState(doc);doc=value;return React.createElement(m.BookStorage,{user:null,doc:value,disabled:false,onChange:update=>set(update),onSignIn:async()=>{}});}
 try{
  await act(()=>root.render(React.createElement(Host)));const original=indexedDB.open.bind(indexedDB);indexedDB.open=(name,...rest)=>{if(name.startsWith('remo-books-'))throw new DOMException('No room','QuotaExceededError');return original(name,...rest);};
  try{await act(async()=>{const input=document.querySelector('[type=file]');Object.defineProperty(input,'files',{value:[file()],configurable:true});input.dispatchEvent(new window.Event('change',{bubbles:true}));});await wait(()=>document.querySelector('[role=alert]'));assert.equal(doc.web.readingBooks,undefined);}finally{indexedDB.open=original;}
 }finally{await act(()=>root.unmount());globalThis.fetch=originalFetch;m.setStorageAccount(null);}
});

test('deleting a device-only workspace removes its original cache without touching another workspace',async()=>{
 const a=m.createLocalWorkspace('Local A'),b=m.createLocalWorkspace('Local B');await m.cachedBook(m.localBookScope(m.workspaceStorageName(a)),'original',file());await m.cachedBook(m.localBookScope(m.workspaceStorageName(b)),'original',file());await m.deleteLocalWorkspace(a.id);assert.equal(await m.cachedBook(m.localBookScope(m.workspaceStorageName(a)),'original'),undefined);assert.ok(await m.cachedBook(m.localBookScope(m.workspaceStorageName(b)),'original'));
});
