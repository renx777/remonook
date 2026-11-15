import {installOverlayGlobals} from './dom-overlays.mjs';import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import 'fake-indexeddb/auto';import {act} from 'react';
import {empty,withNodes,save,load,researchStore,setStorageAccount} from './.build/data.mjs';import {bullet} from '../src/domain.mjs';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Node','DOMParser','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,key,{value:key==='getComputedStyle'?dom.window[key].bind(dom.window):dom.window[key],configurable:true});installOverlayGlobals(dom);globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.ResizeObserver=undefined;globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});HTMLElement.prototype.scrollTo=()=>{};window.Range.prototype.getClientRects=()=>[];window.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0,width:0,height:0});
const wait=async fn=>{for(let i=0;i<150;i++){if(await fn())return;await act(()=>new Promise(r=>setTimeout(r,20)));}assert.fail('App did not settle');};const click=async el=>act(async()=>{assert.ok(el);el.click();});
test('Notes filter shows whole flashcard bullets editable in place, and a two-finger swipe moves between views',async()=>{
 await save(null,withNodes(empty(),[bullet('ml',{text:'Machine Learning'}),bullet('q',{parentId:'ml',text:'What is overfitting?',kind:'QUESTION'}),bullet('a',{parentId:'q',text:'Memorising training data'}),bullet('other',{parentId:'ml',position:1,text:'Plain note'})]));let app;
 try{await act(async()=>{app=await import('./.build/app.mjs');});await wait(()=>document.querySelector('[data-node-id="ml"]'));
  const tabs=()=>[...document.querySelectorAll('.notes-filter [role="tab"]')];
  assert.deepEqual(tabs().map(t=>t.textContent),['All','Notes','📅Calendar','🃏Flashcards'],'All, Notes and Calendar stay available; other filters show when populated');
  await act(async()=>{tabs()[0].focus();tabs()[0].dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));});
  assert.equal(tabs()[1].getAttribute('aria-selected'),'true');assert.equal(document.querySelector('[data-node-id="q"]'),null,'arrow navigation activates Notes');
  await click(tabs().find(t=>t.textContent.includes('Flashcards')));await wait(()=>!document.querySelector('[data-node-id="other"]'));
  assert.ok(document.querySelector('[data-node-id="q"]'),'the flashcard bullet is shown');
  assert.ok(document.querySelector('[data-node-id="a"]'),'with its children');
  assert.equal(document.querySelector('[data-node-id="ml"]'),null,'its parent page is not');
  assert.equal(tabs().find(t=>t.textContent.includes('Flashcards')).getAttribute('aria-selected'),'true');
  await click(tabs().find(t=>t.textContent.startsWith('Notes')));await wait(()=>document.querySelector('[data-node-id="other"]'));
  assert.ok(document.querySelector('[data-node-id="ml"]'));assert.equal(document.querySelector('[data-node-id="q"]'),null);assert.equal(document.querySelector('[data-node-id="a"]'),null);
  await click(tabs().find(t=>t.textContent.includes('Calendar')));await wait(()=>document.querySelector('.notes-filter-empty'));assert.match(document.querySelector('.notes-filter-empty').textContent,/No calendar entries/);
  await click(tabs()[0]);await wait(()=>document.querySelector('[data-node-id="other"]'));
  await click(document.querySelector('[aria-label="Account: not signed in"]'));await wait(()=>document.querySelector('.profile-menu'));
  assert.match(document.querySelector('.profile-menu').textContent,/Notes stay on this device only/);assert.ok([...document.querySelectorAll('.profile-menu button')].some(b=>b.textContent==='Sign in or create account'));
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  const outline=document.querySelector('.outline-scroll');
  for(let i=0;i<3;i++)await act(async()=>outline.dispatchEvent(new window.WheelEvent('wheel',{deltaX:80,deltaY:0,bubbles:true})));
  await wait(()=>document.querySelector('.study-desk'));
  assert.match(document.querySelector('.view-dots').textContent,/Study Desk/);
 }finally{if(app)await act(async()=>app.appRoot.unmount());dom.window.close();}
});
