import {installOverlayGlobals} from './dom-overlays.mjs';import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import 'fake-indexeddb/auto';import {act} from 'react';
import {empty,withNodes,save,load,researchStore,setStorageAccount} from './.build/data.mjs';import {addBookmark,bookmarkNote} from '../src/bookmarks.mjs';import {bullet} from '../src/domain.mjs';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Node','DOMParser','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,key,{value:key==='getComputedStyle'?dom.window[key].bind(dom.window):dom.window[key],configurable:true});installOverlayGlobals(dom);globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.ResizeObserver=undefined;globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});HTMLElement.prototype.scrollTo=()=>{};window.Range.prototype.getClientRects=()=>[];window.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0,width:0,height:0});
const wait=async fn=>{for(let i=0;i<150;i++){if(await fn())return;await act(()=>new Promise(r=>setTimeout(r,20)));}assert.fail('App did not settle');};const click=async el=>act(async()=>{assert.ok(el);el.click();});
const key=async(value,extra={})=>act(async()=>{const el=document.querySelector('.tiptap');assert.ok(el);el.dispatchEvent(new window.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true,...extra}));});
const stored=async()=>{await act(()=>new Promise(r=>setTimeout(r,300)));return load();};
const row=id=>document.querySelector(`[data-node-id="${id}"]`);
test('Notes keeps ordinary decks visible and never navigates or indents into a hidden shared bookmark',async()=>{
 let doc=withNodes(empty(),[bullet('first',{text:'First note'}),bullet('ml',{text:'Machine Learning',position:1,collapsed:true}),bullet('q',{parentId:'ml',text:'Types of learning?',kind:'QUESTION'})]);
 doc.tables.decks=[{id:'deck',rootId:'ml',name:'Machine Learning'}];
 const added=addBookmark(doc,'https://notebooklm.link.google/jbk38RPjAKAC');
 const captured=bookmarkNote(added.doc,added.bookmark,added.bookmark.url,'link');doc=captured;
 const source=doc.web.bookmarkNoteRoots[added.bookmark.id];
 const retained=doc.tables.bullets.filter(n=>n.id===source||n.parentId===source).sort((a,b)=>a.id.localeCompare(b.id));
 await save(null,doc);let app;
 try{
  await act(async()=>{app=await import('./.build/app.mjs');});await wait(()=>row('ml'));
  assert.equal(row(source),null);assert.equal(row('q'),null,'collapsed study children stay collapsed');
  await click(row('ml').querySelector('.text-button'));await key('Escape');
  assert.ok(row('ml'),'deck stays visible after blur');
  const add=async()=>{await click(document.querySelector('[aria-label="Add bullet"]'));await wait(()=>document.querySelector('.tiptap')?.textContent==='');return document.querySelector('.tiptap').closest('[data-node-id]').dataset.nodeId;};
  const blank=await add();await key('Backspace');await wait(()=>!row(blank));
  assert.ok(row('ml').querySelector('.tiptap'),'Backspace focuses the visible deck page');assert.equal(row(source),null);
  let written=await stored();assert.deepEqual(written.tables.bullets.filter(n=>n.id===source||n.parentId===source).sort((a,b)=>a.id.localeCompare(b.id)),retained);
  await key('z',{ctrlKey:true});await wait(()=>row(blank));
  const newRow=row(blank);await click(newRow.querySelector('.text-button')||newRow.querySelector('.tiptap'));
  await key('Tab');written=await stored();
  assert.equal(written.tables.bullets.find(n=>n.id===blank).parentId,'ml','Tab uses the preceding visible sibling');
  assert.equal(row(source),null);assert.deepEqual(written.tables.bullets.filter(n=>n.id===source||n.parentId===source).sort((a,b)=>a.id.localeCompare(b.id)),retained);
  await key('z',{ctrlKey:true});await stored();
  const current=row(blank);await click(current.querySelector('.text-button')||current.querySelector('.tiptap'));await key('ArrowUp');
  await wait(()=>row('ml')?.querySelector('.tiptap'));assert.equal(row(source),null);
  await key('ArrowDown');await wait(()=>row(blank)?.querySelector('.tiptap'));assert.equal(row(source),null);
  await key('Escape');assert.ok(row('ml'));
  const nav=name=>[...document.querySelectorAll('.sidebar nav button')].find(el=>el.textContent.trim().startsWith(name));
  await click(nav('Bookmarks'));await click(document.querySelector('.outline-view-toggle'));await wait(()=>row(source));
  assert.ok(row('link'),'shared link remains accessible in its dedicated outline');
 }finally{if(app)await act(async()=>app.appRoot.unmount());dom.window.close();}
});
