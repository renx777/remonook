import {installOverlayGlobals} from './dom-overlays.mjs';import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import 'fake-indexeddb/auto';import {act} from 'react';
import {empty,withNodes,save,load,researchStore,setStorageAccount} from './.build/data.mjs';import {bullet} from '../src/domain.mjs';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Node','DOMParser','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,key,{value:key==='getComputedStyle'?dom.window[key].bind(dom.window):dom.window[key],configurable:true});installOverlayGlobals(dom);globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.ResizeObserver=undefined;globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});HTMLElement.prototype.scrollTo=()=>{};window.Range.prototype.getClientRects=()=>[];window.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0,width:0,height:0});
const wait=async fn=>{for(let i=0;i<150;i++){if(await fn())return;await act(()=>new Promise(r=>setTimeout(r,20)));}assert.fail('App did not settle');};const click=async el=>act(async()=>{assert.ok(el);el.click();});

const row=id=>document.querySelector(`[data-node-id="${id}"]`);
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
const input=async(label,value)=>act(async()=>{const el=document.querySelector(`[aria-label="${label}"]`);assert.ok(el,label);Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}));});
test('a nested template insertion from the bullet menu is one undo step',async()=>{
 const initial=withNodes(empty(),[bullet('project',{text:'A project'}),bullet('existing',{parentId:'project',text:'Keep this child'})]);await save(null,initial);let app;
 try{
  await act(async()=>{app=await import('./.build/app.mjs')});await wait(()=>row('project'));
  await click(row('project').querySelector('[aria-label="Bullet actions"]'));await wait(()=>button('Use note template…'));await click(button('Use note template…'));
  await wait(()=>document.querySelector('[aria-label="Template title"]'));await input('Template title','Weekly meeting');await click(button('Use template'));
  await wait(async()=>(await load()).tables.bullets.some(n=>n.text.startsWith('Weekly meeting')));let saved=await load();const added=saved.tables.bullets.length-2;
  assert.ok(added>0);assert.equal(saved.tables.bullets.find(n=>n.text.startsWith('Weekly meeting')).parentId,'project');assert.ok(saved.tables.bullets.some(n=>n.id==='existing'));
  await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'z',code:'KeyZ',ctrlKey:true,bubbles:true,cancelable:true})));
  await wait(async()=>(await load()).tables.bullets.length===2);saved=await load();assert.deepEqual(saved.tables.bullets.map(n=>n.id).sort(),['existing','project'],'undo removes only the template insertion');
 }finally{if(app)await act(async()=>app.appRoot.unmount());dom.window.close();}
});
