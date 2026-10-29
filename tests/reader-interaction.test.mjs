import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act,useState} from 'react';
await build({stdin:{contents:"export {BookReader} from './src/BookReader';export {empty} from './src/data';export {registerBooks} from './src/book-storage.mjs';export {selectedPassage} from './src/reader-selection';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,packages:'external',outfile:'tests/.build/reader-interaction.mjs',format:'esm',platform:'node',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'reader-fixture',setup(b){
 b.onResolve({filter:/^\.\/(book-client|pdf-runtime|PdfPage)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'tsx',resolveDir:process.cwd(),contents:a.path==='./book-client'?"export const loadReadingFile=async(user,book)=>({book,blob:new Blob(['pdf'])});":a.path==='./pdf-runtime'?"export const openPdf=async()=>({promise:Promise.resolve({numPages:2}),destroy(){}});":`import React,{useEffect} from 'react';export function PdfPage({unit,zoom,containerRef,onReady,onLoading,overlay}){useEffect(()=>{onLoading();onReady();},[unit,zoom]);return <div className="reader-pdf-page" ref={containerRef}><div className="reader-selectable">A passage worth keeping. Another sentence.</div>{overlay}</div>;}`}));
}}]});
const dom=new JSDOM('<button id="origin">Open book</button><div id="root"></div>',{url:'https://staging.remonook.com',pretendToBeVisual:true});
for(const k of ['window','document','navigator','HTMLElement','Node','Element'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
window.HTMLElement.prototype.scrollTo=()=>{};window.HTMLElement.prototype.scrollIntoView=()=>{};
window.HTMLElement.prototype.getBoundingClientRect=()=>({left:0,top:0,right:600,bottom:800,width:600,height:800});
window.Range.prototype.getClientRects=()=>[{left:60,top:80,right:300,bottom:100,width:240,height:20}];
const {createRoot}=await import('react-dom/client'),{BookReader,empty,registerBooks,selectedPassage}=await import('./.build/reader-interaction.mjs');
const hash='a'.repeat(64),book={id:crypto.randomUUID(),hash,title:'Test book',name:'test.pdf',format:'pdf',size:3,createdAt:1,position:0,deleted:false},user={uid:'alice'};
const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await act(async()=>new Promise(r=>setTimeout(r,20)));}throw Error('Timed out');};
const pause=()=>act(async()=>new Promise(r=>setTimeout(r,220)));
const button=label=>document.querySelector(`[aria-label="${label}"]`);
const select=async(start,end)=>{await act(async()=>{const node=document.querySelector('.reader-selectable').firstChild,range=document.createRange();range.setStart(node,start);range.setEnd(node,end);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);document.dispatchEvent(new window.Event('selectionchange'));});};
test('reader captures only a completed selection, saves comments, clears stale selection and keeps page controls usable',async()=>{
 let doc,closed=false;const root=createRoot(document.querySelector('#root'));document.querySelector('#origin').focus();
 function Host(){const [value,setValue]=useState(()=>registerBooks(empty(),[book]));doc=value;return React.createElement(BookReader,{user,doc:value,target:{hash},disabled:false,onChange:update=>setValue(update),onClose:()=>{closed=true;},onNote:()=>{}});}
 try{
  await act(async()=>root.render(React.createElement(Host)));await wait(()=>document.querySelector('.reader-selectable')&&!button('Next page or passage').disabled);
  const yellow=()=>button('Highlight yellow and save to notes');assert.equal(yellow().disabled,true);assert.equal(document.querySelector('textarea'),null);assert.ok(!document.querySelector('[aria-label="Highlight selected passage"]'));
  const text=document.querySelector('.reader-selectable');await act(async()=>text.dispatchEvent(new window.Event('pointerdown',{bubbles:true})));await select(0,9);await pause();assert.equal(yellow().disabled,true,'Do not offer a partial passage while dragging');
  await act(async()=>document.dispatchEvent(new window.Event('pointerup')));await wait(()=>!yellow().disabled);
  await act(async()=>document.querySelector('.reader-comment-toggle').click());const comment=document.querySelector('textarea');await act(async()=>{comment.focus();Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(comment,'My thought');comment.dispatchEvent(new window.Event('input',{bubbles:true}));});await pause();assert.equal(yellow().disabled,false,'Typing must retain the selected passage');
  await act(async()=>yellow().click());await wait(()=>Object.keys(doc.web.readingHighlights||{}).length===1);assert.equal(Object.values(doc.web.readingHighlights)[0].quote,'A passage');assert.ok(doc.tables.bullets.some(n=>n.text==='My thought'));assert.equal(yellow().disabled,true);
  document.querySelector('.reader-scroll').focus();await select(10,15);await wait(()=>!yellow().disabled);await act(async()=>{window.getSelection().removeAllRanges();document.dispatchEvent(new window.Event('selectionchange'));});await wait(()=>yellow().disabled);
  await select(10,15);await wait(()=>!yellow().disabled);await act(async()=>button('Next page or passage').click());await wait(()=>button('Go to page or passage').value==='2');assert.equal(yellow().disabled,true,'Navigation invalidates the old page selection');
  await act(async()=>button('Larger text or zoom in').click());await wait(()=>button('Reset zoom to fit width').textContent==='120%');await act(async()=>button('Reset zoom to fit width').click());assert.equal(button('Reset zoom to fit width').textContent,'100%');
  await act(async()=>button('Close reader').click());assert.equal(closed,true);
 }finally{await act(async()=>root.unmount());}assert.equal(document.activeElement.id,'origin');
});
test('PDF selection validates visible rectangles and ignores selections outside the page',()=>{
 const host=document.createElement('div');host.textContent='Readable passage';document.body.append(host);const range=document.createRange();range.selectNodeContents(host);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
 assert.equal(selectedPassage(document.querySelector('#root'),0),null);assert.equal(selectedPassage(host,0,host).quote,'Readable passage');
 const rects=window.Range.prototype.getClientRects;window.Range.prototype.getClientRects=()=>[];assert.equal(selectedPassage(host,0,host),null);window.Range.prototype.getClientRects=rects;selection.removeAllRanges();host.remove();
});
