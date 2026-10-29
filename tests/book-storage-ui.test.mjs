import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act,useState} from 'react';
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
await build({stdin:{contents:"export {BookStorage} from './src/BookStorage';export {cachedBook} from './src/book-cache';export {inspectBook} from './src/book-files';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,packages:'external',outfile:'tests/.build/book-ui.mjs',format:'esm',platform:'node',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^\.\/(CloudAccount|cloud-config)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='./CloudAccount'?"export const authenticatedUid=()=> 'alice';":"export const CLOUD_API='https://books.test';"}));}}]});
const dom=new JSDOM('<div id="root"></div>',{url:'https://staging.remonook.com',pretendToBeVisual:true});for(const k of ['window','document','navigator','HTMLElement','Node','Element'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;window.HTMLAnchorElement.prototype.click=()=>{};URL.createObjectURL=()=> 'blob:test';URL.revokeObjectURL=()=>{};
const {createRoot}=await import('react-dom/client'),{BookStorage,cachedBook,inspectBook}=await import('./.build/book-ui.mjs');
const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await act(async()=>new Promise(r=>setTimeout(r,10)));}throw Error('Timed out');};
test('book cache isolates accounts and supports offline copies without entering ordinary assets',async()=>{
 const blob=new Blob(['private book']);await cachedBook('alice','book',blob);assert.equal(await(await cachedBook('alice','book')).text(),'private book');assert.equal(await cachedBook('bob','book'),undefined);await cachedBook('alice','book',null);assert.equal(await cachedBook('alice','book'),undefined);
 await assert.rejects(inspectBook(new File(['not pdf'],'book.pdf')),/PDF header/);
 await assert.rejects(inspectBook(new File(['not zip'],'book.epub')),/valid, unencrypted EPUB/);
 const zip=new JSZip();zip.file('mimetype','application/epub+zip');zip.file('META-INF/container.xml','<container/>');const epub=new File([await zip.generateAsync({type:'uint8array'})],'book.epub');assert.equal(await inspectBook(epub),'epub');
});
test('Settings loads metadata only, uploads once, caches on demand and deletes only through explicit action',async()=>{
 const original=globalThis.fetch,calls=[];let stored=[],metadata;window.confirm=()=>true;
 globalThis.fetch=async(url,options={})=>{const path=new URL(url).pathname;calls.push([options.method||'GET',path]);
  if(path==='/storage')return Response.json({attachments:1024,books:stored.length*14,total:1024+stored.length*14,limit:100*1024*1024,uploadsEnabled:true});
  if(path==='/books'&&options.method==='POST'){const b=JSON.parse(options.body);return Response.json({book:{...b,format:'pdf',createdAt:Date.now()},state:'pending'});}
  if(path==='/books')return Response.json({books:stored});
  if(options.method==='PUT'){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await options.body.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');stored=[{id:path.split('/').at(-1),name:'book.pdf',format:'pdf',size:options.body.size,hash,createdAt:Date.now()}];return Response.json({state:'ready',book:stored[0]});}
  if(options.method==='DELETE'){stored=[];return Response.json({deleted:true});}
  throw Error('Unexpected book binary request on settings load');
 };
 function Host(){const [doc,onDoc]=useState({web:{}});metadata=doc;return React.createElement(BookStorage,{user:{uid:'alice',getIdToken:async()=> 'token'},doc,disabled:false,onChange:update=>onDoc(update),onSignIn:async()=>{}});}
 const root=createRoot(document.querySelector('#root'));
 try{
  await act(async()=>root.render(React.createElement(Host)));await wait(()=>document.querySelector('input')&&!document.querySelector('input').disabled);assert.deepEqual(calls.map(c=>c[1]).sort(),['/books','/storage']);
  const file=new File(['%PDF-1.7\nfixture'],'book.pdf',{type:'application/pdf'});
  await act(async()=>{const input=document.querySelector('input');Object.defineProperty(input,'files',{value:[file],configurable:true});input.dispatchEvent(new window.Event('change',{bubbles:true}));input.dispatchEvent(new window.Event('change',{bubbles:true}));});
  await wait(()=>document.querySelector('.book-library li'));assert.equal(calls.filter(c=>c[0]==='PUT').length,1);assert.equal(Object.keys(metadata.web.readingBooks).length,1);
  const download=[...document.querySelectorAll('button')].find(b=>b.textContent==='Download');await act(async()=>download.click());await wait(()=>!download.disabled);assert.equal(calls.filter(c=>c[0]==='GET'&&c[1].startsWith('/books/')).length,0,'cached download avoids transferring the binary');
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Delete').click());await wait(()=>!document.querySelector('.book-library li'));assert.equal(Object.values(metadata.web.readingBooks)[0].deleted,true);
 }finally{await act(async()=>root.unmount());globalThis.fetch=original;}
});
