import {installOverlayGlobals} from './dom-overlays.mjs';import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import 'fake-indexeddb/auto';import {act} from 'react';
import {empty,withNodes,save,load,researchStore,setStorageAccount} from './.build/data.mjs';import {bullet} from '../src/domain.mjs';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Node','DOMParser','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,key,{value:key==='getComputedStyle'?dom.window[key].bind(dom.window):dom.window[key],configurable:true});installOverlayGlobals(dom);globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.ResizeObserver=undefined;globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});HTMLElement.prototype.scrollTo=()=>{};window.Range.prototype.getClientRects=()=>[];window.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0,width:0,height:0});
const wait=async fn=>{for(let i=0;i<150;i++){if(await fn())return;await act(()=>new Promise(r=>setTimeout(r,20)));}assert.fail('App did not settle');};const click=async el=>act(async()=>{assert.ok(el);el.click();});
test('quick access opens study tools, moves between rail and bar, collapses, and page titles are not repeated',async()=>{
 await save(null,withNodes(empty(),[bullet('a',{text:'First note'})]));let app;
 try{await act(async()=>{app=await import('./.build/app.mjs');});await wait(()=>document.querySelector('[data-node-id="a"]'));
  const bar=()=>document.querySelector('nav.quick-access');
  assert.ok(bar().classList.contains('is-bar'),'starts under the top bar');
  assert.ok(document.querySelector('h1.page-title-hidden'),'the root page heading is for screen readers only');
  const tool=label=>[...bar().querySelectorAll('.quick-access-item')].find(b=>b.textContent.includes(label)||b.getAttribute('aria-label')?.startsWith(label));
  await click(tool('Mindmaps'));await wait(()=>document.querySelector('.mindmap-library'));
  assert.equal(document.querySelector('.mindmap-library h1').className,'page-title-hidden');
  assert.equal(tool('Mindmaps').getAttribute('aria-current'),'page');
  await click(tool('Flashcards'));await wait(()=>document.querySelector('.study-desk'));
  await click(bar().querySelector('.quick-access-grip'));await wait(()=>bar()?.classList.contains('is-rail'));
  assert.equal(JSON.parse(window.localStorage.getItem('remo-quick-access')).placement,'rail');
  await click(bar().querySelector('.quick-access-hide'));await wait(()=>document.querySelector('.quick-access-reveal'));assert.equal(bar(),null);
  await click(document.querySelector('.quick-access-reveal'));await wait(()=>bar());assert.ok(bar().classList.contains('is-rail'));
  await click(tool('Bookmarks'));await wait(()=>document.querySelector('.bookmark-library'));
 }finally{if(app)await act(async()=>app.appRoot.unmount());dom.window.close();}
});
