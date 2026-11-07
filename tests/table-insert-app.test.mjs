import {installOverlayGlobals} from './dom-overlays.mjs';import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import 'fake-indexeddb/auto';import {act} from 'react';
import {empty,withNodes,save,load,researchStore,setStorageAccount} from './.build/data.mjs';import {bullet} from '../src/domain.mjs';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Node','DOMParser','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,key,{value:key==='getComputedStyle'?dom.window[key].bind(dom.window):dom.window[key],configurable:true});installOverlayGlobals(dom);globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.ResizeObserver=undefined;globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});HTMLElement.prototype.scrollTo=()=>{};window.Range.prototype.getClientRects=()=>[];window.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0,width:0,height:0});
const wait=async fn=>{for(let i=0;i<150;i++){if(await fn())return;await act(()=>new Promise(r=>setTimeout(r,20)));}assert.fail('App did not settle');};const click=async el=>act(async()=>{assert.ok(el);el.click();});
test('Insert table opens a size picker, creates a sized table with editable cells and visible add controls',async()=>{
 await save(null,withNodes(empty(),[bullet('note',{text:'Trip plan'}),bullet('empty',{position:1,text:''})]));let app;
 try{await act(async()=>{app=await import('./.build/app.mjs');});await wait(()=>document.querySelector('[data-node-id="note"]'));
  await click(document.querySelector('[data-node-id="note"] [aria-label="Bullet actions"]'));await wait(()=>document.querySelector('.bullet-actions-menu'));
  await click([...document.querySelectorAll('.bullet-actions-menu button')].find(x=>x.textContent.trim().startsWith('Insert')));const insert=[...document.querySelectorAll('.bullet-actions-menu button')].find(b=>b.textContent.trim().endsWith('Insert table'));assert.ok(insert,'Insert table is in the Insert section');
  await click(insert);await wait(()=>document.querySelector('.table-picker[role="dialog"]'));
  await click(document.querySelector('[aria-label="2 columns, 3 rows"]'));await wait(()=>document.querySelector('.note-table'));
  assert.equal(document.querySelectorAll('.note-table tbody tr').length,3);assert.equal(document.querySelectorAll('.note-table tbody tr:first-child td').length,2,'the two columns from the picker');
  assert.ok(document.querySelector('[aria-label="Add column"]')||document.querySelector('[aria-label="Add row"]'),'add controls are on the table');
  assert.equal(document.querySelector('.table-picker'),null,'picker closes after insertion');
 }finally{if(app)await act(async()=>app.appRoot.unmount());dom.window.close();}
});
