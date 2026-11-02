import {installOverlayGlobals} from './dom-overlays.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import 'fake-indexeddb/auto';
import {act} from 'react';
import {empty,withNodes,save,load} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';

const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Node','DOMParser','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,key,{value:key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key],configurable:true});
installOverlayGlobals(dom);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.ResizeObserver=undefined;
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
HTMLElement.prototype.scrollTo=function({top=0}){this.scrollTop=top;};
window.Range.prototype.getClientRects=()=>[];
window.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0,width:0,height:0});
const click=async(selector,options={})=>act(async()=>{const el=document.querySelector(selector);assert.ok(el,selector);el.dispatchEvent(new window.MouseEvent('click',{bubbles:true,...options}));});
const stored=async()=>{await act(async()=>new Promise(resolve=>setTimeout(resolve,250)));return load();};
const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await act(async()=>new Promise(resolve=>setTimeout(resolve,20)));}throw Error('Timed out waiting for outline');};

test('selection toolbar indents, outdents and toggles tasks across the selection',async()=>{
 await save(null,withNodes(empty(),[bullet('a',{text:'First'}),bullet('b',{position:1,text:'Second'}),bullet('c',{position:2,text:'Third'})]));
 let app;
 const tasks=doc=>Object.fromEntries(doc.tables.bullets.map(n=>[n.id,n.taskState]));
 const parents=doc=>Object.fromEntries(doc.tables.bullets.map(n=>[n.id,n.parentId]));
 try{
  await act(async()=>{app=await import('./.build/app.mjs');});await wait(()=>document.querySelector('[data-node-id="a"]'));
  await click('[data-node-id="a"] .text-button',{ctrlKey:true});
  await click('[data-node-id="b"] .text-button',{ctrlKey:true});
  assert.equal(document.querySelector('[aria-label="Toggle task"]').getAttribute('aria-pressed'),'false');
  await click('[aria-label="Toggle task"]');
  assert.equal(document.querySelector('[aria-label="Toggle task"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(tasks(await stored()),{a:'TODO',b:'TODO',c:'NONE'});
  await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'9',code:'Digit9',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true})));
  assert.deepEqual(tasks(await stored()),{a:'NONE',b:'NONE',c:'NONE'},'Ctrl+Shift+9 clears tasks on the selection');
  await click('[aria-label="Indent selected"]');
  assert.deepEqual(parents(await stored()),{a:null,b:'a',c:null});
  await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',code:'Tab',bubbles:true,cancelable:true})));
  assert.deepEqual(parents(await stored()),{a:null,b:'a',c:null},'A branch selection moves as one: Tab does not re-indent a child whose parent is selected');
  await click('[data-node-id="a"] .text-button',{ctrlKey:true});
  await click('[data-node-id="b"] .text-button',{ctrlKey:true});
  await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',code:'Tab',shiftKey:true,bubbles:true,cancelable:true})));
  assert.deepEqual(parents(await stored()),{a:null,b:null,c:null},'Shift+Tab outdents the remaining selection back to the top level');
  await click('[aria-label="Deselect"]');
 }finally{if(app)await act(async()=>app.appRoot.unmount());dom.window.close();}
});
